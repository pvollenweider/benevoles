// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { crossesMidnight, toMin } from "./gantt-utils"
import { fmtHour, fmtShortDate } from "./registrations-list"

/**
 * A shift's name and time in words, for accessible names and texts a screen reader reads (#582):
 * commas instead of the « · » read « point », « de 10h à 12h » instead of the en dash read
 * « tiret ». Pure, so it can be shared by client components and tested on its own.
 */

/** "Samedi 4 juillet" from an ISO date (read in UTC, so server and browser agree). */
export function dayLabel(date: string): string {
  const day = new Date(`${date}T00:00:00Z`).toLocaleDateString("fr-FR", { timeZone: "UTC", weekday: "long", day: "numeric", month: "long" })
  return `${day.charAt(0).toUpperCase()}${day.slice(1)}`
}

type ShiftNameParts = { roleName: string; label?: string | null }
type ShiftWhenParts = { date: string; startTime: string; endTime: string }

/**
 * « de 10h à 12h », « de 22h à 2h, jusqu'au lendemain » (fmtHour, modulo 24). A legacy end written
 * past 24:00 (« 25:30 ») also runs into the next day.
 */
export function spokenTimeRange(start: string, end: string): string {
  const range = `de ${fmtHour(start)} à ${fmtHour(end)}`
  const nextDay = crossesMidnight(start, end) || toMin(end) > 24 * 60
  return nextDay ? `${range}, jusqu'au lendemain` : range
}

/** « Bar, Soir », or « Bar » when the label is the role (or empty). */
export function spokenShiftName(s: ShiftNameParts): string {
  return s.label && s.label !== s.roleName ? `${s.roleName}, ${s.label}` : s.roleName
}

/** « sam. 4 juil., de 10h à 12h »: the short date of a table cell, in words. */
export function spokenShortWhen(s: ShiftWhenParts): string {
  return `${fmtShortDate(s.date)}, ${spokenTimeRange(s.startTime, s.endTime)}`
}

/** « Bar, Soir, samedi 4 juillet, de 10h à 12h ». */
export function spokenShift(s: ShiftNameParts & ShiftWhenParts): string {
  const day = dayLabel(s.date)
  return `${spokenShiftName(s)}, ${day.charAt(0).toLowerCase()}${day.slice(1)}, ${spokenTimeRange(s.startTime, s.endTime)}`
}
