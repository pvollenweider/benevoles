"use client"

// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { useEffect, useId, useRef, useState, useTransition } from "react"
import { usePathname, useRouter } from "next/navigation"
import { announce } from "@/lib/announce"
import { SECTOR_FILTER_LABEL, sectorFilterSearch, type SectorFilterOption } from "@/lib/sector-filter"

type Props = {
  options: SectorFilterOption[]
  /** The filter the server applied ("" for all sectors): an unknown value in the URL reads as "". */
  value: string
  /** What to announce once the chosen view is shown (from the server, for `value`). */
  announcement: string
  /** Where the filter reaches beyond the list (exports), tied to the select. */
  hint?: string
  /** Params dropped on a change (e.g. `shift`, which may not be in the new sector). */
  clear?: string[]
}

/**
 * The « Secteur » filter of an organiser view (#1170), rendered by the page only once the event
 * adopted sectors. Choosing a sector replaces the URL's `secteur` param (the page's other params
 * kept): the server reads the view again for that sector, the data below remounts from the new
 * props, and this control stays mounted, so the focus stays on the select.
 *
 * The select is controlled by the last choice, so it never snaps back mid-navigation when the
 * arrow keys fire several changes; the latest navigation wins. Once it is shown, the polite region,
 * empty at first, says the server's count once. Nothing on first load or on back/forward.
 */
export default function SectorFilter({ options, value, announcement, hint, clear }: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const id = useId()
  const [selected, setSelected] = useState(value)
  const [status, setStatus] = useState("")
  const [isPending, startTransition] = useTransition()
  // Set by a choice made here (with the server's value at that moment), cleared once the view of
  // that choice is shown and announced.
  const requested = useRef<{ value: string; from: string } | null>(null)

  useEffect(() => {
    if (isPending) return
    const asked = requested.current
    if (asked === null) {
      // Back/forward or another link changed the URL: follow it silently.
      setSelected(value)
      return
    }
    // The server has not answered for the choice yet: keep showing it, unless the choice is gone
    // (a sector archived meanwhile reads as « Tous les secteurs »): then settle on the server's view.
    if (value !== asked.value && value === asked.from && options.some((o) => o.value === asked.value)) return
    requested.current = null
    setSelected(value)
    announce(setStatus, announcement)
  }, [isPending, value, announcement, options])

  function choose(next: string) {
    setSelected(next)
    requested.current = { value: next, from: requested.current?.from ?? value }
    const search = sectorFilterSearch(typeof window === "undefined" ? "" : window.location.search, next, clear)
    startTransition(() => router.replace(`${pathname}${search}`, { scroll: false }))
  }

  const hintId = `${id}-hint`
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="block text-sm font-medium text-gray-700">{SECTOR_FILTER_LABEL}</label>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <select
          id={id}
          value={selected}
          onChange={(e) => choose(e.target.value)}
          aria-describedby={hint ? hintId : undefined}
          className="input w-full sm:w-auto sm:min-w-64"
        >
          {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        {/* Visible only, not live: the count is said once the view is shown. */}
        {isPending && <span className="text-sm text-gray-600">Mise à jour…</span>}
      </div>
      {hint && <p id={hintId} className="text-sm text-gray-600">{hint}</p>}
      <p role="status" className="sr-only">{status}</p>
    </div>
  )
}
