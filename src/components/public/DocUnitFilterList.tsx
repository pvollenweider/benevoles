"use client"

// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { useEffect, useId, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { docFilterNextSteps, docFilterStatus, haystackMatches, matchingDocQuestionLinks, searchHaystack, searchTerms, type DocSearchEntry } from "@/lib/doc-search"
import type { DocRole } from "@/lib/doc-units"
import { useHydrated } from "@/lib/use-hydrated"
import { docUnitHref } from "@/lib/doc-href"
import type { Freshness } from "@/lib/freshness"
import FreshnessBadge from "./FreshnessBadge"

/** A unit of the index; `questionIds[i]` is the heading id of `questions[i]` on the unit's page. */
export type DocIndexItem = DocSearchEntry & { slug: string; questionIds: readonly string[]; audience?: string; freshness?: Freshness }
export type DocIndexGroup = { id: string; title: string; anchor?: string; items: DocIndexItem[] }

/** How long the live region waits after the last keystroke before it speaks. */
const ANNOUNCE_DELAY_MS = 300

/**
 * The groups of the documentation's index with a filter above them (#649). Every link is in the
 * server-rendered HTML. The filter is rendered from the first paint, at its final size, but
 * `invisible` (out of the accessibility tree, out of the tab order) until React has hydrated, so
 * nothing moves when it appears; without script it takes no room at all (`noscript:hidden`) and
 * the full list stays. Typing hides the units that don't match (title, summary, questions of the
 * page, src/lib/doc-search.ts) and every group left empty, heading included. A status region,
 * present from the first paint, says the result in a full sentence once the reader pauses; the
 * focus never moves. Échap empties a field that has a value, and only then; « Effacer le filtre »
 * does it too (Firefox has no clear button of its own) and gives the focus back to the field.
 *
 * Each unit: its title, a link on its own line, then its summary below in smaller muted text,
 * always shown (no disclosure per group: a heading inside a <summary> loses its role, and a closed
 * group would hide what the filter found).
 *
 * A unit found by its questions only (not its title or summary) lists, under its result, the two
 * first questions that match, each a link to its heading. When nothing matches, the advice is
 * followed by next steps for the page's reader (`role`: the guide's, none on /doc): the guide's
 * « Questions fréquentes », and the help unit for organisers. Neither is announced on its own: the
 * status sentence stays the only live text.
 */
export default function DocUnitFilterList({ groups, role }: { groups: readonly DocIndexGroup[]; role?: DocRole }) {
  const hydrated = useHydrated()
  const inputId = useId()
  const [query, setQuery] = useState("")
  const [announcement, setAnnouncement] = useState("")
  const touched = useRef(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const haystacks = useMemo(() => new Map(groups.flatMap((g) => g.items.map((item) => [item.slug, searchHaystack(item)] as const))), [groups])
  const terms = searchTerms(query)
  const visible = (item: DocIndexItem) => haystackMatches(haystacks.get(item.slug) ?? "", terms)
  const total = haystacks.size
  const shown = groups.reduce((n, g) => n + g.items.filter(visible).length, 0)

  useEffect(() => {
    if (!touched.current) return
    const timer = setTimeout(() => setAnnouncement(docFilterStatus(query, shown, total)), ANNOUNCE_DELAY_MS)
    return () => clearTimeout(timer)
  }, [query, shown, total])

  const change = (value: string) => {
    touched.current = true
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
            onChange={(e) => change(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== "Escape" || e.currentTarget.value === "") return
              e.preventDefault()
              change("")
            }}
            className="block w-full max-w-md min-h-11 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-base text-gray-900 dark:text-gray-100 outline-hidden focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
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
      {groups.map((group) => {
        const groupHidden = !group.items.some(visible)
        return (
          <div key={group.id} hidden={groupHidden}>
            <h3 id={group.anchor}>{group.title}</h3>
            <ul>
              {group.items.map((item) => {
                const shownItem = visible(item)
                const questions = shownItem ? matchingDocQuestionLinks(item, query) : []
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
                    {questions.length > 0 && (
                      <ul aria-label="Questions correspondantes">
                        {questions.map((question) => (
                          <li key={question.id}>
                            <Link href={`${docUnitHref(item.slug)}#${question.id}`}>{question.text}</Link>
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
