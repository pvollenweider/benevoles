// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { addMinutes, toMin, toMinEnd } from "./gantt-utils"
import { addDays } from "./shift-series"

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

/** Why a moved time range can't be saved, or null. */
export function moveProblem(startTime: string, endTime: string): string | null {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(startTime) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(endTime)) return "Heure invalide : format HH:MM, de 00:00 à 23:59."
  if (startTime === endTime) return "L'heure de fin doit être différente de l'heure de début."
  return null
}
