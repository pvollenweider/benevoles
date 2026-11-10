// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Pure rules of « Je ne peux pas » for one precise shift (#1303).
 *
 * A volunteer may answer no for a shift offered in the « On cherche encore du monde » email. The
 * answer is stored per (volunteer, shift), carries its date, and says nothing about the event's
 * other shifts nor about the event-level « pas disponible » (#558), a separate answer. It is never
 * a hard block: « Chercher des bénévoles » still lists the person for that shift, with the reason,
 * and the organiser may choose to ask again. Taking the shift later removes the answer.
 *
 * No Prisma import here: the two public POST routes, the admin search list and the email share it,
 * and the confirmation page can format its labels without a database.
 */

import { clockTime, crossesMidnight } from "./gantt-utils"

export type DateLike = Date | string

/** Which secret carried the link. Both already exist: the invitation token, or the personal link. */
export type ShiftDeclineSecret = "invitation" | "registration"

/** One answer, as the search list reads it. */
export type ShiftDeclineRef = { volunteerId: string; shiftId: string; declinedAt: DateLike }

/** A live registration of the member, on any shift of the event. */
export type MemberRegistrationRef = { shiftId: string; status: string }

/** The shift an answer would be about. `active` counts confirmed places only. */
export type ShiftDeclineShift = {
  id: string
  eventId: string
  roleName: string
  label: string
  date: DateLike
  startTime: string
  endTime: string
  status: string
  capacity: number
  active: number
}

export type ShiftDeclineState =
  | { kind: "open" }
  | { kind: "cancelled" }
  | { kind: "full" }
  | { kind: "past" }
  | { kind: "registered"; status: string }
  | { kind: "declined"; declinedAt: Date }

const LIVE_STATUSES = new Set(["active", "waiting", "offered", "requested"])

/** The answer's date on this shift, or null. */
export function declinedAtFor(declines: readonly ShiftDeclineRef[], volunteerId: string, shiftId: string): Date | null {
  const row = declines.find((d) => d.volunteerId === volunteerId && d.shiftId === shiftId)
  if (!row) return null
  return row.declinedAt instanceof Date ? row.declinedAt : new Date(row.declinedAt)
}

/** Whether the member answered no for this shift. */
export function hasDeclinedShift(declines: readonly ShiftDeclineRef[], volunteerId: string, shiftId: string): boolean {
  return declinedAtFor(declines, volunteerId, shiftId) !== null
}

/** The answers of one member, for the selected shifts only, with their dates. */
export function declinedShiftsOf(declines: readonly ShiftDeclineRef[], volunteerId: string, shiftIds: readonly string[]): { shiftId: string; declinedAt: Date }[] {
  const wanted = new Set(shiftIds)
  return declines
    .filter((d) => d.volunteerId === volunteerId && wanted.has(d.shiftId))
    .map((d) => ({ shiftId: d.shiftId, declinedAt: d.declinedAt instanceof Date ? d.declinedAt : new Date(d.declinedAt) }))
}

/**
 * What the page (and the POST route) may do with this shift. A cancelled shift wins over
 * everything, then the member's own live registration (already on it), then an answer already
 * given, then the date, then capacity. `startsAt` is the real instant, resolved in the event's
 * zone by the caller, so a page never calls a shift past because of a timezone.
 */
export function shiftDeclineState(input: {
  shift: ShiftDeclineShift
  registrations: readonly MemberRegistrationRef[]
  declinedAt: Date | null
  startsAt: Date
  now: Date
}): ShiftDeclineState {
  const { shift } = input
  if (shift.status === "cancelled") return { kind: "cancelled" }
  const mine = input.registrations.find((r) => r.shiftId === shift.id && LIVE_STATUSES.has(r.status))
  if (mine) return { kind: "registered", status: mine.status }
  if (input.declinedAt) return { kind: "declined", declinedAt: input.declinedAt }
  if (input.startsAt.getTime() <= input.now.getTime()) return { kind: "past" }
  if (shift.status === "full" || shift.status === "closed" || shift.active >= shift.capacity) return { kind: "full" }
  return { kind: "open" }
}

/** « A répondu non le 4 juillet 2026 », the reason the search list shows for that shift. */
export function shiftDeclineReason(declinedAt: DateLike): string {
  const d = declinedAt instanceof Date ? declinedAt : new Date(declinedAt)
  return `A répondu non le ${d.toLocaleDateString("fr-FR", { timeZone: "UTC", day: "numeric", month: "long", year: "numeric" })}`
}

/** The sentence of a page or POST answer that cannot record anything, or null for an open shift. */
export function shiftDeclineUnavailableMessage(state: ShiftDeclineState | { kind: "deleted" }): string | null {
  switch (state.kind) {
    case "open": return null
    case "deleted": return "Ce créneau n'existe plus."
    case "cancelled": return "Ce créneau a été annulé."
    case "full": return "Ce créneau est complet."
    case "past": return "Ce créneau est passé."
    case "registered": return "Tu as déjà une inscription sur ce créneau."
    case "declined": return `Tu as déjà indiqué le ${state.declinedAt.toLocaleDateString("fr-FR", { timeZone: "UTC", day: "numeric", month: "long", year: "numeric" })} ne pas pouvoir prendre ce créneau.`
  }
}

/** « Bar (Soir) », as the email and the admin list name a shift. */
export function shiftDeclineShiftName(s: { roleName: string; label: string }): string {
  return s.label && s.label !== s.roleName ? `${s.roleName} (${s.label})` : s.roleName
}

/** « samedi 4 juillet », from Shift.date (UTC midnight) or "YYYY-MM-DD". */
export function shiftDeclineDay(date: DateLike): string {
  const day = typeof date === "string" ? date.slice(0, 10) : date.toISOString().slice(0, 10)
  return new Date(`${day}T00:00:00Z`).toLocaleDateString("fr-FR", { timeZone: "UTC", weekday: "long", day: "numeric", month: "long" })
}

/** « de 22:00 à 02:00 le lendemain ». */
export function shiftDeclineHours(s: { startTime: string; endTime: string }): string {
  return `de ${clockTime(s.startTime)} à ${clockTime(s.endTime)}${crossesMidnight(s.startTime, s.endTime) ? " le lendemain" : ""}`
}

const PAGE_SEGMENT: Record<ShiftDeclineSecret, string> = { invitation: "invitation", registration: "inscription" }

/** The confirmation page a link opens: no answer on GET, only the button's POST writes. */
export function shiftDeclinePagePath(secret: ShiftDeclineSecret, token: string, shiftId: string): string {
  return `/ne-peux-pas/${PAGE_SEGMENT[secret]}/${encodeURIComponent(token)}/${encodeURIComponent(shiftId)}`
}

/** The token's kind from the page's first segment, or null for anything else. */
export function shiftDeclineSecretFromSegment(segment: string): ShiftDeclineSecret | null {
  if (segment === "invitation") return "invitation"
  if (segment === "inscription") return "registration"
  return null
}

/** The POST route of the same answer, rate limited and idempotent. */
export function shiftDeclineApiPath(secret: ShiftDeclineSecret, token: string, shiftId: string): string {
  const prefix = secret === "invitation" ? "member-invite" : "registrations"
  return `/api/public/${prefix}/${encodeURIComponent(token)}/shift-declines/${encodeURIComponent(shiftId)}`
}

/** The two POST routes' rate-limit names, also in FAIL_CLOSED_ROUTES (they guard a link secret). */
export const SHIFT_DECLINE_RATE_LIMIT = {
  invitation: "shift-decline-invitation",
  registration: "shift-decline-registration",
} as const
