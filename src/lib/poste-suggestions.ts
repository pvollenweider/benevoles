// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { KNOWN_ROLES } from "./roles"

/**
 * The poste field of the shift forms (#1018): the event's postes come first, then the examples.
 * Two spellings that differ only by case or spaces (« buvette  », « Buvette ») are one poste: the
 * first one met is kept. Pure, no Prisma import (used by client components).
 */
export type PosteShift = { roleName: string; displayOrder?: number | null; status?: string | null }

/** The comparison key of a poste name: trimmed, inner spaces collapsed, lower case. */
export function posteKey(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLocaleLowerCase("fr")
}

/** The event's postes, every day, in the event's poste order (smallest displayOrder), deduplicated. */
export function eventPostes(shifts: readonly PosteShift[]): string[] {
  const live = shifts.filter((s) => s.status !== "cancelled" && s.roleName.trim())
  // Stable sort: shifts of one order keep their list order, so the first spelling met wins.
  const sorted = [...live].sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0))
  const seen = new Set<string>()
  const out: string[] = []
  for (const s of sorted) {
    const k = posteKey(s.roleName)
    if (seen.has(k)) continue
    seen.add(k)
    out.push(s.roleName)
  }
  return out
}

/** The datalist options: the event's postes, then the examples it does not use yet. */
export function posteSuggestions(shifts: readonly PosteShift[], examples: readonly string[] = KNOWN_ROLES): string[] {
  const own = eventPostes(shifts)
  const used = new Set(own.map(posteKey))
  return [...own, ...examples.filter((e) => !used.has(posteKey(e)))]
}

/**
 * The existing poste the organiser typed, in its stored spelling, or null for a new poste. The form
 * sends this spelling, so the shift joins the poste and takes its settings (#1002).
 */
export function matchingPoste(shifts: readonly PosteShift[], typed: string): string | null {
  const k = posteKey(typed)
  if (!k) return null
  return eventPostes(shifts).find((p) => posteKey(p) === k) ?? null
}

/** The hint under the field when an existing poste is chosen (non-breaking spaces inside « »). */
export function posteSettingsHint(poste: string): string {
  return `Les paramètres du poste «\u00a0${poste}\u00a0» s'appliquent (couleur, limite, accès, chevauchement).`
}
