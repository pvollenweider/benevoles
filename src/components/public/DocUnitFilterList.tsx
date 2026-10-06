"use client"

// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { useEffect, useId, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { docFilterStatus, haystackMatches, searchHaystack, searchTerms, type DocSearchEntry } from "@/lib/doc-search"
import { useHydrated } from "@/lib/use-hydrated"

export type DocIndexItem = DocSearchEntry & { slug: string; audience?: string }
export type DocIndexGroup = { id: string; title: string; anchor?: string; items: DocIndexItem[] }

/** How long the live region waits after the last keystroke before it speaks. */
const ANNOUNCE_DELAY_MS = 300

/**
 * The groups of the documentation's index with a filter above them (#649). Every link is in the
 * server-rendered HTML; the field only appears once React has hydrated (without script, the full
 * list stays). Typing hides the units that don't match (title, summary, questions of the page,
 * src/lib/doc-search.ts) and every group left empty, heading included. A status region, present
 * from the first paint, says the result in a full sentence once the reader pauses; the focus never
 * moves. Échap empties a field that has a value, and only then; « Effacer le filtre » does it too
 * (Firefox has no clear button of its own) and gives the focus back to the field.
 */
export default function DocUnitFilterList({ groups }: { groups: readonly DocIndexGroup[] }) {
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
      {hydrated && (
        <search className="not-prose mt-4 block">
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
      )}
      <p role="status" className="text-sm text-gray-600 dark:text-gray-400 min-h-5 mt-2 mb-0">
        {announcement}
      </p>
      {terms.length > 0 && shown === 0 && <p>Essayer un autre mot, ou effacer le filtre pour revoir toute la liste.</p>}
      {groups.map((group) => {
        const groupHidden = !group.items.some(visible)
        return (
          <div key={group.id} hidden={groupHidden}>
            <h3 id={group.anchor}>{group.title}</h3>
            <ul>
              {group.items.map((item) => (
                <li key={item.slug} hidden={!visible(item)}>
                  <Link href={`/doc/${item.slug}`}>{item.title}</Link>&nbsp;: {item.summary}
                  {item.audience && <> Pour&nbsp;: {item.audience}.</>}
                </li>
              ))}
            </ul>
          </div>
        )
      })}
    </>
  )
}
