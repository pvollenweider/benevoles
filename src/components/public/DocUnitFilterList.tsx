"use client"

// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { useEffect, useId, useRef, useState } from "react"
import Link from "next/link"
import type MiniSearch from "minisearch"
import { docFilterNextSteps, docFilterStatus, matchesDocTerms, matchingDocSectionLinks, searchTerms, type DocSearchEntry } from "@/lib/doc-search"
import { DOC_INDEX_OPTIONS, docSearchQuery, docSearchScores, type DocSearchDocument } from "@/lib/doc-search-index"
import type { DocRole } from "@/lib/doc-units"
import { useHydrated } from "@/lib/use-hydrated"
import { docUnitHref } from "@/lib/doc-href"
import type { Freshness } from "@/lib/freshness"
import FreshnessBadge from "./FreshnessBadge"

/**
 * A unit of the index as the server sends it; `questionIds[i]` is the heading id of `questions[i]`
 * on the unit's page. Its body words and the MiniSearch index are not part of the props: the
 * filter fetches the index on the reader's first interaction (see below).
 */
export type DocIndexItem = DocSearchEntry & { slug: string; questionIds: readonly string[]; audience?: string; freshness?: Freshness }
export type DocIndexGroup = { id: string; title: string; anchor?: string; items: DocIndexItem[] }

/** How long the live region waits after the last keystroke before it speaks. */
const ANNOUNCE_DELAY_MS = 300

/** A unit with its group and its position in the index: the tie-breaker of the ranking. */
type DocResult = { entry: DocIndexItem; group: DocIndexGroup; index: number; score: number }

/**
 * The groups of the documentation's index with a filter above them (#649). Every link is in the
 * server-rendered HTML. The filter is rendered from the first paint, at its final size, but
 * `invisible` (out of the accessibility tree, out of the tab order) until React has hydrated, so
 * nothing moves when it appears; without script it takes no room at all (`noscript:hidden`) and
 * the full list stays. Typing hides the units that don't match and every group left empty,
 * heading included.
 *
 * The body words, the headings and the ranking live in a MiniSearch index built once on the server
 * (src/lib/doc-search-index.ts), fetched from /api/public/doc-index on the first focus or the
 * first keystroke, never on page load, then loaded with the same options. Until it arrives, and if
 * the request fails, only the title, summary and headings that the page carries are searched
 * (matchesDocTerms); a failure is silent and never retried. MiniSearch is imported dynamically, so
 * a page whose filter is never used downloads neither the index nor the library.
 *
 * While the query has words, the grouped list stays in the DOM but hidden, and one list replaces
 * it: every matching unit, across all groups, ordered by the MiniSearch score (ties in the
 * index's original order). Each result adds its group name (« Rubrique : … ») under the summary,
 * muted like it, and up to two matching section links. A visually hidden « Résultats » heading
 * keeps the heading outline: the hidden groups no longer provide one. A blank query, a query made
 * only of stop words, Échap or « Effacer le filtre » shows the groups again exactly as the server
 * rendered them, without moving the focus.
 *
 * A status region, present from the first paint, says the result in a full sentence once the
 * reader pauses; the focus never moves. Échap empties a field that has a value, and only then;
 * « Effacer le filtre » does it too (Firefox has no clear button of its own) and gives the focus
 * back to the field.
 *
 * Each unit: its title, a link on its own line, then its summary below in smaller muted text,
 * always shown (no disclosure per group: a heading inside a <summary> loses its role, and a closed
 * group would hide what the filter found). A unit found by a heading or by its body only (not its
 * title or summary) lists, under its result, the two first matching sections (« ## » or « ### »),
 * each a link to its heading. When nothing matches, the advice is followed by next steps for the
 * page's reader (`role`: the guide's, none on /doc): the guide's « Questions fréquentes », and the
 * help unit for organisers. Neither is announced on its own: the status sentence stays the only
 * live text.
 */
