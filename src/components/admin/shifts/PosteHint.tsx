"use client"

// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { useEffect, useState } from "react"
import { posteSettingsHint } from "@/lib/poste-suggestions"

/** Same pause as the recurrence summary: the hint is said once typing settles, not per key. */
export const POSTE_HINT_DELAY_MS = 500

/**
 * The hint under the poste field when an existing poste is chosen (#1018): the shift takes its
 * settings (#1002). `poste` is the existing poste in its stored spelling, or null.
 * - The visible line (`id`, the field's aria-describedby while a poste matches) shows at once.
 * - A separate polite live region says it once typing settles, cleared at once when the value no
 *   longer matches; it stays mounted, since a live region added with its text is read unreliably.
 */
export default function PosteHint({ id, poste }: { id: string; poste: string | null }) {
  const [settled, setSettled] = useState<string | null>(null)
  useEffect(() => {
    if (!poste) return
    const timer = setTimeout(() => setSettled(poste), POSTE_HINT_DELAY_MS)
    return () => clearTimeout(timer)
  }, [poste])
  // Never the hint of another poste (or none), even before the timer resets it.
  const spoken = poste && settled === poste ? posteSettingsHint(poste) : ""
  return (
    <>
      {poste && <p id={id} className="text-xs text-gray-600 mt-1">{posteSettingsHint(poste)}</p>}
      <span className="sr-only" aria-live="polite">{spoken}</span>
    </>
  )
}
