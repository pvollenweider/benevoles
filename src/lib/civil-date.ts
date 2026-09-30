// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { z } from "zod"

/**
 * Calendar dates ("YYYY-MM-DD") as the API accepts them. The forms send this format; the API is
 * the authority, so anything else (a typo, "2026-02-30", a free string) is refused with a 400
 * instead of becoming an Invalid Date that throws on save or, worse, slips through a comparison
 * (an Invalid Date birth date made every minimum-age check pass).
 */

export const CIVIL_DATE_ERROR = "Date invalide : format attendu AAAA-MM-JJ."

/** A real calendar day written YYYY-MM-DD (no 30 February, no 2026-13-01). */
export function isCivilDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false
  const d = new Date(`${s}T00:00:00Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s
}

/** Today in UTC as YYYY-MM-DD (dates are stored as UTC midnight). */
const todayIso = (now: Date) => now.toISOString().slice(0, 10)

export const BIRTH_DATE_ERROR = "Date de naissance invalide : indiquez une date réelle, passée, au format AAAA-MM-JJ."

/** A birth date: a real day, not in the future, not before 1900. */
export function isPlausibleBirthDate(s: string, now: Date = new Date()): boolean {
  return isCivilDate(s) && s >= "1900-01-01" && s <= todayIso(now)
}

export const civilDateSchema = z.string().trim().refine(isCivilDate, { message: CIVIL_DATE_ERROR })
export const birthDateSchema = z.string().trim().refine((s) => isPlausibleBirthDate(s), { message: BIRTH_DATE_ERROR })

export const DATE_ORDER_ERROR = "La date de fin ne peut pas précéder la date de début."

/** A period is in order when it ends on or after its start (civil dates compare as strings). */
export function isOrderedPeriod(start: string, end: string): boolean {
  return end >= start
}
