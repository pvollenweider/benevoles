// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Signing up for more shifts from the personal page (#1013): the form opens with the volunteer's
 * contact details and answers, and what they change there is saved, as on the personal page
 * (#997). This module holds what changed in the contact details, and the confirmation that says
 * what was updated. Pure and client-safe (no Prisma): the API computes the changes, the
 * confirmation page reads them back from its address.
 *
 * Only the name and the phone change this way. The email is who the volunteer is in the
 * organisation (one member per address): the personal link proves ownership of its own member's
 * address only, so another address typed in the form is a sign-up under that address, with the
 * usual rules (#285), and nothing of this member nor of another one is rewritten.
 */

export type ContactField = "firstName" | "lastName" | "phone"

const CONTACT_FIELDS: ContactField[] = ["firstName", "lastName", "phone"]

export type ContactChange = { field: ContactField; from: string | null; to: string | null }

type Contact = { firstName?: string | null; lastName?: string | null; phone?: string | null }

const clean = (v: string | null | undefined) => v?.trim() || null

/**
 * The contact fields that differ between what the form started from (the member's name and the
 * phone the personal page shows, `contactPhone`) and what was sent, trimmed; a phone emptied is a
 * change to none. A field the request did not send (undefined) keeps its value.
 */
export function contactChanges(stored: Contact, submitted: Contact): ContactChange[] {
  const out: ContactChange[] = []
  for (const field of CONTACT_FIELDS) {
    if (submitted[field] === undefined) continue
    const from = clean(stored[field])
    const to = clean(submitted[field])
    if (from !== to) out.push({ field, from, to })
  }
  return out
}

/** What a sign-up from the personal page updated, as the API answers it. */
export type SignupUpdates = { contact: ContactField[]; answers: number }

const FIELD_TEXT: Record<ContactField, string> = { firstName: "ton prénom", lastName: "ton nom", phone: "ton téléphone" }

const joinFr = (parts: string[]) => (parts.length <= 1 ? parts.join("") : `${parts.slice(0, -1).join(", ")} et ${parts[parts.length - 1]}`)

/**
 * The confirmation's line: « Modifications enregistrées : ton téléphone et 1 réponse. »; null when
 * nothing was updated, so the confirmation says nothing about it.
 */
export function updatedNotice(updates: SignupUpdates | null | undefined): string | null {
  if (!updates) return null
  const parts = CONTACT_FIELDS.filter((f) => updates.contact.includes(f)).map((f) => FIELD_TEXT[f])
  if (updates.answers > 0) parts.push(updates.answers === 1 ? "1 réponse" : `${updates.answers} réponses`)
  return parts.length > 0 ? `Modifications enregistrées : ${joinFr(parts)}.` : null
}

/** The confirmation page's parameters: `updated=phone,lastName` and `updatedAnswers=2`. */
export const UPDATED_PARAM = "updated"
export const UPDATED_ANSWERS_PARAM = "updatedAnswers"

export function setUpdatedParams(params: URLSearchParams, updates: SignupUpdates | null | undefined): void {
  if (!updates) return
  const contact = CONTACT_FIELDS.filter((f) => updates.contact.includes(f))
  if (contact.length > 0) params.set(UPDATED_PARAM, contact.join(","))
  if (updates.answers > 0) params.set(UPDATED_ANSWERS_PARAM, String(updates.answers))
}

/** Read back from the confirmation's address; anything unknown is ignored. */
export function readUpdatedParams(params: URLSearchParams): SignupUpdates {
  const contact = (params.get(UPDATED_PARAM) ?? "").split(",").filter((f): f is ContactField => (CONTACT_FIELDS as string[]).includes(f))
  const n = Number(params.get(UPDATED_ANSWERS_PARAM))
  return { contact, answers: Number.isInteger(n) && n > 0 && n < 1000 ? n : 0 }
}

/** At the top of the form when the volunteer comes with their session (#1013). */
export function sessionFormNote(hasQuestions: boolean): string {
  return hasQuestions
    ? "Ton nom, ton téléphone et tes réponses sont repris de ton inscription à cet événement. Si tu les modifies ici, ils seront mis à jour pour tous tes créneaux."
    : "Ton nom et ton téléphone sont repris de ton inscription à cet événement. Si tu les modifies ici, ils seront mis à jour pour tous tes créneaux."
}

/** Under the email field in that case: another address is someone else's sign-up. */
export const SESSION_EMAIL_HINT = "C'est l'adresse de ton inscription. Avec une autre adresse, ce serait une nouvelle inscription, séparée de la tienne."