export default function DocUnitFilterList({ groups, role, indexVersion }: { groups: readonly DocIndexGroup[]; role?: DocRole; indexVersion?: string }) {
  const hydrated = useHydrated()
  const inputId = useId()
  const [query, setQuery] = useState("")
  const [announcement, setAnnouncement] = useState("")
  // The index arrives only when the reader first reaches the field: most visitors never filter,
  // and the index (with MiniSearch) is the bulk of what the page would otherwise carry (#1319).
  const [index, setIndex] = useState<MiniSearch<DocSearchDocument> | null>(null)
  const indexRequested = useRef(false)
  const touched = useRef(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const terms = searchTerms(query)
  const expression = terms.length > 0 ? docSearchQuery(query) : null
  // The index's original order, across the groups: the tie-breaker of the ranking.
  let position = 0
  const allResults: DocResult[] = groups.flatMap((group) =>
    group.items.map((entry) => ({ entry, group, index: position++, score: 0 })),
  )
  let matched: Set<string>
  let ranked: DocResult[]
  if (terms.length === 0) {
    matched = new Set(allResults.map((result) => result.entry.slug))
    ranked = []
  } else if (index && expression) {
    const scores = docSearchScores(index, query) ?? new Map<string, number>()
    matched = new Set(scores.keys())
    ranked = allResults
      .filter((result) => scores.has(result.entry.slug))
      .map((result) => ({ ...result, score: scores.get(result.entry.slug)! }))
      .sort((a, b) => b.score - a.score || a.index - b.index)
  } else {
    // Before the index arrives, and if it cannot: the server-rendered title, summary and headings.
    matched = new Set(allResults.filter((result) => matchesDocTerms(result.entry, terms)).map((result) => result.entry.slug))
    ranked = allResults.filter((result) => matched.has(result.entry.slug))
  }
  const visible = (item: DocIndexItem) => matched.has(item.slug)
  const total = allResults.length
  const shown = allResults.filter((result) => visible(result.entry)).length

  useEffect(() => {
    if (!touched.current) return
    const timer = setTimeout(() => setAnnouncement(docFilterStatus(query, shown, total)), ANNOUNCE_DELAY_MS)
    return () => clearTimeout(timer)
  }, [query, shown, total])

  // One request at most, on the first focus or the first keystroke, never on page load. A failure
  // is silent: the filter keeps matching the title, summary and headings, and never retries. The
  // library itself is imported dynamically, in the same lazy path.
  const requestIndex = () => {
    if (indexRequested.current) return
    indexRequested.current = true
    // The version (a fingerprint of the guides, DocUnitIndex) changes the URL when a guide changes.
    fetch(indexVersion ? `/api/public/doc-index?v=${indexVersion}` : "/api/public/doc-index")
      .then((response) => (response.ok ? response.text() : null))
      .then(async (json) => {
        if (!json) return
        const { default: MiniSearchClass } = await import("minisearch")
        setIndex(MiniSearchClass.loadJSON<DocSearchDocument>(json, DOC_INDEX_OPTIONS))
      })
      .catch(() => {})
  }

  const change = (value: string) => {
    touched.current = true
    requestIndex()
    setQuery(value)
  }

  return (
    <>
      <search className={`not-prose mt-4 block noscript:hidden ${hydrated ? "" : "invisible"}`}>
        <label htmlFor={inputId} className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          Filtrer les fiches
        </label>
        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={inputRef}
            id={inputId}
            type="search"
            autoComplete="off"
            enterKeyHint="search"
            spellCheck={false}
            value={query}
            onFocus={requestIndex}
            onChange={(e) => change(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== "Escape" || e.currentTarget.value === "") return
              e.preventDefault()
              change("")
            }}
            className="block w-full max-w-md min-h-11 rounded-xl border border-gray-500 dark:border-gray-400 bg-white dark:bg-gray-800 px-3 py-2 text-base text-gray-900 dark:text-gray-100 outline-hidden focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
          />
          {query !== "" && (
            <button
              type="button"
              onClick={() => {
                change("")
                inputRef.current?.focus()
              }}
              className="min-h-11 rounded-xl border border-blue-600 dark:border-blue-400 bg-transparent px-4 py-2 text-sm font-medium text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-gray-800 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 dark:focus-visible:outline-blue-400"
            >
              Effacer le filtre
            </button>
          )}
        </div>
      </search>
      <p role="status" className="text-sm text-gray-600 dark:text-gray-400 min-h-5 mt-2 mb-0">
        {announcement}
      </p>
      {terms.length > 0 && shown === 0 && <EmptyState role={role} />}
      {terms.length > 0 && shown > 0 && (
        <>
          <h3 className="sr-only">Résultats</h3>
          <ul>
            {ranked.map(({ entry: item, group }) => {
              const sections = matchingDocSectionLinks(item, query)
              return (
                <li key={item.slug}>
                  <Link href={docUnitHref(item.slug)} className="font-medium">
                    {item.title}
                    {item.freshness && <FreshnessBadge kind={item.freshness} separated className="ml-2 align-text-bottom" />}
                  </Link>
                  <span className="mt-0.5 block text-sm text-gray-600 dark:text-gray-400">
                    {item.summary}
                    {item.audience && <> Pour&nbsp;: {item.audience}.</>}
                  </span>
                  <span className="mt-0.5 block text-sm text-gray-600 dark:text-gray-400">Rubrique&nbsp;: {group.title}</span>
                  {sections.length > 0 && (
                    <ul aria-label="Sections correspondantes">
                      {sections.map((section) => (
                        <li key={section.id}>
                          <Link href={`${docUnitHref(item.slug)}#${section.id}`}>{section.text}</Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              )
            })}
          </ul>
        </>
      )}
      {groups.map((group) => {
        const groupHidden = !group.items.some(visible)
        return (
          <div key={group.id} hidden={terms.length > 0 || groupHidden}>
            <h3 id={group.anchor}>{group.title}</h3>
            <ul>
              {group.items.map((item) => {
                const shownItem = matched.has(item.slug)
                const sections = shownItem ? matchingDocSectionLinks(item, query) : []
                return (
                  <li key={item.slug} hidden={!shownItem}>
                    <Link href={docUnitHref(item.slug)} className="font-medium">
                      {item.title}
                      {item.freshness && <FreshnessBadge kind={item.freshness} separated className="ml-2 align-text-bottom" />}
                    </Link>
                    <span className="mt-0.5 block text-sm text-gray-600 dark:text-gray-400">
                      {item.summary}
                      {item.audience && <> Pour&nbsp;: {item.audience}.</>}
                    </span>
                    {sections.length > 0 && (
                      <ul aria-label="Sections correspondantes">
                        {sections.map((section) => (
                          <li key={section.id}>
                            <Link href={`${docUnitHref(item.slug)}#${section.id}`}>{section.text}</Link>
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                )
              })}
            </ul>
          </div>
        )
      })}
    </>
  )
}

/** The advice when no unit matches, then where to look next (docFilterNextSteps). */
function EmptyState({ role }: { role?: DocRole }) {
  const { advice, lead, steps } = docFilterNextSteps(role)
  return (
    <>
      <p>{advice}</p>
      <p>{lead}</p>
      <ul>
        {steps.map((step) => (
          <li key={step.href}>
            <Link href={step.href}>{step.label}</Link>
            {step.note && <>&nbsp;: {step.note}</>}
          </li>
        ))}
      </ul>
    </>
  )
}
