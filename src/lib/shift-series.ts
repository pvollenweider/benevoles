// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { fromMin, toMin, toMinEnd } from "./gantt-utils"

/**
 * A series of shifts in one go (#393): « Buvette, samedi de 10 h à 22 h, créneaux de deux heures »
 * gives six shifts, each editable afterwards. Pure: the form previews the same list the API
 * creates.
 */

export const SERIES_MAX_SHIFTS = 48
export const SERIES_MIN_SLOT_MINUTES = 15
export const SERIES_MAX_BREAK_MINUTES = 240

export type SeriesInput = {
  /** First day of the series, "YYYY-MM-DD". */
  date: string
  /** Wall-clock "HH:MM"; an end at or before the start means the next morning. */
  startTime: string
  endTime: string
  slotMinutes: number
  /** Gap between two shifts, in minutes (0 by default). */
  breakMinutes?: number
}

export type SeriesSlot = { date: string; startTime: string; endTime: string; minutes: number }

/** `days` after a "YYYY-MM-DD" date, in UTC (shift dates are UTC midnights). */
export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

/**
 * The shifts of a series, in order. The last one is shorter when the range doesn't divide
 * evenly, so the whole range is covered; the caller may drop it. A shift that starts after
 * midnight belongs to the next calendar date, as elsewhere in the app.
 */
export function generateShiftSeries({ date, startTime, endTime, slotMinutes, breakMinutes = 0 }: SeriesInput): SeriesSlot[] {
  const start = toMin(startTime)
  const end = toMinEnd(endTime, startTime)
  const slots: SeriesSlot[] = []
  for (let from = start; from < end && slots.length < SERIES_MAX_SHIFTS; from += slotMinutes + breakMinutes) {
    const to = Math.min(from + slotMinutes, end)
    slots.push({
      date: addDays(date, Math.floor(from / 1440)),
      startTime: fromMin(from),
      endTime: fromMin(to),
      minutes: to - from,
    })
  }
  return slots
}

/** Why the series can't be generated, or null. Mirrors the API's validation for the form. */
export function seriesProblem(input: SeriesInput): string | null {
  if (!Number.isInteger(input.slotMinutes) || input.slotMinutes < SERIES_MIN_SLOT_MINUTES)
    return `La durée d'un créneau est d'au moins ${SERIES_MIN_SLOT_MINUTES} minutes.`
  const brk = input.breakMinutes ?? 0
  if (!Number.isInteger(brk) || brk < 0 || brk > SERIES_MAX_BREAK_MINUTES)
    return `La pause entre deux créneaux va de 0 à ${SERIES_MAX_BREAK_MINUTES} minutes.`
  if (input.startTime === input.endTime) return "L'heure de fin doit être différente de l'heure de début."
  const total = toMinEnd(input.endTime, input.startTime) - toMin(input.startTime)
  if (input.slotMinutes > total) return "La durée d'un créneau dépasse la plage horaire."
  if (Math.ceil(total / (input.slotMinutes + brk)) > SERIES_MAX_SHIFTS)
    return `Une série compte au plus ${SERIES_MAX_SHIFTS} créneaux.`
  return null
}

/** « 6 créneaux de 2 h, le dernier de 1 h 30 » for the preview and the confirmation. */
export function describeSeries(slots: SeriesSlot[]): string {
  if (slots.length === 0) return "Aucun créneau."
  const n = slots.length
  const full = slots[0].minutes
  const last = slots[n - 1].minutes
  const head = `${n} créneau${n > 1 ? "x" : ""} de ${fmtDuration(full)}`
  return last !== full ? `${head}, le dernier de ${fmtDuration(last)}` : head
}

export function fmtDuration(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h === 0) return `${m} min`
  return m === 0 ? `${h} h` : `${h} h ${String(m).padStart(2, "0")}`
}
