// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * The search index of the documentation's units (#649, #1319): everything shared by the server,
 * which builds the MiniSearch index once, and the browser, which loads the same JSON and queries
 * it. No Node import here: this module is bundled for the browser.
 *
 * The index and the query must use the same options, so they live in one constant
 * (DOC_INDEX_OPTIONS), passed to `new MiniSearch(...)` on the server and to
 * `MiniSearch.loadJSON(...)` in the browser. The fields: the title, the words of the slug, every
 * « ## » / « ### » heading, the summary, and the distinct words of the body (Markdown stripped,
 * never the full text).
 */

import type { Options, Query, SearchOptions } from "minisearch"
import { createHeadingSlugger } from "@/lib/heading-anchors"
import type { DocUnit } from "@/lib/doc-units"

// ---------------------------------------------------------------------------------------------
// Normalisation, tokenisation and terms
// ---------------------------------------------------------------------------------------------

/**
 * Lower case, without accents (NFD, then the combining marks removed), typographic apostrophes as
 * straight ones, runs of spaces as one: « Créneau » and « creneau » compare equal.
 */
export function normalizeForSearch(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[’ʼ‘]/g, "'")
    .replace(/\s+/g, " ")
    .trim()
}

/**
 * The words of a text, normalised. A word is a run of letters or digits, with internal hyphens
 * kept (« j-1 », « J-2 », « jour-j ») so a compound reads as one word; apostrophes separate
 * (« l'événement » gives « l » and « evenement »). The slug is the exception: its hyphens separate
 * words, so field « slug » is tokenised word by word.
 */
export function tokenize(text: string, fieldName?: string): string[] {
  const normalized = normalizeForSearch(text)
  if (normalized === "") return []
  const pattern = fieldName === "slug" ? /[\p{L}\p{N}]+/gu : /[\p{L}\p{N}]+(?:-[\p{L}\p{N}]+)*/gu
  return normalized.match(pattern) ?? []
}

/**
 * French words that a query can leave out without changing what it asks for: articles, pronouns,
 * prepositions, conjunctions, auxiliaries and modals, common adverbs and connectors, vague
 * quantifiers, a few generic verbs, and the elided fragments the tokenizer keeps (« l », « qu »).
 * About two hundred words, the ones readers type most in a question.
 */
const FRENCH_STOP_WORDS = [
  // Articles and determiners.
  "le", "la", "les", "l", "un", "une", "des", "de", "du", "d", "au", "aux",
  "ce", "cet", "cette", "ces", "mon", "ma", "mes", "ton", "ta", "tes", "son", "sa", "ses",
  "notre", "nos", "votre", "vos", "leur", "leurs",
  // Pronouns.
  "je", "j", "tu", "te", "t", "il", "elle", "on", "nous", "vous", "ils", "elles",
  "me", "m", "se", "s", "y", "en", "lui", "eux", "moi", "toi", "soi", "c",
  "qui", "que", "qu", "quelqu", "quoi", "dont", "ou", "quel", "quelle", "quels", "quelles",
  "lequel", "laquelle", "lesquels", "lesquelles", "celui", "celle", "ceux", "celles",
  "ceci", "cela", "ca", "quiconque",
  // Prepositions.
  "a", "dans", "par", "pour", "sans", "sur", "sous", "avec", "chez", "entre", "vers",
  "depuis", "pendant", "avant", "apres", "hors", "lors", "jusque", "jusqu", "sauf",
  "selon", "malgre", "contre", "parmi", "autour", "devant", "derriere", "pres", "loin",
  // Conjunctions and connectors.
  "et", "mais", "donc", "or", "ni", "car", "si", "quand", "lorsque", "lorsqu",
  "puisque", "parce", "comme", "ainsi", "alors", "aussi", "encore", "deja", "enfin",
  "ensuite", "cependant", "pourtant", "neanmoins", "toutefois", "sinon", "toujours",
  "jamais", "souvent", "parfois", "rarement", "tres", "trop", "bien", "mal", "vite",
  "ici", "voici", "voila", "comment", "pourquoi", "combien",
  // Auxiliaries and modals.
  "ai", "as", "avons", "avez", "ont", "avait", "avaient", "aura", "auront", "aurait",
  "auraient", "avoir", "eu", "eue", "eus", "eues",
  "est", "sont", "etais", "etait", "etions", "etaient", "etre", "ete", "sera", "seront",
  "serais", "serait", "serions", "seraient",
  "peut", "peux", "peuvent", "pouvons", "pouvez", "pouvais", "pouvait", "pouvions",
  "pouvaient", "pourra", "pourront", "pourrais", "pourrait", "pourraient",
  "doit", "dois", "doivent", "devons", "devez", "devais", "devait", "devions",
  "devaient", "devra", "devront", "devrait", "devraient",
  "faut", "fallait", "faudra", "faudrait", "va", "vas", "vont", "allait", "allaient",
  "ira", "iront", "irait", "iraient", "aller",
  // Vague quantifiers.
  "chaque", "plusieurs", "quelques", "autre", "autres", "meme", "memes", "certain",
  "certaine", "certains", "certaines", "aucun", "aucune", "tel", "telle", "tels",
  "telles", "tout", "tous", "toute", "toutes",
  // Generic verbs.
  "voir", "vois", "voit", "voyons", "voyez", "voient",
  "fait", "fais", "font", "faisons", "faites",
  "dit", "dis", "disent", "disons", "dites",
  "donne", "donnes", "donnent", "donnons", "donnez",
  "met", "mets", "mettent", "mettons", "mettez",
  "prend", "prends", "prennent", "prenons", "prenez",
  "reste", "restes", "restent", "restons", "restez",
] as const

