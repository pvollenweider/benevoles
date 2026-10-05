// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Three-step event creation (#401): information, roles and shifts, review and publication. The
 * steps are the existing pages with a step indicator and a « Continuer » link, so leaving the
 * assistant at any point just means using the full interface. Pure helpers, used by the pages.
 */

import { coordinatesOf } from "./map-link"
import { EMAIL_SETTINGS_HREF, remindersState, type RemindersFacts } from "./automatic-reminders"
import { REMINDER_LABELS } from "./notification-settings"
import { formatMoment, registrationState } from "./registration-window"
import type { StaffingSummary } from "./staffing"
import { localDateTimeToUtc } from "./time-zone"

export const WIZARD_STEPS = [
  { n: 1, label: "Informations" },
  { n: 2, label: "Postes et créneaux" },
  { n: 3, label: "Vérification et publication" },
] as const

export type WizardStep = (typeof WIZARD_STEPS)[number]["n"]

/** Where each step lives; step 1 has no event yet. */
export function wizardHrefs(eventId: string | null) {
  return {
    1: eventId ? `/admin/events/${eventId}/edit?wizard=1` : "/admin/events/new",
    2: eventId ? `/admin/events/${eventId}/shifts?wizard=1` : "/admin/events/new",
    3: eventId ? `/admin/events/${eventId}/review` : "/admin/events/new",
    exit: eventId ? `/admin/events/${eventId}` : "/admin/events",
  }
}

export type ReviewFacts = {
  id: string
  title: string
  startDate: string
  endDate: string
  location: string | null
  confirmationMessage: string | null
  publicInstructions: string | null
  publicStatus: string
  shiftCount: number
  roleCount: number
  capacity: number
  leaderCount: number
  /** Practical info of the shifts (#397), from `practicalInfoGaps`. Absent: no item. */
  practicalInfo?: PracticalInfoGaps
  /** Registration window (#463), read at `now` in the organization's time zone. Absent: no item. */
  registration?: { registrationsOpen: boolean; opensAt: Date | null; closesAt: Date | null; timeZone: string; now: Date }
  /** Automatic reminders (#381); only worth an item when a shift is still to come. Absent: no item. */
  reminders?: RemindersFacts
  /** Coverage of the shifts (#394), shown once the event is published. Absent: no item. */
  coverage?: Pick<StaffingSummary, "totals" | "underfilled">
}

/**
 * One line of the review. `href` is where it is fixed (no link when nothing in the interface
 * changes it); `action` names the link when « Modifier / Compléter / Ajouter » would not fit;
 * `warn` marks a non-blocking point worth checking (« À vérifier »), as opposed to an optional
 * field left empty (« Facultatif »).
 */
export type ReviewCheck = { id: string; label: string; ok: boolean; required: boolean; warn?: boolean; href?: string; action?: string; hint?: string }

export type PracticalInfoGaps = {
  shifts: number
  /** Shifts with neither a meeting point of their own nor an event place to fall back on. */
  noPlace: number
  /** Shifts without a contact person (name or phone) while the event has no day-of contact (#560) to fall back on. */
  noContact: number
  /** Shifts missing both. */
  noPlaceNorContact: number
  /** Shifts missing at least one. */
  incomplete: number
}

type PracticalShift = { locationDetails?: string | null; contactName?: string | null; contactPhone?: string | null; latitude?: number | null; longitude?: number | null }
type PracticalEvent = { location?: string | null; latitude?: number | null; longitude?: number | null; dayContactName?: string | null; dayContactPhone?: string | null }

const filled = (v: string | null | undefined) => !!v?.trim()

/**
 * Which shifts lack what volunteers need on the day (#397, #565). The event's place (text or
 * coordinates) counts as every shift's place, its day-of contact (#560) as every shift's contact.
 */
export function practicalInfoGaps(shifts: PracticalShift[], event: PracticalEvent): PracticalInfoGaps {
  const eventPlace = filled(event.location) || !!coordinatesOf(event)
  const eventContact = filled(event.dayContactName) || filled(event.dayContactPhone)
  const gaps = { shifts: shifts.length, noPlace: 0, noContact: 0, noPlaceNorContact: 0, incomplete: 0 }
  for (const s of shifts) {
    const place = eventPlace || filled(s.locationDetails) || !!coordinatesOf(s)
    const contact = eventContact || filled(s.contactName) || filled(s.contactPhone)
    if (!place) gaps.noPlace++
    if (!contact) gaps.noContact++
    if (!place && !contact) gaps.noPlaceNorContact++
    if (!place || !contact) gaps.incomplete++
  }
  return gaps
}

