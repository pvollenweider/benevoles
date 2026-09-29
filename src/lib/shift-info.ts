// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Practical info of a shift (#397): place, contact person, instruction. One shape for the
 * confirmation email, the reminders, the personal page and the sign-up recap, so the
 * volunteer reads the same thing everywhere.
 */

export const SHIFT_CONTACT_NAME_MAX = 80
export const SHIFT_CONTACT_PHONE_MAX = 40
export const SHIFT_INSTRUCTIONS_MAX = 500

export type ShiftInfo = {
  locationDetails?: string | null
  contactName?: string | null
  contactPhone?: string | null
  instructions?: string | null
}

export type ShiftInfoLine = { kind: "place" | "contact" | "instructions"; label: string; text: string }

const clean = (v: string | null | undefined) => (v ?? "").trim()

/** The lines to show, in reading order; empty when the shift has no practical info. */
export function shiftInfoLines(info: ShiftInfo): ShiftInfoLine[] {
  const lines: ShiftInfoLine[] = []
  const place = clean(info.locationDetails)
  if (place) lines.push({ kind: "place", label: "Lieu", text: place })
  const name = clean(info.contactName)
  const phone = clean(info.contactPhone)
  if (name || phone) lines.push({ kind: "contact", label: "Contact", text: [name, phone].filter(Boolean).join(" · ") })
  const instructions = clean(info.instructions)
  if (instructions) lines.push({ kind: "instructions", label: "À savoir", text: instructions })
  return lines
}

export function hasShiftInfo(info: ShiftInfo): boolean {
  return shiftInfoLines(info).length > 0
}

/** Plain-text lines for emails: « Lieu : Entrée B ». */
export function shiftInfoText(info: ShiftInfo): string[] {
  return shiftInfoLines(info).map((l) => `${l.label} : ${l.text}`)
}

/** The same fields picked from a shift row, for a notification payload. */
export function pickShiftInfo<T extends ShiftInfo>(s: T): Required<ShiftInfo> {
  return {
    locationDetails: s.locationDetails ?? null,
    contactName: s.contactName ?? null,
    contactPhone: s.contactPhone ?? null,
    instructions: s.instructions ?? null,
  }
}
