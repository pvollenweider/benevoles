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

import { coordinatesOf, MAP_LINK_LABEL, osmLink } from "@/lib/map-link"

export type ShiftInfo = {
  locationDetails?: string | null
  contactName?: string | null
  contactPhone?: string | null
  instructions?: string | null
  /** Meeting point coordinates (#191), already resolved to the event's when the shift has none. */
  latitude?: number | null
  longitude?: number | null
}

export type ShiftInfoLine = { kind: "place" | "contact" | "instructions"; label: string; text: string; /** Map link of the place, when coordinates are known. */ href?: string }

const clean = (v: string | null | undefined) => (v ?? "").trim()

/** The lines to show, in reading order; empty when the shift has no practical info. */
export function shiftInfoLines(info: ShiftInfo): ShiftInfoLine[] {
  const lines: ShiftInfoLine[] = []
  const place = clean(info.locationDetails)
  const coords = coordinatesOf(info)
  if (place || coords) lines.push({ kind: "place", label: "Lieu", text: place || "Point de rendez-vous", ...(coords ? { href: osmLink(coords) } : {}) })
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

/** Plain-text lines for emails: « Lieu : Entrée B — Voir sur la carte : https://… ». */
export function shiftInfoText(info: ShiftInfo): string[] {
  return shiftInfoLines(info).map((l) => `${l.label} : ${l.text}${l.href ? ` — ${MAP_LINK_LABEL} : ${l.href}` : ""}`)
}

/**
 * The same fields picked from a shift row, for a notification payload. With the event, a shift
 * without its own coordinates takes the event's (#191).
 */
export function pickShiftInfo<T extends ShiftInfo>(s: T, event?: { latitude?: number | null; longitude?: number | null } | null): Required<ShiftInfo> {
  const coords = coordinatesOf(s) ?? coordinatesOf(event)
  return {
    locationDetails: s.locationDetails ?? null,
    contactName: s.contactName ?? null,
    contactPhone: s.contactPhone ?? null,
    instructions: s.instructions ?? null,
    latitude: coords?.latitude ?? null,
    longitude: coords?.longitude ?? null,
  }
}