/** Whether any shift starts after `now` (local date and start time in the organization's zone). */
export function hasUpcomingShift(shifts: { date: string; startTime: string }[], now: Date, timeZone: string): boolean {
  return shifts.some((s) => localDateTimeToUtc(new Date(`${s.date}T00:00:00Z`), s.startTime, timeZone).getTime() > now.getTime())
}

const shiftsWord = (n: number) => `${n} créneau${n > 1 ? "x" : ""}`

function practicalInfoCheck(g: PracticalInfoGaps, base: string): ReviewCheck {
  const href = `${base}/shifts`
  if (g.incomplete === 0) return { id: "practical-info", label: "Lieu et contact indiqués pour chaque créneau", ok: true, required: false, href }
  const missing =
    g.noPlaceNorContact === g.incomplete ? "sans lieu ni contact"
    : g.noPlace === 0 ? "sans contact"
    : g.noContact === 0 ? "sans lieu de rendez-vous"
    : "sans lieu ou sans contact"
  return {
    id: "practical-info", label: `${shiftsWord(g.incomplete)} ${missing}`, ok: false, required: false, warn: true, href,
    hint: g.noContact > 0
      ? "Le lieu et la personne à contacter figurent dans l'email de confirmation, les rappels et la page personnelle des bénévoles. Un contact le jour J, dans les réglages de l'événement, vaut pour tous les créneaux sans contact."
      : "Le lieu et la personne à contacter figurent dans l'email de confirmation, les rappels et la page personnelle des bénévoles.",
  }
}

function registrationCheck(r: NonNullable<ReviewFacts["registration"]>, published: boolean, base: string): ReviewCheck {
  // A draft is read as if it were published: what volunteers will meet once it is.
  const state = registrationState({ publicStatus: "published", registrationsOpen: r.registrationsOpen, registrationOpensAt: r.opensAt, registrationClosesAt: r.closesAt }, r.now)
  const common = { id: "registration", required: false, href: `${base}/edit#event-registrations-open`, action: "Modifier" }
  if (state.open) {
    const until = state.closesAt ? ` jusqu'au ${formatMoment(state.closesAt, r.timeZone)}` : ""
    return { ...common, label: `${published ? "Inscriptions ouvertes" : "Inscriptions ouvertes dès la publication"}${until}`, ok: true }
  }
  switch (state.reason) {
    case "not_yet":
      return { ...common, label: `Ouverture des inscriptions le ${formatMoment(state.opensAt!, r.timeZone)}`, ok: true }
    case "ended":
      return {
        ...common, label: `Inscriptions fermées depuis le ${formatMoment(state.closesAt!, r.timeZone)}`, ok: false, warn: true,
        hint: "La fermeture programmée est passée : plus personne ne peut s'inscrire.",
      }
    default:
      return {
        ...common, label: "Inscriptions fermées, sans date d'ouverture", ok: false, warn: true,
        hint: state.opensAt && state.opensAt.getTime() > r.now.getTime()
          ? `L'ouverture programmée du ${formatMoment(state.opensAt, r.timeZone)} ne prend effet que si la case « Inscriptions ouvertes » est cochée.`
          : published
            ? "Les bénévoles voient le planning mais ne peuvent pas s'inscrire."
            : "Une fois l'événement publié, les bénévoles verront le planning sans pouvoir s'inscrire.",
      }
  }
}

function remindersCheck(r: NonNullable<ReviewFacts["reminders"]>, base: string): ReviewCheck {
  const settings = { href: EMAIL_SETTINGS_HREF, action: "Réglages des emails" }
  const state = remindersState(r)
  switch (state.kind) {
    case "no-upcoming-shift": // never reached: the item is only listed while a shift is to come
    case "event-off":
      return {
        id: "reminders", label: "Rappels automatiques coupés pour cet événement", ok: false, required: false, warn: true,
        href: `${base}/edit#event-reminders`, action: "Modifier",
        hint: "Aucun rappel J-2, J-1 ni du jour ne part pour cet événement, quels que soient les réglages de l'organisation.",
      }
    case "on":
      return { id: "reminders", label: "Rappels automatiques J-2, J-1 et du jour activés", ok: true, required: false, ...settings }
    case "org-off":
      return {
        id: "reminders", label: "Aucun rappel automatique : désactivés pour l'organisation", ok: false, required: false, warn: true, ...settings,
        hint: "Les bénévoles ne reçoivent aucun rappel avant leurs créneaux.",
      }
    case "partly-off":
      return {
        id: "reminders", label: "Rappels automatiques en partie désactivés pour l'organisation", ok: false, required: false, warn: true, ...settings,
        hint: `Seuls partent : ${state.on.map((k) => REMINDER_LABELS[k].label).join(", ")}.`,
      }
  }
}

