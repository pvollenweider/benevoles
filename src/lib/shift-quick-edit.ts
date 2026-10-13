// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { addMinutes, toMin, toMinEnd } from "./gantt-utils"
import { addDays } from "./shift-series"
import { minVolunteersProblem } from "./staffing"

/**
 * Quick edits from the schedule (#398): the rules behind « Dupliquer », « Décaler » and
 * « Appliquer la capacité à tout le poste », shared by the popover and the API.
 */

/**
 * Where a duplicate goes: right after the original, same length. A copy that would start at or
 * after midnight belongs to the next day, as everywhere else in the app.
 */
export function slotAfter(shift: { date: string; startTime: string; endTime: string }): { date: string; startTime: string; endTime: string } {
  const start = toMin(shift.startTime)
  const end = toMinEnd(shift.endTime, shift.startTime)
  const duration = end - start
  const nextDay = end >= 1440
  return {
    date: nextDay ? addDays(shift.date, 1) : shift.date,
    startTime: addMinutes("00:00", end % 1440),
    endTime: addMinutes("00:00", (end + duration) % 1440),
  }
}

export type CapacityTarget = { id: string; capacity: number; active: number }

/**
 * The capacity to set on each shift of a role: the asked one, never below the people already
 * confirmed on that shift. Reports the shifts kept higher for that reason.
 */
export function capacityPlan(shifts: CapacityTarget[], capacity: number): { updates: { id: string; capacity: number }[]; keptHigher: string[] } {
  const updates: { id: string; capacity: number }[] = []
  const keptHigher: string[] = []
  for (const s of shifts) {
    const next = Math.max(capacity, s.active)
    if (next !== capacity) keptHigher.push(s.id)
    if (next !== s.capacity) updates.push({ id: s.id, capacity: next })
  }
  return { updates, keptHigher }
}

export type MinimumTarget = { id: string; capacity: number; minVolunteers: number | null }

/**
 * The minimum of people to set on each shift of a role (#949), from « Appliquer à tout le poste ».
 * `capacity` is each shift's capacity once the places are applied. `minVolunteers` undefined keeps
 * every shift's own minimum, null removes it. Refused, with nothing to update, when a minimum would
 * be above a shift's places: the organizer lowers the minimum first.
 */
export function roleMinimumPlan(shifts: MinimumTarget[], minVolunteers: number | null | undefined): { updates: { id: string; minVolunteers: number | null }[]; problem: string | null } {
  if (minVolunteers != null) {
    const invalid = minVolunteersProblem(minVolunteers, Math.max(...shifts.map((s) => s.capacity), 1))
    if (invalid) return { updates: [], problem: invalid }
  }
  const next = (s: MinimumTarget) => (minVolunteers === undefined ? s.minVolunteers : minVolunteers)
  const tooHigh = shifts.filter((s) => { const m = next(s); return m != null && m > s.capacity })
  if (tooHigh.length > 0) {
    const n = tooHigh.length
    return { updates: [], problem: `Sur ${n} créneau${n > 1 ? "x" : ""} du poste, le minimum dépasserait les places : baissez d'abord le minimum.` }
  }
  return {
    updates: shifts.filter((s) => next(s) !== s.minVolunteers).map((s) => ({ id: s.id, minVolunteers: next(s) })),
    problem: null,
  }
}

/** Why a moved time range can't be saved, or null. */
export function moveProblem(startTime: string, endTime: string): string | null {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(startTime) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(endTime)) return "Heure invalide : format HH:MM, de 00:00 à 23:59."
  if (startTime === endTime) return "L'heure de fin doit être différente de l'heure de début."
  return null
}
