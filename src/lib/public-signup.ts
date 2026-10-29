// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { shiftsTooYoungFor } from "./utils"
import { shiftsClash } from "./shift-overlap"
import { tooLongSignupField } from "./signup-limits"
import { INSTANCE_OPERATOR_PATH, isHostedService } from "@/lib/site"

/**
 * Pure logic of the public sign-up page (EventPageClient), kept out of the component so it can
 * be tested on its own (#291): which shifts can be picked, which ones clash, form validation,
 * and the "my registrations" session restored from a management token.
 */

export type SignupShift = {
  id: string
  label: string
  date: string
  startTime: string
  endTime: string
  status: string
  waitlistEnabled: boolean
  minAge: number | null
  /** Its role may overlap another shift (#986): never a conflict. */
  overlapAllowed?: boolean
}

export type MyRegistration = {
  shiftId: string
  token: string
  label: string
  roleName: string
  startTime: string
  endTime: string
  /** The registration's status (active, requested, waiting, offered): the withdrawal words depend on it. */
  status: string
  /** False once the volunteer can't cancel it online any more (#946): started, or past the event's deadline. */
  cancellable: boolean
}

export type SignupForm = {
  firstName: string
  lastName: string
  email: string
  phone: string
  birthDate: string
  comment: string
  consent: boolean
}

/** Privacy policy section linked under the sign-up consent (#706): the volunteers' rights,
 *  followed by the retention section. The id lives in src/app/legal/privacy/page.tsx. */
/** The privacy link of the volunteer's consent on the hosted service: the rights section. */
export const CONSENT_PRIVACY_HREF = "/legal/privacy#droits"

/** The same link on this instance (#760: the operator page outside the hosted service). Server only. */
export function consentPrivacyHref(): string {
  return isHostedService() ? CONSENT_PRIVACY_HREF : INSTANCE_OPERATOR_PATH
}

export const EMPTY_SIGNUP_FORM: SignupForm = {
  firstName: "", lastName: "", email: "", phone: "", birthDate: "", comment: "", consent: false,
}

/** Can this shift be added to the selection (not closed/cancelled, full only with a waitlist, not already mine)? */
export function isShiftSelectable(shift: SignupShift | undefined, myShiftIds: Set<string>): boolean {
  if (!shift) return false
  if (shift.status === "closed" || shift.status === "cancelled") return false
  if (shift.status === "full" && !shift.waitlistEnabled) return false
  return !myShiftIds.has(shift.id)
}

/** Shifts that clash with something already selected or registered, so they can't be picked too (#986: a cumulable role never clashes). */
export function conflictingShiftIds<S extends SignupShift>(shifts: S[], selected: Set<string>, myShiftIds: Set<string>): Set<string> {
  const taken = shifts.filter((s) => selected.has(s.id) || myShiftIds.has(s.id))
  return new Set(
    shifts
      .filter((s) => !selected.has(s.id) && !myShiftIds.has(s.id))
      .filter((candidate) => taken.some((ref) => shiftsClash(candidate, ref)))
      .map((s) => s.id),
  )
}

/** Whether at least one shift can still be signed up for (open, or full with a waitlist). */
export function hasAvailableShift(shifts: SignupShift[]): boolean {
  return shifts.some(
    (s) => (s.status !== "full" && s.status !== "closed" && s.status !== "cancelled") || (s.status === "full" && s.waitlistEnabled),
  )
}

/** Shifts grouped by calendar day (YYYY-MM-DD), in their original order. */
export function shiftsByDay<S extends { date: string }>(shifts: S[]): Record<string, S[]> {
  return shifts.reduce<Record<string, S[]>>((acc, shift) => {
    const day = new Date(shift.date).toISOString().split("T")[0]
    ;(acc[day] ??= []).push(shift)
    return acc
  }, {})
}

/** First blocking problem with the form, or null. Mirrors the server's own checks (courtesy only). */
export function validateSignup(input: {
  form: SignupForm
  charterAccepted: boolean
  requirePhone: boolean
  ageGatedShifts: SignupShift[]
  /** The event protects minors (#1171, lot 2): the birth date is required. */
  minorsProtected?: boolean
}): string | null {
  const { form } = input
  if (!input.charterAccepted) return "Accepte la convention des bénévoles."
  if (!form.consent) return "Coche la case d'accord sur tes données pour t'inscrire."
  if (!form.firstName || !form.lastName || !form.email) return "Prénom, nom et email sont obligatoires."
  // `required` already blocks an empty field; this catches a whitespace-only one.
  if (input.requirePhone && !form.phone.trim()) return "Le téléphone est obligatoire pour cet événement."
  // #1047: a phone saved before the limit may come back pre-filled, longer than the field allows.
  const tooLong = tooLongSignupField(form)
  if (tooLong) return tooLong.message
  if (input.minorsProtected && !form.birthDate) return "Date de naissance requise : cet événement protège les moins de 18 ans (pauses et charge)."
  if (input.ageGatedShifts.length > 0) {
    if (!form.birthDate) return "Date de naissance requise pour au moins un des créneaux sélectionnés."
    const tooYoungFor = shiftsTooYoungFor(form.birthDate, input.ageGatedShifts)
    if (tooYoungFor.length > 0) {
      return `Âge minimum non atteint pour : ${tooYoungFor.map((s) => `${s.label} (${s.minAge} ans min.)`).join(", ")}.`
    }
  }
  return null
}