const STOP_WORDS = new Set<string>(FRENCH_STOP_WORDS)

/**
 * The fictional first and last names used in the guides' examples (Léa, Camille Rochat, Aline…):
 * they identify nobody and make no useful search term, so both index and query drop them.
 */
const DEMO_NAMES = new Set([
  "aline", "zoe", "luc", "paul", "martin", "dubois", "rochat", "lea", "julien", "camille",
  "emma", "noah", "marc", "anne", "favre", "johansson", "elodie", "alice",
])

/** Whether a normalised word is a French stop word, or a compound of them (« est-ce »). */
export function isSearchStopWord(word: string): boolean {
  if (STOP_WORDS.has(word)) return true
  const parts = word.split("-")
  return parts.length > 1 && parts.every((part) => STOP_WORDS.has(part))
}

/**
 * A light French stemmer: the plural « s » / « x », then one common ending, keeping at least four
 * letters. It makes « rappel » meet « rappels », « supprimer » meet « supprimé » and
 * « confirme » meet « confirmée ». A few verb/noun pairs alternate more than a suffix
 * (« supprimer » / « suppression », « inscrire » / « inscription »): STEM_ALIASES brings their
 * stems together.
 */
const STEM_SUFFIXES = [
  "issements", "issement", "ations", "ation", "itions", "ition", "utions", "ution",
  "tions", "tion", "sions", "sion", "ements", "ement", "ments", "ment", "euses", "euse", "eurs", "eur",
  "ances", "ance", "ences", "ence", "ites", "ite", "ees", "ee", "es",
  "er", "ez", "ent", "ant", "ons", "ais", "ait", "aient", "e",
]

const STEM_ALIASES: Record<string, string> = {
  suppres: "supprim",
  suppress: "supprim",
  confirme: "confirm",
  inscrip: "inscri",
  inscrir: "inscri",
  inscrit: "inscri",
  desinscrip: "desinscri",
  desinscrir: "desinscri",
  desinscrit: "desinscri",
}

/** The stem of a normalised word (stemForSearch). */
export function stemForSearch(word: string): string {
  let stem = normalizeForSearch(word)
  if (/(s|x)$/.test(stem) && stem.length - 1 >= 4) stem = stem.slice(0, -1)
  for (const suffix of STEM_SUFFIXES) {
    if (!stem.endsWith(suffix)) continue
    const cut = stem.slice(0, -suffix.length)
    if (cut.length < 4) continue
    stem = cut
    break
  }
  return STEM_ALIASES[stem] ?? stem
}

/** A synonym of a processed term: a word, or a phrase whose terms must all match. */
type DocSynonym = string | { phrase: readonly string[] }

/**
 * The house vocabulary's synonyms (#1319, docs/vocabulaire.md), keyed by the processed term
 * (stemForSearch) and holding the words to search instead. « mdp » is a phrase: « mot de passe »
 * requires both « mot » and « passe ».
 */
