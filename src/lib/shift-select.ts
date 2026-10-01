// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { fold } from "./text-fold"
import { fmtHour, fmtShortDate, type ShiftRef } from "./registrations-list"

/**
 * Pure logic of the shift picker (ShiftSelect, #555): the spoken name of each option and the
 * keyboard arithmetic of the select-only combobox. Client-safe: no server-only import.
 */

/**
 * Accessible name of a shift option, e.g. « sam. 4 juil., de 10h à 12h, Bar, 1 inscrit sur 3,
 * déjà inscrit ». « de … à » instead of the en dash, which screen readers read badly; it starts
 * with the same date text as the visible row (WCAG 2.5.3).
 */
export function shiftOptionLabel(s: ShiftRef, f: { alreadyRegistered: boolean; conflict: boolean }): string {
  const n = s.registrationCount
  const fill = n >= s.capacity
    ? "complet"
    : n === 0
      ? `aucun inscrit sur ${s.capacity}`
      : `${n} inscrit${n > 1 ? "s" : ""} sur ${s.capacity}`
  return `${fmtShortDate(s.date)}, de ${fmtHour(s.startTime)} à ${fmtHour(s.endTime)}, ${s.roleName}`
    + `${s.label !== s.roleName ? `, ${s.label}` : ""}, ${fill}`
    + `${f.alreadyRegistered ? ", déjà inscrit" : ""}${f.conflict ? ", conflit d'horaire" : ""}`
}

/**
 * The chosen shift as the trigger speaks it, e.g. « sam. 4 juil., de 10h à 12h, Bar, Soir »: the
 * visible « · » and en dash are read aloud by screen readers (#574).
 */
export function shiftValueText(s: ShiftRef): string {
  return `${fmtShortDate(s.date)}, de ${fmtHour(s.startTime)} à ${fmtHour(s.endTime)}, ${s.roleName}${s.label !== s.roleName ? `, ${s.label}` : ""}`
}

/** Text an option is found by when typing its first letters: role name, then label. */
export function shiftTypeaheadText(s: ShiftRef): string {
  return s.label !== s.roleName ? `${s.roleName} ${s.label}` : s.roleName
}

/**
 * Index of the first option whose text starts with `query`, ignoring case and accents, looking
 * from `start` (included) and wrapping around; -1 when none matches. A query of one repeated
 * character (« bb ») looks for that character alone, so pressing a letter again cycles through
 * the options that start with it.
 */
/** Whether the typed letters are one letter repeated, case and accents aside (« e », « eÉ »). */
export function isRepeatedLetter(query: string): boolean {
  const folded = fold(query)
  return folded !== "" && [...folded].every((ch) => ch === folded[0])
}

export function typeaheadIndex(labels: string[], query: string, start: number): number {
  const count = labels.length
  if (count === 0 || query === "") return -1
  const folded = fold(query)
  const needle = isRepeatedLetter(query) ? folded[0] : folded
  const from = ((start % count) + count) % count
  for (let k = 0; k < count; k++) {
    const i = (from + k) % count
    if (fold(labels[i]).startsWith(needle)) return i
  }
  return -1
}

/** Keys that move the active option of an open list. */
export type MoveKey = "ArrowDown" | "ArrowUp" | "Home" | "End" | "PageDown" | "PageUp"

const PAGE = 10

/** The active option after a navigation key, clamped to the list (no wrap, as in the APG). */
export function moveActive(key: MoveKey, current: number, count: number): number {
  if (count <= 0) return -1
  const last = count - 1
  const clamp = (i: number) => Math.min(Math.max(i, 0), last)
  switch (key) {
    case "ArrowDown": return clamp(current + 1)
    case "ArrowUp": return clamp(current - 1)
    case "Home": return 0
    case "End": return last
    case "PageDown": return clamp(current + PAGE)
    case "PageUp": return clamp(current - PAGE)
  }
}

/**
 * Pixels to move the open list left so that it ends `margin` px inside the viewport, never past
 * the left margin (WCAG 1.4.10): 0 when it already fits.
 */
export function panelShift(triggerLeft: number, panelWidth: number, viewportWidth: number, margin = 8): number {
  const overflow = triggerLeft + panelWidth - (viewportWidth - margin)
  if (overflow <= 0) return 0
  return Math.min(overflow, Math.max(triggerLeft - margin, 0))
}
