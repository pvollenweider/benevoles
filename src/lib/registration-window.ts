// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Registration window of an event (#463), independent from its publication: a published event can
 * be visible while registrations are not open yet, or after they closed. The API, the public page
 * and the waitlist all ask this one function. Pure: `now` is passed in.
 */

export type RegistrationWindow = {
  publicStatus: string
  /** Open unless explicitly false (the column defaults to true). */
  registrationsOpen?: boolean
  registrationOpensAt?: Date | string | null
  registrationClosesAt?: Date | string | null
}

export type RegistrationState =
  | { open: true; closesAt: Date | null }
  | { open: false; reason: "not_published" | "closed" | "not_yet" | "ended"; opensAt: Date | null; closesAt: Date | null }

import { fmtHour } from "./registrations-list"

const toDate = (d: Date | string | null | undefined) => (d == null ? null : d instanceof Date ? d : new Date(d))

export function registrationState(e: RegistrationWindow, now: Date = new Date()): RegistrationState {
  const opensAt = toDate(e.registrationOpensAt)
  const closesAt = toDate(e.registrationClosesAt)
  if (e.publicStatus !== "published") return { open: false, reason: "not_published", opensAt, closesAt }
  if (e.registrationsOpen === false) return { open: false, reason: "closed", opensAt, closesAt }
  if (opensAt && now < opensAt) return { open: false, reason: "not_yet", opensAt, closesAt }
  if (closesAt && now >= closesAt) return { open: false, reason: "ended", opensAt, closesAt }
  return { open: true, closesAt }
}

export function acceptsRegistrations(e: RegistrationWindow, now: Date = new Date()): boolean {
  return registrationState(e, now).open
}

/** « samedi 1 juin à 18h » (« à 23h59 ») in the organisation's time zone, hours written as elsewhere in the app. */
export function formatMoment(d: Date, timeZone: string): string {
  const day = d.toLocaleDateString("fr-FR", { timeZone, weekday: "long", day: "numeric", month: "long" })
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(d)
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "00"
  return `${day} à ${fmtHour(`${get("hour")}:${get("minute")}`)}`
}

/** What the public page says instead of the sign-up form; null when registrations are open. */
export function closedMessage(state: RegistrationState, timeZone: string): string | null {
  if (state.open) return null
  switch (state.reason) {
    case "not_yet":
      return `Les inscriptions ouvrent le ${formatMoment(state.opensAt!, timeZone)}. Le planning est déjà consultable.`
    case "ended":
      return "Les inscriptions sont terminées. Si tu as déjà des créneaux, ton lien personnel reste valable."
    case "closed":
      return "Les inscriptions sont fermées pour le moment. Si tu as déjà des créneaux, ton lien personnel reste valable."
    default:
      return "Cet événement n'accepte pas d'inscription."
  }
}

/** The refusal the API sends when a sign-up arrives while registrations are not open. */
export function refusalMessage(state: RegistrationState, timeZone: string): string {
  return closedMessage(state, timeZone) ?? "Les inscriptions sont fermées."
}

/** « jusqu'au samedi 30 juin à 23h59 », shown while open with a closing time. */
export function openUntilMessage(state: RegistrationState, timeZone: string): string | null {
  return state.open && state.closesAt ? `Inscriptions ouvertes jusqu'au ${formatMoment(state.closesAt, timeZone)}.` : null
}

/** A schedule is in order when it closes after it opens (either may be absent). */
export function isValidWindow(opensAt?: Date | string | null, closesAt?: Date | string | null): boolean {
  const o = toDate(opensAt), c = toDate(closesAt)
  return !(o && c) || c.getTime() > o.getTime()
}

/** Same rule on two datetime-local values, as typed in the form (same zone, so they compare as text). */
export function localWindowOrderInvalid(opens?: string | null, closes?: string | null): boolean {
  return !!opens && !!closes && closes <= opens
}

export const WINDOW_ORDER_ERROR = "La fermeture des inscriptions doit venir après leur ouverture."

/** « 2026-06-01T18:00 » (a datetime-local value) in `timeZone` to the real instant; null when empty or malformed. */
export function localInputToUtc(value: string | null | undefined, timeZone: string, toUtc: (day: Date, hhmm: string, tz: string) => Date): Date | null {
  const m = (value ?? "").trim().match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})$/)
  if (!m) return null
  return toUtc(new Date(`${m[1]}T00:00:00Z`), m[2], timeZone)
}

/** The instant back to a datetime-local value in `timeZone`. */
export function utcToLocalInput(d: Date | string | null | undefined, timeZone: string): string {
  const date = toDate(d)
  if (!date) return ""
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(date).map((p) => [p.type, p.value]))
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`
}