type ApiRegistration = {
  editToken: string
  status: string
  selfCancel?: { allowed: boolean }
  shift: { id: string; label: string; roleName?: string; startTime: string; endTime: string }
}

/** "My registrations" from GET /api/public/registrations/[token]. */
export function toMyRegistrations(registrations: ApiRegistration[]): MyRegistration[] {
  return registrations.map((r) => ({
    shiftId: r.shift.id,
    token: r.editToken,
    label: r.shift.label,
    roleName: r.shift.roleName ?? "",
    startTime: r.shift.startTime,
    endTime: r.shift.endTime,
    status: r.status,
    cancellable: r.selfCancel?.allowed !== false,
  }))
}

type Contact = { firstName?: string; lastName?: string; email?: string | null; phone?: string | null }

/**
 * Fills the form's contact fields from a known source. `prefer: "source"` overwrites what's
 * typed (restoring a session from the volunteer's own link), `prefer: "form"` only fills empty
 * fields (a member invite pre-fill must not erase what the visitor already typed).
 */
export function prefillContact(form: SignupForm, source: Contact, prefer: "source" | "form"): SignupForm {
  const pick = (current: string, incoming: string | null | undefined) =>
    prefer === "source" ? (incoming || current) : (current || incoming || "")
  return {
    ...form,
    firstName: pick(form.firstName, source.firstName),
    lastName: pick(form.lastName, source.lastName),
    email: pick(form.email, source.email),
    phone: pick(form.phone, source.phone),
  }
}

/**
 * A shift proposed to this visitor by an organizer's email (« Je prends ce créneau », #869):
 * offer: free, one click selects it; waitlist: full, its waitlist is open; selected: already in
 * the selection; held: already registered; unavailable: closed, cancelled, full without waitlist,
 * reserved to others, out of the registration window, or unknown. The usual sign-up then applies.
 */
export type ProposedShiftState = "offer" | "waitlist" | "selected" | "selected_waitlist" | "held" | "unavailable"

export function proposedShiftState(
  shift: SignupShift | undefined,
  ctx: { myShiftIds: Set<string>; selected: Set<string>; reservedIds: Set<string>; accepting: boolean },
): ProposedShiftState {
  if (!shift) return "unavailable"
  if (ctx.myShiftIds.has(shift.id)) return "held"
  if (ctx.selected.has(shift.id)) return shift.status === "full" ? "selected_waitlist" : "selected"
  if (!ctx.accepting || ctx.reservedIds.has(shift.id) || !isShiftSelectable(shift, ctx.myShiftIds)) return "unavailable"
  return shift.status === "full" ? "waitlist" : "offer"
}

/** What the banner says for that state; `name` is the spoken shift (« Bar, samedi 4 juillet, de 10 h à 12 h »). */
export function proposedShiftText(state: ProposedShiftState, name: string): string {
  switch (state) {
    case "offer": return `On te propose ce créneau : ${name}.`
    case "waitlist": return `Plus de place libre sur ce créneau : ${name}. Tu peux rejoindre sa liste d'attente.`
    case "selected": return `Créneau choisi : ${name}. Continue pour confirmer ton inscription.`
    case "selected_waitlist": return `Liste d'attente choisie : ${name}. Continue pour confirmer ton inscription sur la liste d'attente.`
    case "held": return `Tu es déjà inscrit·e sur ce créneau : ${name}.`
    case "unavailable": return "Le créneau proposé n'est plus disponible. D'autres créneaux sont peut-être encore ouverts ci-dessous."
  }
}

/** The hint under the birth date field: the shifts with a minimum age, and the minors' protection. */
export function birthDateHint(ageGated: { label: string; minAge: number | null }[], minorsProtected: boolean): string {
  const shifts = ageGated.map((s) => `${s.label} (${s.minAge} ans min.)`).join(", ")
  if (shifts && minorsProtected) return `Requise : ${shifts} ; cet événement protège aussi les moins de 18 ans (pauses et charge).`
  if (minorsProtected) return "Requise : cet événement protège les moins de 18 ans (pauses et charge)."
  return `Requis : ${shifts}`
}
