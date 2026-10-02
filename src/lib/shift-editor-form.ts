// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { dayLabel } from "./action-recap"
import { fmtHour } from "./registrations-list"

/**
 * Wording and checks of the shift editor (#554), apart from the component so they can be tested:
 * which required fields are missing, their messages, and the announcement after a save.
 */

export type ShiftField = "roleName" | "date" | "startTime" | "endTime" | "capacity"

/** The required fields, in the order of the form (the first missing one gets focus). */
export const SHIFT_REQUIRED_FIELDS: readonly ShiftField[] = ["roleName", "date", "startTime", "endTime", "capacity"]

export const SHIFT_FIELD_ERRORS: Record<ShiftField, string> = {
  roleName:  "Indiquez le poste.",
  date:      "Choisissez la date.",
  startTime: "Indiquez l'heure de début.",
  endTime:   "Indiquez l'heure de fin.",
  capacity:  "Indiquez la capacité.",
}

const FIELD_NOUNS: Record<ShiftField, string> = {
  roleName:  "le poste",
  date:      "la date",
  startTime: "l'heure de début",
  endTime:   "l'heure de fin",
  capacity:  "la capacité",
}

type RequiredValues = Record<ShiftField, string | number | null | undefined>

/** The required fields left empty (blank counts as empty: « » is not a role), in form order. */
export function missingShiftFields(form: RequiredValues): ShiftField[] {
  return SHIFT_REQUIRED_FIELDS.filter((f) => String(form[f] ?? "").trim() === "")
}

/** « À remplir : le poste, la date et l'heure de fin. » An empty string when nothing is missing. */
export function missingFieldsSummary(fields: readonly ShiftField[]): string {
  if (fields.length === 0) return ""
  const nouns = fields.map((f) => FIELD_NOUNS[f])
  const list = nouns.length === 1 ? nouns[0] : `${nouns.slice(0, -1).join(", ")} et ${nouns[nouns.length - 1]}`
  return `À remplir : ${list}.`
}

/**
 * The announcement after a save, read aloud as words: « Créneau ajouté : Bar, samedi 4 juillet,
 * de 10h à 12h. » The label is said only when it differs from the role. `date` may be a day
 * (2026-07-04) or the ISO date-time the API returns.
 */
export function shiftSavedMessage(
  kind: "added" | "edited",
  s: { roleName: string; label?: string | null; date: string; startTime: string; endTime: string },
): string {
  const day = dayLabel(s.date.slice(0, 10))
  const label = s.label?.trim()
  const name = label && label !== s.roleName ? `${s.roleName}, ${label}` : s.roleName
  const verb = kind === "added" ? "ajouté" : "modifié"
  return `Créneau ${verb} : ${name}, ${day.charAt(0).toLowerCase()}${day.slice(1)}, de ${fmtHour(s.startTime)} à ${fmtHour(s.endTime)}.`
}
