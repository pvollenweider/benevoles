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

/**
 * The labels of the contacts, the same on every surface a volunteer reads (#560): the shift's
 * own contact, the event's day-of contact (its fallback), the organization's email.
 */
export const SHIFT_CONTACT_LABEL = "Contact pour ce créneau"
export const DAY_CONTACT_LABEL = "Contact le jour J"
export const ORG_CONTACT_LABEL = "Écrire à l'organisation"
/** The sector leaders of the shift's role (#560), by name only: never their email or phone. */
export const sectorLeaderLabel = (count: number) => (count > 1 ? "Responsables du poste" : "Responsable du poste")
/** Next to the day-of contact: it never stands in for the emergency services (#560). */
export const EMERGENCY_NOTE = "En cas d'urgence, appelle les numéros d'urgence officiels : ce contact ne les remplace pas."

import { coordinatesOf, MAP_LINK_LABEL, osmLink } from "@/lib/map-link"

export type ShiftInfo = {
  locationDetails?: string | null
  contactName?: string | null
  contactPhone?: string | null
  instructions?: string | null
  /** Meeting point coordinates (#191), already resolved to the event's when the shift has none. */
  latitude?: number | null
  longitude?: number | null
  /**
   * The event's day-of contact (#560), set only for a registered volunteer and only when the
   * shift has no contact of its own (see `withDayContact`). Never in a public payload.
   */
  dayContactName?: string | null
  dayContactPhone?: string | null
  /**
   * Names of the role's sector leaders (#186, #560), set only for a confirmed volunteer (see
   * `withSectorLeaders`). A name only: a leader's email or phone never reaches a volunteer,
   * unless the leader is also entered as the shift's or the day-of contact.
   */
  sectorLeaderNames?: string[] | null
}

export type ShiftInfoLine = { kind: "place" | "contact" | "dayContact" | "leader" | "instructions"; label: string; text: string; /** Map link of the place, when coordinates are known. */ href?: string }

const clean = (v: string | null | undefined) => (v ?? "").trim()

/** Whom to contact on site: the shift's contact, else the event's day-of contact (#560). */
export type OnSiteContact = { kind: "shift" | "day"; label: string; name: string; phone: string }

/**
 * The shift's contact when it has a name or a phone, else the day-of contact, never a mix of
 * both (a name from one and a phone from the other would point to the wrong person).
 */
export function onSiteContact(info: ShiftInfo): OnSiteContact | null {
  const name = clean(info.contactName)
  const phone = clean(info.contactPhone)
  if (name || phone) return { kind: "shift", label: SHIFT_CONTACT_LABEL, name, phone }
  const dayName = clean(info.dayContactName)
  const dayPhone = clean(info.dayContactPhone)
  if (dayName || dayPhone) return { kind: "day", label: DAY_CONTACT_LABEL, name: dayName, phone: dayPhone }
  return null
}

/** The `tel:` URL of a number as typed: digits and a leading « + » only. */
export const telHref = (phone: string) => `tel:${phone.replace(/[^\d+]/g, "")}`

/** « Léa, 079 000 00 00 », « Léa » or « 079 000 00 00 ». */
export const contactText = (c: Pick<OnSiteContact, "name" | "phone">) => [c.name, c.phone].filter(Boolean).join(", ")

/**
 * The shift's info with the event's day-of contact attached, only when the shift has no contact
 * of its own: the payload carries the day-of phone only where it is shown. For registered
 * volunteers only (personal page, reminders, individual printed sheet).
 */
export function withDayContact<T extends ShiftInfo>(info: T, event: { dayContactName?: string | null; dayContactPhone?: string | null } | null | undefined): T {
  const name = clean(event?.dayContactName)
  const phone = clean(event?.dayContactPhone)
  if ((!name && !phone) || clean(info.contactName) || clean(info.contactPhone)) return info
  return { ...info, dayContactName: name || null, dayContactPhone: phone || null }
}

/** Names of the leaders of this role, trimmed, without blanks or repeats. */
export function sectorLeaderNames(roleName: string, leaders: { roleName: string; name: string }[] | null | undefined): string[] {
  return [...new Set((leaders ?? []).filter((l) => l.roleName === roleName).map((l) => clean(l.name)).filter(Boolean))]
}

/**
 * The shift's info with the names of its role's sector leaders attached (#560). For confirmed
 * volunteers only (personal page, reminders, individual printed sheet). Only `name` is read.
 */
export function withSectorLeaders<T extends ShiftInfo>(info: T, roleName: string, leaders: { roleName: string; name: string }[] | null | undefined): T {
  const names = sectorLeaderNames(roleName, leaders)
  return names.length ? { ...info, sectorLeaderNames: names } : info
}

/** Whether these lines show the day-of contact, so the emergency note goes with them. */
export const showsDayContact = (lines: ShiftInfoLine[]) => lines.some((l) => l.kind === "dayContact")

/** The emergency note once for a message or a sheet that shows the day-of contact for any of its shifts, else null. */
export function emergencyNoteFor(infos: ShiftInfo[]): string | null {
  return infos.some((i) => onSiteContact(i)?.kind === "day") ? EMERGENCY_NOTE : null
}

/** The lines to show, in reading order; empty when the shift has no practical info. */
export function shiftInfoLines(info: ShiftInfo): ShiftInfoLine[] {
  const lines: ShiftInfoLine[] = []
  const place = clean(info.locationDetails)
  const coords = coordinatesOf(info)
  if (place || coords) lines.push({ kind: "place", label: "Lieu", text: place || "Point de rendez-vous", ...(coords ? { href: osmLink(coords) } : {}) })
  const contact = onSiteContact(info)
  if (contact) lines.push({ kind: contact.kind === "shift" ? "contact" : "dayContact", label: contact.label, text: contactText(contact) })
  const leaders = (info.sectorLeaderNames ?? []).map(clean).filter(Boolean)
  if (leaders.length) lines.push({ kind: "leader", label: sectorLeaderLabel(leaders.length), text: leaders.join(", ") })
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
export function pickShiftInfo<T extends ShiftInfo>(s: T, event?: { latitude?: number | null; longitude?: number | null } | null): Required<Omit<ShiftInfo, "dayContactName" | "dayContactPhone" | "sectorLeaderNames">> {
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
