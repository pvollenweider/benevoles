// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { useLayoutEffect, useState, type RefObject } from "react"
import { hidesColumns } from "@/lib/table-overflow"

/**
 * Whether the table in a horizontally scrollable region is wider than the region (#1102), kept
 * up to date when the region is resized (window, zoom) and when the table itself changes width
 * (rows filtered, sorted, added or edited: `deps`). False on the server and before the first
 * measure, so the cue it drives is never in the server HTML (no hydration mismatch).
 */
export function useHidesColumns(regionRef: RefObject<HTMLElement | null>, deps: readonly unknown[]): boolean {
  const [hides, setHides] = useState(false)
  useLayoutEffect(() => {
    const region = regionRef.current
    if (!region) {
      setHides(false)
      return
    }
    const measure = () => setHides(hidesColumns(region.scrollWidth, region.clientWidth))
    measure()
    if (typeof ResizeObserver === "undefined") return
    const observer = new ResizeObserver(measure)
    observer.observe(region)
    const table = region.querySelector("table")
    if (table) observer.observe(table)
    return () => observer.disconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
  return hides
}