const DOC_SYNONYMS: Record<string, readonly DocSynonym[]> = {
  membr: ["benevole"],
  benevol: ["membre"],
  mail: ["email", "courriel"],
  email: ["mail", "courriel"],
  courriel: ["mail", "email"],
  creneau: ["horaire", "plage"],
  horair: ["creneau", "plage"],
  plag: ["creneau", "horaire"],
  post: ["role"],
  role: ["poste"],
  supprim: ["effacer"],
  effac: ["supprimer"],
  desinscri: ["annuler"],
  desist: ["annuler"],
  mdp: [{ phrase: ["mot", "passe"] }],
  // « mot de passe perdu » is the common wording for the guides' « mot de passe oublié ».
  perdu: ["oublie"],
  agenda: ["calendrier"],
}

/** The words of a query, normalised and without stop words, one-letter tokens, numbers or demo names. */
export function searchTerms(query: string): string[] {
  return searchWordsOf(normalizeForSearch(query)).filter(isSearchableWord)
}

/** A normalised word worth searching (not a stop word, a single letter, a number or a demo name). */
function isSearchableWord(word: string): boolean {
  return word.length > 1 && !isSearchStopWord(word) && !DEMO_NAMES.has(word) && !/^\d+$/.test(word)
}

/** The processed terms of a query (searchTerms then processTerm), for tests and callers that need them. */
export function docQueryTerms(query: string): string[] {
  return searchTerms(query)
    .map((term) => processTerm(term))
    .filter((term): term is string => typeof term === "string" && term !== "")
}

/**
 * A token as the index and the query keep it: stop words, one-letter tokens, pure numbers and the
 * guides' demo names are dropped, then the light French stem is returned. « j-1 », « a4 » and
 * « 12h » stay whole; a bare « 12 » goes.
 */
export function processTerm(term: string): string | null {
  const word = normalizeForSearch(term)
  if (!isSearchableWord(word)) return null
  return stemForSearch(word)
}

/** The normalised words of a text, before stop-word and term filtering. */
function searchWordsOf(text: string): string[] {
  return text.match(/[\p{L}\p{N}]+(?:-[\p{L}\p{N}]+)*/gu) ?? []
}

// ---------------------------------------------------------------------------------------------
// Matching a term to a word (the client's fallback while the index loads)
// ---------------------------------------------------------------------------------------------

/** Whether two normalised words are at most one typo apart (Damerau-Levenshtein ≤ 1). */
export function isOneTypoApart(a: string, b: string): boolean {
  if (a === b) return true
  if (Math.abs(a.length - b.length) > 1) return false
  if (a.length === b.length) {
    const differences: number[] = []
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) differences.push(i)
    if (differences.length === 1) return true
    if (differences.length === 2) {
      const [i, j] = differences
      return j === i + 1 && a[i] === b[j] && a[j] === b[i]
    }
    return false
  }
  const [longer, shorter] = a.length > b.length ? [a, b] : [b, a]
  for (let i = 0; i < longer.length; i++) {
    if (longer.slice(0, i) + longer.slice(i + 1) === shorter) return true
  }
  return false
}

/** The keys a term or a word matches by: itself, its stem, and the house synonyms' stems. */
function searchKeys(word: string): Set<string> {
  const cached = searchKeysCache.get(word)
  if (cached) return cached
  const keys = computeSearchKeys(word)
  searchKeysCache.set(word, keys)
  return keys
}

/** searchKeys by word: the index's words are stemmed once, not on every keystroke. */
const searchKeysCache = new Map<string, Set<string>>()

function computeSearchKeys(word: string): Set<string> {
  const keys = new Set<string>()
  const add = (value: string) => {
    keys.add(value)
    keys.add(stemForSearch(value))
  }
  add(word)
  const stem = stemForSearch(word)
  for (const synonym of [...(DOC_SYNONYMS[word] ?? []), ...(DOC_SYNONYMS[stem] ?? [])]) {
    if (typeof synonym === "string") add(synonym)
  }
  return keys
}

/**
 * Whether a query term matches a normalised word of the title, a heading or the summary: equal,
 * same stem, one of the house synonyms, the start of the word when the term has four letters or
 * more, or one typo when it has six. This is the fallback used until the MiniSearch index arrives;
 * it never searches the body.
 */
export function searchTermMatchesWord(term: string, word: string): boolean {
  if (term === word) return true
  const termKeys = searchKeys(term)
  const wordKeys = searchKeys(word)
  for (const key of termKeys) if (wordKeys.has(key)) return true
  if (term.length >= 4 && word.startsWith(term)) return true
  if (term.length >= 6 && isOneTypoApart(term, word)) return true
  return false
}

