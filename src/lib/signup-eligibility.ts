// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Checks the public sign-up runs before its locked transaction, each one returning the refusal to
 * answer with, or null when the sign-up may go on. They read nothing themselves: the route loads
 * the rows and passes them in. The authoritative capacity and overlap checks run again under lock
 * in the route (#264, #285); these give the friendly early answer.
 */

import type { AnswerCheck } from "./event-questions"
import { normalizeEmail } from "./email-address"
import { acceptsRegistrations, refusalMessage, registrationState, type RegistrationWindow } from "./registration-window"
import { memberMayTake, reservationRefusal } from "./role-reservation"
import { orgTimeZone } from "./time-zone"
import { pastShiftLabel } from "./long-event"
import { shiftsTooYoungFor } from "./utils"
import { shiftsClash, type OverlapShift } from "./shift-overlap"

/** The HTTP answer to a refused sign-up: its status and JSON body. */
export type SignupRefusal = { status: number; body: { error: string } & Record<string, unknown> }

/**
 * Registration window (#463): the page may have been opened before registrations closed. The
 * event was loaded as published; what's left to check is the window.
 */
export function registrationWindowRefusal(
  event: Omit<RegistrationWindow, "publicStatus"> & { organization: { timeZone?: string | null } },
): SignupRefusal | null {
  const signupWindow = { ...event, publicStatus: "published" }
  if (acceptsRegistrations(signupWindow)) return null
  return { status: 409, body: { error: refusalMessage(registrationState(signupWindow), orgTimeZone(event.organization)) } }
}

/** Authoritative check: the form marks the field required too, but only as a courtesy. */
export function requiredPhoneRefusal(requirePhone: boolean, phone: string | undefined): SignupRefusal | null {
  if (requirePhone && !phone?.trim()) {
    return { status: 400, body: { error: "Le téléphone est obligatoire pour cet événement." } }
  }
  return null
}

/** Early, unlocked capacity check: a full shift without a waitlist is refused, one with a waitlist goes on. */
export function fullShiftRefusal(
  shifts: { id: string; label: string; capacity: number; waitlistEnabled: boolean; registrations: unknown[] }[],
): SignupRefusal | null {
  for (const shift of shifts) {
    if (shift.registrations.length >= shift.capacity && !shift.waitlistEnabled) {
      return fullShift(shift.id, shift.label)
    }
  }
  return null
}

export function fullShift(shiftId: string, label: string): SignupRefusal {
  return { status: 409, body: { error: `Le créneau "${label}" est complet. Recharge la page.`, fullShiftId: shiftId } }
}

/** Two of the asked shifts overlap each other, neither of a cumulable role (#986). */
export function selectionOverlapRefusal(shifts: (OverlapShift & { label: string })[]): SignupRefusal | null {
  for (let i = 0; i < shifts.length; i++) {
    for (let j = i + 1; j < shifts.length; j++) {
      if (shiftsClash(shifts[i], shifts[j])) {
        return { status: 400, body: { error: `Les créneaux "${shifts[i].label}" et "${shifts[j].label}" se chevauchent.` } }
      }
    }
  }
  return null
}

/** The first of the volunteer's registrations that clashes with one of the asked shifts (#986: a cumulable role may overlap). */
export function findOverlap(
  existing: { shift: OverlapShift & { label: string } }[],
  shifts: OverlapShift[],
): { label: string } | null {
  for (const reg of existing) {
    for (const shift of shifts) {
      if (shiftsClash(reg.shift, shift)) return { label: reg.shift.label }
    }
  }
  return null
}

export function overlapWithExisting(label: string): SignupRefusal {
  return { status: 409, body: { error: `Ce créneau chevauche une inscription existante (${label}).` } }
}

/** Overlap with one of the volunteer's live registrations of the event. */
export function existingOverlapRefusal(
  existing: { shift: OverlapShift & { label: string } }[],
  shifts: OverlapShift[],
): SignupRefusal | null {
  const clash = findOverlap(existing, shifts)
  return clash ? overlapWithExisting(clash.label) : null
}

type InviteMember = { volunteer: { email: string | null; tags: string[]; active: boolean } }

/**
 * Roles reserved to members with a tag (#470). The only proof of who signs up is a valid member
 * invitation of this event, for this very email, loaded only when a reserved role is asked; the
 * member's tags are read now, so a tag removed after the invitation was sent no longer opens the
 * role. `reserved` covers all the role's shifts, so a shift created without the tags can't open a
 * way around them.
 */
export async function reservedRoleRefusal(params: {
  shifts: { roleName: string }[]
  reserved: Map<string, string[]>
  /** Already normalized. */
  email: string
  loadInvite: () => Promise<InviteMember | null>
}): Promise<SignupRefusal | null> {
  const reservedAsked = [...new Set(params.shifts.map((s) => s.roleName))].filter((r) => params.reserved.has(r))
  if (reservedAsked.length === 0) return null
  const invite = await params.loadInvite()
  const proven = !!invite && invite.volunteer.active && normalizeEmail(invite.volunteer.email ?? "") === params.email
  for (const role of reservedAsked) {
    if (!proven || !memberMayTake(invite!.volunteer.tags, params.reserved.get(role)!)) {
      return { status: 403, body: { error: reservationRefusal(role, proven), reservedRole: role } }
    }
  }
  return null
}

/** Custom questions (#483), checked here whatever the page did. */
export function answersRefusal(check: AnswerCheck): SignupRefusal | null {
  if (check.ok) return null
  return {
    status: 400,
    body: { error: check.errors.map((e) => e.message).join(" "), questionIds: check.errors.map((e) => e.questionId), questionErrors: check.errors },
  }
}

/**
 * Minimum age (#192), authoritative: the client-side check in EventPageClient.tsx is only a
 * courtesy. Never trust an age the client itself computed: birthDate is what's validated.
 */
export function minimumAgeRefusal(
  shifts: { label: string; minAge: number | null; date: Date | string }[],
  birthDate: string | undefined,
): SignupRefusal | null {
  const ageGated = shifts.filter((s) => s.minAge != null)
  if (ageGated.length === 0) return null
  if (!birthDate) {
    return { status: 400, body: { error: `Date de naissance requise pour : ${ageGated.map((s) => `${s.label} (${s.minAge} ans min.)`).join(", ")}.` } }
  }
  const tooYoungFor = shiftsTooYoungFor(birthDate, ageGated)
  if (tooYoungFor.length > 0) {
    return { status: 403, body: { error: `Âge minimum non atteint pour : ${tooYoungFor.map((s) => `${s.label} (${s.minAge} ans min.)`).join(", ")}.` } }
  }
  return null
}

/**
 * A long-running event (#866): a day that is over can't be taken any more, even from a page left
 * open since. `today` is the organisation's local day, "YYYY-MM-DD".
 */
export function pastShiftRefusal(
  event: { startDate?: Date | null; endDate?: Date | null },
  shifts: { date: Date; label: string }[],
  today: string,
): SignupRefusal | null {
  const label = pastShiftLabel(event, shifts, today)
  return label ? { status: 409, body: { error: `Le créneau "${label}" est passé. Recharge la page.` } } : null
}

/**
 * A duplicate sign-up (#1047): one answer whatever the existing registration's status (active,
 * request, waitlist, offered place) and whether the link email went out, so the response doesn't
 * tell a stranger which state a known address is in. It never claims the email went out: the send
 * may be throttled or fail, and saying so would tell those cases apart again. `duplicate` lets the form explain it apart
 * from a full or overlapping shift.
 */
export const DUPLICATE_SIGNUP_MESSAGE =
  "Cette adresse a déjà une inscription ou une place en liste d'attente pour l'un de ces créneaux. " +
  "Si c'est la tienne, le lien pour gérer tes inscriptions est dans ton email de confirmation, et on essaie de te le renvoyer (trois fois par heure au plus). " +
  "Vérifie ta boîte de réception et les courriers indésirables."

export function duplicateSignupRefusal(): SignupRefusal {
  return { status: 409, body: { error: DUPLICATE_SIGNUP_MESSAGE, duplicate: true } }
}

/**
 * The personal link or the invitation the sign-up came with no longer proves the address (#1138
 * follow-up): checked again under the member lock, it was replaced in the meantime (an organiser
 * corrected the address, which renews every link of the member). Nothing is saved; the volunteer
 * starts again from the newest link they received. Same answer for both kinds of link.
 */
export const STALE_LINK_MESSAGE =
  "Le lien avec lequel tu t'inscris n'est plus valable : il a été remplacé. Rien n'a été enregistré."

export function staleLinkRefusal(): SignupRefusal {
  return { status: 409, body: { error: STALE_LINK_MESSAGE, staleLink: true } }
}
