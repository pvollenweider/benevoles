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
 *
 * `message` (#1147, sectors) replaces the settings hint when the typed poste is in another sector
 * than the one chosen: one description and one live region for the field, never two racing.
 * `invalid` styles it as the field's error once a save was attempted. `quiet` keeps the live
 * region silent (focus just moved, and the focused control already says it).
 */
export default function PosteHint({ id, poste, message = null, invalid = false, quiet = false }: {
  id: string
  poste: string | null
  message?: string | null
  invalid?: boolean
  quiet?: boolean
}) {
  const text = message ?? (poste ? posteSettingsHint(poste) : null)
  const [settled, setSettled] = useState<string | null>(null)
  useEffect(() => {
    if (!text) return
    const timer = setTimeout(() => setSettled(text), POSTE_HINT_DELAY_MS)
    return () => clearTimeout(timer)
  }, [text])
  // Never the hint of another poste (or none), even before the timer resets it.
  const spoken = text && settled === text && !quiet ? text : ""
  return (
    <>
      {text && <p id={id} className={`text-xs mt-1 ${invalid ? "text-red-700" : "text-gray-600"}`}>{text}</p>}
      <span className="sr-only" aria-live="polite">{spoken}</span>
    </>
  )
}