// ---------------------------------------------------------------------------------------------
// The index's fields: headings, body words and documents
// ---------------------------------------------------------------------------------------------

/** A heading of a unit's page: its text, and the id its heading renders with (the link's fragment). */
export type DocSection = { text: string; id: string }

/** A question of a unit's page: a « ### » heading (DocSection). */
export type DocQuestion = DocSection

/**
 * A heading's Markdown as plain text: links keep their text, an image keeps its alt text (as the
 * rendered heading's id does), emphasis and code marks are dropped, raw HTML tags are dropped. It
 * is what the page's heading renders (and slugs).
 */
function plainHeading(markdown: string): string {
  return markdown
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/!\[([^\]]*)\]\[[^\]]*\]/g, "$1")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]*)\]\[[^\]]*\]/g, "$1")
    .replace(/<[^>]*>/g, "")
    .replace(/[*_`]/g, "")
    .trim()
}

/** A heading of a unit's Markdown, with the depth it is written at. */
type DocHeading = DocSection & { level: number }

/**
 * The « ## » and « ### » headings of a unit's Markdown, with their ids, in page order. Every
 * heading goes through one slugger, whatever its depth, as the unit's page renders them
 * (src/lib/event-page-markdown.ts), so a repeated heading gets the same « -2 » suffix; a test
 * checks these ids against the rendered page. Fenced code is skipped.
 */
function docUnitHeadings(markdown: string): DocHeading[] {
  const headings: DocHeading[] = []
  const slug = createHeadingSlugger()
  let fenced = false
  for (const line of markdown.split("\n")) {
    if (/^\s*(```|~~~)/.test(line)) fenced = !fenced
    if (fenced) continue
    const match = line.match(/^(#{1,6})\s+(.+?)\s*#*\s*$/)
    if (!match) continue
    const text = plainHeading(match[2])
    const id = slug(text)
    const level = match[1].length
    if ((level === 2 || level === 3) && text !== "") headings.push({ text, id, level })
  }
  return headings
}

/** The « ## » and « ### » headings of a unit's Markdown, with their ids (the links' fragments). */
export function docUnitSections(markdown: string): DocSection[] {
  return docUnitHeadings(markdown).map(({ text, id }) => ({ text, id }))
}

/**
 * The « ### » headings of a unit's Markdown, with their ids: the questions readers ask (« Je ne
 * veux pas oublier mon créneau le jour J »). The ids are the ones the page renders.
 */
export function docUnitQuestionAnchors(markdown: string): DocQuestion[] {
  return docUnitHeadings(markdown)
    .filter(({ level }) => level === 3)
    .map(({ text, id }) => ({ text, id }))
}

/** The « ### » headings of a unit's Markdown, as plain text (docUnitQuestionAnchors without the ids). */
export function docUnitQuestions(markdown: string): string[] {
  return docUnitQuestionAnchors(markdown).map((q) => q.text)
}

/**
 * The body's Markdown as plain text: fenced code out, images (and their alt text) out, links kept
 * for their text, raw HTML tags out. Table pipes, list bullets and emphasis marks are left to the
 * word splitter.
 */
