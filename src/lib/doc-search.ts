// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * The filter over the index of the documentation units (#649, src/components/public/DocUnitIndex.tsx):
 * pure functions shared by the server, which extracts what a unit can be found by, and the
 * client, which filters as the reader types. No Node import here: this module is bundled for the
 * browser.
 */

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

/**
 * The « ### » headings of a unit's Markdown, as plain text: where the units put the questions
 * readers ask (« Je veux changer de créneau », under « Questions fréquentes » or « Côté bénévole »).
 * Fenced code is skipped; links keep their text, emphasis and code marks are dropped.
 */
export function docUnitQuestions(markdown: string): string[] {
  const questions: string[] = []
  let fenced = false
  for (const line of markdown.split("\n")) {
    if (/^\s*(```|~~~)/.test(line)) fenced = !fenced
    if (fenced) continue
    const match = line.match(/^###\s+(.+?)\s*#*\s*$/)
    if (!match) continue
    const text = match[1]
      .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
      .replace(/[*_`]/g, "")
      .trim()
    if (text !== "") questions.push(text)
  }
  return questions
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
