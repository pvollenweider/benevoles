// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { shiftsOverlap, shiftsTooYoungFor } from "./utils"
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

/** Shifts that overlap something already selected or registered, so they can't be picked too. */
export function conflictingShiftIds<S extends SignupShift>(shifts: S[], selected: Set<string>, myShiftIds: Set<string>): Set<string> {
  const taken = shifts.filter((s) => selected.has(s.id) || myShiftIds.has(s.id))
  return new Set(
    shifts
      .filter((s) => !selected.has(s.id) && !myShiftIds.has(s.id))
      .filter((candidate) => taken.some((ref) => shiftsOverlap(candidate, ref)))
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
}): string | null {
  const { form } = input
  if (!input.charterAccepted) return "Accepte la convention des bénévoles."
  if (!form.consent) return "Coche la case d'accord sur tes données pour t'inscrire."
  if (!form.firstName || !form.lastName || !form.email) return "Prénom, nom et email sont obligatoires."
  // `required` already blocks an empty field; this catches a whitespace-only one.
  if (input.requirePhone && !form.phone.trim()) return "Le téléphone est obligatoire pour cet événement."
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