function bodyPlainText(markdown: string): string {
  const kept: string[] = []
  let fenced = false
  for (const line of markdown.split("\n")) {
    if (/^\s*(```|~~~)/.test(line)) {
      fenced = !fenced
      continue
    }
    if (fenced) continue
    if (/^\s*\[[^\]]+\]:\s+\S+/.test(line)) continue // a link reference definition
    kept.push(line)
  }
  return kept
    .join("\n")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/!\[[^\]]*\]\[[^\]]*\]/g, " ")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]*)\]\[[^\]]*\]/g, "$1")
    .replace(/<[^>]*>/g, " ")
    .replace(/&(?:[a-z]+|#\d+);/gi, " ")
}

/**
 * The distinct normalised words of a unit's body (Markdown stripped), sorted. The server indexes
 * these instead of the full text: the body is searchable without the index carrying every sentence.
 */
export function docUnitWords(markdown: string): string[] {
  return [...new Set(searchWordsOf(normalizeForSearch(bodyPlainText(markdown))))].filter((word) => !isSearchStopWord(word)).sort()
}

/** One document of the index, as MiniSearch sees it. `slug` is both the id and a searchable field. */
export type DocSearchDocument = {
  slug: string
  title: string
  headings: string
  summary: string
  body: string
}

/** The documents to index, built from the documentation units (the server only). */
export function docSearchDocuments(units: readonly DocUnit[]): DocSearchDocument[] {
  return units.map((unit) => ({
    slug: unit.slug,
    title: unit.title,
    headings: docUnitSections(unit.body).map((section) => section.text).join("\n"),
    summary: unit.summary,
    body: docUnitWords(unit.body).join(" "),
  }))
}

/**
 * The MiniSearch options, used both to build the index on the server and to `loadJSON` it in the
 * browser: they must match, or the loaded index would misread its own terms.
 */
export const DOC_INDEX_OPTIONS: Options<DocSearchDocument> = {
  fields: ["title", "slug", "headings", "summary", "body"],
  storeFields: [],
  idField: "slug",
  tokenize,
  processTerm,
}

/**
 * The query options of one term group (docSearchScores combines the groups). MiniSearch scores
 * with BM25 (term frequency with saturation, rarity across units, length of the unit), then:
 * - where the word is: title and slug far above the headings (« ## », « ### », FAQ questions),
 *   then the summary, then the body;
 * - how it matched: exact 1, the start of a word (from four letters) 0.5, one typo (from six
 *   letters) 0.25.
 */
export const DOC_SEARCH_OPTIONS: SearchOptions = {
  boost: { title: 9, slug: 8, headings: 3.5, summary: 2, body: 1 },
  combineWith: "OR",
  prefix: (term) => term.length >= 4,
  fuzzy: (term) => (term.length >= 6 ? 1 : false),
  weights: { prefix: 0.5, fuzzy: 0.25 },
}

/** How much a unit that holds every group of the query gains over one that holds a part. */
const ALL_GROUPS_BONUS = 0.5

type DocSearchIndex = { search: (query: Query, options?: SearchOptions) => { id: unknown; score: number }[] }

/**
 * The score of each unit for a query: the scores of its groups (a term or its synonyms) added, then
 * raised by up to ALL_GROUPS_BONUS for the share of the groups it holds. A unit matching only some
 * of the words still shows, below the ones matching them all; a word found nowhere doesn't empty
 * the list. Null when the query has no meaningful term (the filter then shows everything).
 */
export function docSearchScores(index: DocSearchIndex, query: string): Map<string, number> | null {
  const groups = docSearchGroups(query)
  if (groups.length === 0) return null
  const totals = new Map<string, { score: number; groups: number }>()
  for (const group of groups) {
    for (const result of index.search(group, DOC_SEARCH_OPTIONS)) {
      const slug = String(result.id)
      const total = totals.get(slug) ?? { score: 0, groups: 0 }
      total.score += result.score
      total.groups += 1
      totals.set(slug, total)
    }
  }
  const scored = [...totals]
    .map(([slug, t]) => [slug, t.score * (1 + (ALL_GROUPS_BONUS * t.groups) / groups.length)] as const)
    .sort((a, b) => b[1] - a[1])
  // Adding the groups makes nearly every unit match a common word: keep the units within
  // RELEVANT_SHARE of the best one, and always the MIN_RESULTS best (when they match at all).
  const best = scored[0]?.[1] ?? 0
  return new Map(scored.filter(([, score], rank) => rank < MIN_RESULTS || score >= best * RELEVANT_SHARE))
}

/** A unit scoring under this share of the best one is left out of the results… */
const RELEVANT_SHARE = 0.1
/** …unless it is among the first ones. */
const MIN_RESULTS = 5

/**
 * The MiniSearch query for a typed query: one group per meaningful term, an OR of the term and
 * its synonyms, and every group required (AND). A term with only stop words returns null: the
 * filter then shows everything, as for a blank query.
 */
export function docSearchQuery(query: string): Query | null {
  const groups = docSearchGroups(query)
  if (groups.length === 0) return null
  return groups.length === 1 ? groups[0] : { combineWith: "AND", queries: groups }
}

/** The groups of a query: one per meaningful term, the term OR its synonyms. */
function docSearchGroups(query: string): Query[] {
  const groups: Query[] = []
  for (const term of searchTerms(query)) {
    const processed = processTerm(term)
    if (!processed) continue
    const alternatives: Query[] = [term]
    for (const synonym of DOC_SYNONYMS[processed] ?? []) {
      alternatives.push(typeof synonym === "string" ? synonym : { combineWith: "AND", queries: [...synonym.phrase] })
    }
    groups.push(alternatives.length === 1 ? alternatives[0] : { combineWith: "OR", queries: alternatives })
  }
  return groups
}
