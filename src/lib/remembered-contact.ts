// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Contact details remembered on the volunteer's own device (#901), so a second event's form does
 * not ask for them again. Browser storage only: nothing is sent to the server, and only the four
 * contact fields are kept (never birth date, answers or comment).
 */
export const REMEMBERED_CONTACT_KEY = "benevoles_contact"

export type RememberedContact = { firstName: string; lastName: string; email: string; phone: string }

const MAX = { firstName: 100, lastName: 100, email: 200, phone: 40 } as const

function field(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : ""
}

/** What to store after a successful signup, or null when the names or the email are missing. */
export function contactToRemember(form: { firstName: string; lastName: string; email: string; phone: string }): RememberedContact | null {
  const contact = {
    firstName: field(form.firstName, MAX.firstName),
    lastName: field(form.lastName, MAX.lastName),
    email: field(form.email, MAX.email),
    phone: field(form.phone, MAX.phone),
  }
  return contact.firstName && contact.lastName && contact.email ? contact : null
}

/** Reads a stored value back; anything malformed or incomplete counts as nothing remembered. */
export function parseRememberedContact(raw: string | null): RememberedContact | null {
  if (!raw) return null
  try {
    const value: unknown = JSON.parse(raw)
    if (!value || typeof value !== "object") return null
    const v = value as Record<string, unknown>
    return contactToRemember({
      firstName: field(v.firstName, MAX.firstName),
      lastName: field(v.lastName, MAX.lastName),
      email: field(v.email, MAX.email),
      phone: field(v.phone, MAX.phone),
    })
  } catch {
    return null
  }
}

// localStorage may be missing or throw (private mode, blocked site data): remembering is a convenience.
export function loadRememberedContact(): RememberedContact | null {
  try {
    return parseRememberedContact(localStorage.getItem(REMEMBERED_CONTACT_KEY))
  } catch {
    return null
  }
}

export function saveRememberedContact(form: { firstName: string; lastName: string; email: string; phone: string }): void {
  const contact = contactToRemember(form)
  if (!contact) return
  try {
    localStorage.setItem(REMEMBERED_CONTACT_KEY, JSON.stringify(contact))
  } catch {}
}

export function forgetRememberedContact(): void {
  try {
    localStorage.removeItem(REMEMBERED_CONTACT_KEY)
  } catch {}
}
