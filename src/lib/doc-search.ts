// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * The filter over the index of the documentation units (#649, #1319,
 * src/components/public/DocUnitIndex.tsx): the pure functions of its interface, alongside the
 * search index itself (src/lib/doc-search-index.ts). No Node import here: this module is bundled
 * for the browser.
 *
 * The index (MiniSearch) is built on the server and fetched by the browser on the reader's first
 * interaction. Until it arrives, and if the request fails, `matchesDocTerms` keeps filtering on the
 * title, the summary and the « ## » / « ### » headings that the page is server-rendered with.
 */

import {
  searchTermMatchesWord,
  searchTerms,
  tokenize,
  type DocSection,
} from "@/lib/doc-search-index"
import { DOC_FAQ_HEADING_ID } from "@/lib/doc-faq"
import type { DocRole } from "@/lib/doc-units"

export {
  docQueryTerms,
  docSearchQuery,
  docSearchDocuments,
  docUnitQuestionAnchors,
  docUnitQuestions,
  docUnitSections,
  docUnitWords,
  DOC_INDEX_OPTIONS,
  DOC_SEARCH_OPTIONS,
  isOneTypoApart,
  isSearchStopWord,
  normalizeForSearch,
  processTerm,
  searchTermMatchesWord,
  searchTerms,
  stemForSearch,
  tokenize,
  type DocQuestion,
  type DocSearchDocument,
  type DocSection,
} from "@/lib/doc-search-index"

/**
 * What the fallback filter searches in a unit before the index arrives: its title, its summary,
 * the « ## » and « ### » headings of its page. `sections` is optional so an older entry (title,
 * summary, questions only) still filters: its questions stand in for the headings.
 */
export type DocSearchEntry = {
  title: string
  summary: string
  questions: readonly string[]
  sections?: readonly DocSection[]
}

/** Whether a term appears in a text (its words, with searchTermMatchesWord). */
function textMatchesTerm(text: string, term: string): boolean {
  return tokenize(text).some((word) => searchTermMatchesWord(term, word))
}

/** The headings of an entry: `sections` when indexed, else its questions (older callers). */
function entrySections(entry: DocSearchEntry): DocSection[] {
  if (entry.sections) return [...entry.sections]
  return entry.questions.map((text) => ({ text, id: "" }))
}

/**
 * Whether every term matches somewhere in the entry's title, headings or summary. This is the
 * fallback used while the MiniSearch index loads (or when it cannot): no body, so the server-
 * rendered page can filter before anything is fetched.
 */
export function matchesDocTerms(entry: DocSearchEntry, terms: readonly string[]): boolean {
  if (terms.length === 0) return true
  return terms.every(
    (term) =>
      textMatchesTerm(entry.title, term) ||
      entrySections(entry).some((section) => textMatchesTerm(section.text, term)) ||
      textMatchesTerm(entry.summary, term),
  )
}

/** Whether an entry matches a query in the fallback: every remaining word, stop words dropped. */
export function matchesDocQuery(entry: DocSearchEntry, query: string): boolean {
  return matchesDocTerms(entry, searchTerms(query))
}

/**
 * The sections to show under a result: only when the unit is not already found by its title or
 * summary, the « ## » / « ### » headings that hold every remaining word of the query, in page
 * order, `limit` at most. None for a blank query or one made only of stop words.
 */
export function matchingDocSections(entry: DocSearchEntry, query: string, limit = 2): DocSection[] {
  const terms = searchTerms(query)
  if (terms.length === 0) return []
  if (terms.every((term) => textMatchesTerm(entry.title, term) || textMatchesTerm(entry.summary, term))) return []
  const links: DocSection[] = []
  for (const section of entrySections(entry)) {
    if (links.some((link) => link.text === section.text)) continue
    if (terms.every((term) => textMatchesTerm(section.text, term))) links.push(section)
    if (links.length === limit) break
  }
  return links
}

/**
 * The questions to show under a result (matchingDocSections, restricted to the « ### » headings):
 * only when the unit is found by its questions, not by its title or summary.
 */
export function matchingDocQuestions(entry: DocSearchEntry, query: string, limit = 2): string[] {
  return matchingDocSections(entry, query, limit).map((section) => section.text)
}

/**
 * The section links under a result: matchingDocSections, each with the heading id the page
 * renders. A heading without an id is left out rather than linked to « #undefined ».
 */
export function matchingDocSectionLinks(entry: DocSearchEntry, query: string, limit = 2): DocSection[] {
  return matchingDocSections(entry, query, limit).filter((section) => section.id !== "")
}

/**
 * The question links under a result, for an entry that carries its questions and their ids
 * separately (`questionIds[i]` is the id of `questions[i]`). Kept for callers of #649; new code
 * passes `sections` and uses matchingDocSectionLinks.
 */
export function matchingDocQuestionLinks(
  entry: DocSearchEntry & { questionIds: readonly string[] },
  query: string,
  limit = 2,
): DocSection[] {
  const sections = entry.questions
    .map((text, i) => ({ text, id: entry.questionIds[i] ?? "" }))
    .filter((section) => section.id !== "")
  return matchingDocSectionLinks({ ...entry, sections }, query, limit)
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

/** The help unit for organisers (content/guide/aide-et-retours.md): the last step when nothing matches. */
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
