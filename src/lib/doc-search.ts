// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * The filter over the index of the documentation units (#649, src/components/public/DocUnitIndex.tsx):
 * pure functions shared by the server, which extracts what a unit can be found by, and the
 * client, which filters as the reader types. No Node import here: this module is bundled for the
 * browser.
 */

import { createHeadingSlugger } from "@/lib/heading-anchors"
import { DOC_FAQ_HEADING_ID } from "@/lib/doc-faq"
import type { DocRole } from "@/lib/doc-units"

/** What the filter searches in a unit: its title, its summary and the questions its page answers. */
export type DocSearchEntry = { title: string; summary: string; questions: readonly string[] }

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

/** The words of a query, normalised; none for a blank query. */
export function searchTerms(query: string): string[] {
  const normalized = normalizeForSearch(query)
  return normalized === "" ? [] : normalized.split(" ")
}

/** The normalised text an entry is searched in. */
export function searchHaystack(entry: DocSearchEntry): string {
  return normalizeForSearch([entry.title, entry.summary, ...entry.questions].join(" \n "))
}

/** Whether every word of the query appears in the haystack (searchHaystack); a blank query matches everything. */
export function haystackMatches(haystack: string, terms: readonly string[]): boolean {
  return terms.every((term) => haystack.includes(term))
}

/** Whether an entry matches a query: every word, anywhere in its title, summary or questions. */
export function matchesDocQuery(entry: DocSearchEntry, query: string): boolean {
  return haystackMatches(searchHaystack(entry), searchTerms(query))
}

/** A question of a unit's page: its text, and the id its heading renders with (the link's fragment). */
export type DocQuestion = { text: string; id: string }

/** A heading's Markdown as plain text: links keep their text, emphasis and code marks are dropped. */
function plainHeading(markdown: string): string {
  return markdown
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[*_`]/g, "")
    .trim()
}

/**
 * The « ### » headings of a unit's Markdown, with their ids: where the units put the questions
 * readers ask (« Je ne veux pas oublier mon créneau le jour J », under « Questions fréquentes » or
 * « Côté bénévole »). Every heading goes through one slugger, in order, as the unit's page renders
 * them (src/lib/event-page-markdown.ts), so a repeated heading gets the same « -2 » suffix; a test
 * checks these ids against the rendered page. Fenced code is skipped.
 */
export function docUnitQuestionAnchors(markdown: string): DocQuestion[] {
  const questions: DocQuestion[] = []
  const slug = createHeadingSlugger()
  let fenced = false
  for (const line of markdown.split("\n")) {
    if (/^\s*(```|~~~)/.test(line)) fenced = !fenced
    if (fenced) continue
    const match = line.match(/^(#{1,6})\s+(.+?)\s*#*\s*$/)
    if (!match) continue
    const text = plainHeading(match[2])
    const id = slug(text)
    if (match[1].length === 3 && text !== "") questions.push({ text, id })
  }
  return questions
}

/** The « ### » headings of a unit's Markdown, as plain text (docUnitQuestionAnchors without the ids). */
export function docUnitQuestions(markdown: string): string[] {
  return docUnitQuestionAnchors(markdown).map((q) => q.text)
}

/**
 * The questions to show under a result: only when the unit is found by its questions, not by its
 * title or summary (the result already says why it is there), the questions that hold every word
 * of the query, in page order, `limit` at most. None for a blank query.
 */
export function matchingDocQuestions(entry: DocSearchEntry, query: string, limit = 2): string[] {
  const terms = searchTerms(query)
  if (terms.length === 0) return []
  if (haystackMatches(normalizeForSearch(`${entry.title} \n ${entry.summary}`), terms)) return []
  return entry.questions.filter((q) => haystackMatches(normalizeForSearch(q), terms)).slice(0, limit)
}

/**
 * What the filter's live region says once the reader pauses: a full sentence, with the query when
 * it narrows the list, or the total when the filter is cleared.
 */
export function docFilterStatus(query: string, shown: number, total: number): string {
  const q = query.trim()
  if (q === "") return total === 1 ? "La fiche est affichée." : `Les ${total} fiches sont affichées.`
  if (shown === 0) return `Aucune fiche pour « ${q} ».`
  return shown === 1 ? `1 fiche sur ${total} correspond à « ${q} ».` : `${shown} fiches sur ${total} correspondent à « ${q} ».`
}

/**
 * The questions to link under a result: matchingDocQuestions, each with the heading id of its
 * position (`questionIds[i]` is the id of `questions[i]`). A question without an id is left out
 * rather than linked to « #undefined ».
 */
export function matchingDocQuestionLinks(
  entry: DocSearchEntry & { questionIds: readonly string[] },
  query: string,
  limit = 2,
): DocQuestion[] {
  const matched = new Set(matchingDocQuestions(entry, query, Infinity))
  const links: DocQuestion[] = []
  entry.questions.forEach((text, i) => {
    const id = entry.questionIds[i]
    if (matched.has(text) && id && !links.some((l) => l.text === text)) links.push({ text, id })
  })
  return links.slice(0, limit)
}

/** The help unit for organisers (guide/aide-et-retours.md): the last step when nothing matches. */
export const DOC_HELP_UNIT_SLUG = "aide-et-retours"

/** A link of the filter's empty state: its target, its name, and what it is for when the name says too little. */
export type DocNextStep = { href: string; label: string; note?: string }

/**
 * What the filter offers when no unit matches: advice, then a sentence for the page's reader (« tu » on the
 * volunteers' guide, « vous » on the organisers', neutral on /doc), then links to the « Questions
 * fréquentes » block of the guide (the page's own, or both from /doc) and, for organisers, to the
 * help unit, from which they can write to the team.
 */
export function docFilterNextSteps(role?: DocRole): { advice: string; lead: string; steps: DocNextStep[] } {
  const faq = `#${DOC_FAQ_HEADING_ID}`
  const help: DocNextStep = { href: `/doc/${DOC_HELP_UNIT_SLUG}`, label: "Aide et retours" }
  if (role === "benevole") {
    return {
      advice: "Essaie un autre mot, ou efface le filtre pour revoir toute la liste.",
      lead: "Tu trouveras peut-être ta réponse ici\u00a0:", steps: [{ href: faq, label: "Questions fréquentes" }],
    }
  }
  if (role === "admin") {
    return {
      advice: "Essayez un autre mot, ou effacez le filtre pour revoir toute la liste.",
      lead: "Vous trouverez peut-être votre réponse ici\u00a0:",
      steps: [
        { href: faq, label: "Questions fréquentes" },
        { ...help, note: "pour poser une question ou signaler un problème" },
      ],
    }
  }
  return {
    advice: "Un autre mot peut donner des résultats, et « Effacer le filtre » ramène toute la liste.",
    lead: "D'autres pistes\u00a0:",
    steps: [
      { href: `/doc/benevole${faq}`, label: "Questions fréquentes des bénévoles" },
      { href: `/doc/admin${faq}`, label: "Questions fréquentes des organisateurs" },
      { ...help, note: "pour les organisateurs, poser une question ou signaler un problème" },
    ],
  }
}