function coverageCheck(c: NonNullable<ReviewFacts["coverage"]>, base: string): ReviewCheck {
  const { active, capacity } = c.totals
  const incomplete = c.underfilled.length
  const places = `${active} place${active > 1 ? "s" : ""} occupée${active > 1 ? "s" : ""} sur ${capacity}`
  return {
    id: "coverage", ok: incomplete === 0, required: false, warn: incomplete > 0, href: `${base}/staffing`, action: "Voir les créneaux incomplets",
    label: incomplete === 0 ? `${places}, aucun créneau incomplet` : `${places}, ${shiftsWord(incomplete)} incomplet${incomplete > 1 ? "s" : ""}`,
  }
}

/** What to look at before publishing, required first. */
export function reviewChecks(f: ReviewFacts): ReviewCheck[] {
  const base = `/admin/events/${f.id}`
  const days = Math.round((Date.parse(f.endDate) - Date.parse(f.startDate)) / 86_400_000) + 1
  const published = f.publicStatus === "published"
  const archived = f.publicStatus === "archived"
  return [
    {
      id: "dates", label: `Dates : ${days > 1 ? `${days} jours` : "1 jour"} à partir du ${new Date(`${f.startDate}T00:00:00Z`).toLocaleDateString("fr-FR", { timeZone: "UTC", day: "numeric", month: "long", year: "numeric" })}`,
      ok: Date.parse(f.endDate) >= Date.parse(f.startDate), required: true, href: `${base}/edit`,
    },
    {
      id: "shifts",
      label: f.shiftCount > 0 ? `${f.shiftCount} créneau${f.shiftCount > 1 ? "x" : ""}, ${f.roleCount} poste${f.roleCount > 1 ? "s" : ""}, ${f.capacity} place${f.capacity > 1 ? "s" : ""}` : "Aucun créneau",
      ok: f.shiftCount > 0, required: true, href: `${base}/shifts?wizard=1`,
      hint: f.shiftCount > 0 ? undefined : "Les bénévoles n'auraient rien à choisir.",
    },
    {
      id: "location", label: f.location?.trim() ? `Lieu : ${f.location.trim()}` : "Pas de lieu indiqué",
      ok: !!f.location?.trim(), required: false, href: `${base}/edit`, hint: "Affiché sur la page publique et dans les invitations.",
    },
    {
      id: "confirmation", label: f.confirmationMessage?.trim() ? "Message de confirmation renseigné" : "Pas de message de confirmation",
      ok: !!f.confirmationMessage?.trim(), required: false, href: `${base}/edit`, hint: "Affiché après l'inscription et dans l'email de confirmation.",
    },
    {
      id: "instructions", label: f.publicInstructions?.trim() ? "Instructions publiques renseignées" : "Pas d'instructions publiques",
      ok: !!f.publicInstructions?.trim(), required: false, href: `${base}/edit`, hint: "Texte en haut de la page d'inscription.",
    },
    {
      id: "leaders", label: f.leaderCount > 0 ? `${f.leaderCount} responsable${f.leaderCount > 1 ? "s" : ""} de secteur` : "Pas de responsable de secteur",
      ok: f.leaderCount > 0, required: false, href: `${base}/sector-leaders`, hint: "Une personne par poste qui reçoit les inscriptions de son équipe.",
    },
    // Non-blocking items (#565), each only when what it checks applies to the event.
    ...(f.practicalInfo && f.practicalInfo.shifts > 0 ? [practicalInfoCheck(f.practicalInfo, base)] : []),
    ...(f.registration && !archived ? [registrationCheck(f.registration, published, base)] : []),
    ...(f.reminders && f.reminders.upcomingShifts && !archived ? [remindersCheck(f.reminders, base)] : []),
    ...(f.coverage && published && f.coverage.totals.shifts > 0 ? [coverageCheck(f.coverage, base)] : []),
  ]
}

export function canPublish(checks: ReviewCheck[]): boolean {
  return checks.filter((c) => c.required).every((c) => c.ok)
}
