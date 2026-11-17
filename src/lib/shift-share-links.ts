// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Share link for one shift (#1386): « Partager ce créneau », `/<event>?partage=<code>`, for a gap
 * that appears at the last minute. The link opens the event's sign-up page on that shift only, and
 * counts the sign-ups it brought (Registration.shiftShareLinkId).
 *
 * One pure rule decides whether the shift is bookable through its link: the public page shows it,
 * and the sign-up route accepts it, in exactly the same cases. The shift must be open, have a free
 * place (no waitlist through this link) and not have started. The event's registration window
 * applies as usual, except with `acceptsAfterClose`: a link may then accept after the closing date
 * passed or registrations were turned off, but never before the opening date and never on an
 * unpublished event. `now` and the organisation's time zone are passed in.
 *
 * Code, alphabet and length are the group links' (src/lib/group-links.ts): what is copied by hand
 * stays readable, and no new code format is invented.
 */

import { GROUP_CODE_LENGTH, generateGroupCode, parseGroupCode } from "./group-links"
import { registrationState, type RegistrationWindow } from "./registration-window"
import { shiftStartsAt } from "./cancel-deadline"

/** URL parameter of a shift share link: `/<event>?partage=<code>`. */
export const SHIFT_SHARE_PARAM = "partage"
export const SHIFT_SHARE_CODE_LENGTH = GROUP_CODE_LENGTH

/** The code of the URL parameter, or null when it can't be one (nothing is looked up then). */
export function parseShiftShareCode(raw: string | string[] | null | undefined): string | null {
  return parseGroupCode(raw)
}

/** A random code, never derived from the shift or a counter. `randomInt(n)` returns [0, n). */
export function generateShiftShareCode(randomInt: (max: number) => number): string {
  return generateGroupCode(randomInt)
}

/** A public event URL with the shift's code, whatever query it already has (`?org=` locally). */
export function shiftShareLinkUrl(publicUrl: string, code: string): string {
  const url = new URL(publicUrl)
  url.searchParams.set(SHIFT_SHARE_PARAM, code)
  return url.toString()
}

type TimedShift = { status: string; date: Date | string; startTime: string; endTime: string; capacity: number }

/** Why a link can't be booked through right now. */
export type ShiftShareRefusalReason =
  /** The event isn't published (the page answers 404; the sign-up route refuses it). */
  | "not_published"
  /** The shift isn't open (closed or cancelled). */
  | "closed"
  /** The shift has started: a last-minute link is for a shift still to come. */
  | "started"
  /** Every place is taken: a link never sends anyone to the waitlist. */
  | "full"
  /** The event's registrations have not opened yet: the checkbox never opens them early. */
  | "not_yet"
  /** Registrations are closed (date passed or turned off), without `acceptsAfterClose`. */
  | "window_closed"

export type ShiftShareBooking =
  | { bookable: true }
  | { bookable: false; reason: ShiftShareRefusalReason }

const instant = (v: Date | string | null | undefined): Date | null =>
  v == null ? null : v instanceof Date ? v : new Date(v)

/**
 * Whether a sign-up for this shift may go through the link now. The single rule shared by the
 * public page and the sign-up route (#1386, decision (b)): the shift first (open, not started,
 * free place), then the event's window, which only `acceptsAfterClose` may bypass once it has
 * opened and while the event is published.
 */
export function shiftShareBooking(input: {
  event: RegistrationWindow
  shift: TimedShift
  /** Registrations holding a place (OCCUPYING_STATUSES). */
  occupied: number
  acceptsAfterClose: boolean
  now: Date
  timeZone: string
}): ShiftShareBooking {
  if (input.event.publicStatus !== "published") return { bookable: false, reason: "not_published" }
  if (input.shift.status !== "open") return { bookable: false, reason: "closed" }
  if (shiftStartsAt(input.shift, input.timeZone).getTime() <= input.now.getTime()) {
    return { bookable: false, reason: "started" }
  }
  if (input.occupied >= input.shift.capacity) return { bookable: false, reason: "full" }
  // The opening date is never bypassed, even with the checkbox: checked before registrationState,
  // which would answer "closed" when the switch is off and hide a future opening date.
  const opensAt = instant(input.event.registrationOpensAt)
  if (opensAt && input.now.getTime() < opensAt.getTime()) return { bookable: false, reason: "not_yet" }
  const state = registrationState(input.event, input.now)
  if (state.open) return { bookable: true }
  if (input.acceptsAfterClose && (state.reason === "closed" || state.reason === "ended")) return { bookable: true }
  return { bookable: false, reason: "window_closed" }
}

/**
 * What the public page does with a resolved link. Only a bookable link narrows the page to its
 * shift; a shift that is full, started or closed falls back to the whole event with a notice. A
 * closed or not-yet-open registration window keeps the page's usual message, without a notice.
 */
export type ShiftShareView =
  | { kind: "none" }
  | { kind: "bookable"; code: string; shiftId: string }
  | { kind: "unavailable" }

export function shiftShareView(booking: ShiftShareBooking, code: string, shiftId: string): ShiftShareView {
  if (booking.bookable) return { kind: "bookable", code, shiftId }
  return booking.reason === "closed" || booking.reason === "started" || booking.reason === "full"
    ? { kind: "unavailable" }
    : { kind: "none" }
}

/** Said when the shift is no longer bookable: the whole event is shown instead. */
export const SHIFT_SHARE_UNAVAILABLE_NOTICE =
  "Ce créneau est complet ou déjà commencé. Voici les autres créneaux de l'événement."

/** The line above the only shift a bookable link shows. */
export const SHIFT_SHARE_HEADING = "L'organisation a besoin de monde sur ce créneau."

/** Said when the link accepts after the event's window closed (option b). */
export const SHIFT_SHARE_AFTER_CLOSE_HINT =
  "Les inscriptions de l'événement sont fermées, mais ce créneau reste ouvert tant qu'il reste une place et qu'il n'a pas commencé."

/** The refusal the sign-up route answers for a shift that has already started. */
export function shiftShareStartedRefusal(label: string) {
  return { status: 409, body: { error: `Le créneau "${label}" a déjà commencé. Recharge la page.` } }
}

/** A link as the admin panel shows it: its URL, its option and the sign-ups it brought. */
export type AdminShiftLink = {
  id: string
  shiftId: string
  code: string
  url: string
  acceptsAfterClose: boolean
  registrations: number
}

/** « 3 inscriptions par ce lien », « Aucune inscription par ce lien pour l'instant ». */
export function shiftShareRegistrationsText(registrations: number): string {
  if (registrations <= 0) return "Aucune inscription par ce lien pour l'instant"
  return `${registrations} inscription${registrations > 1 ? "s" : ""} par ce lien`
}

/** Refused creation for a role assigned by the organisation only: it has no public link. */
export const SHIFT_SHARE_ASSIGNED_ONLY_ERROR =
  "Ce poste est attribué par l'organisation uniquement : il n'a pas de lien public."
