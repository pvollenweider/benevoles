// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Three-step event creation (#401): information, roles and shifts, review and publication. The
 * steps are the existing pages with a step indicator and a « Continuer » link, so leaving the
 * assistant at any point just means using the full interface. Pure helpers, used by the pages.
 */

export const WIZARD_STEPS = [
  { n: 1, label: "Informations" },
  { n: 2, label: "Postes et créneaux" },
  { n: 3, label: "Vérification et publication" },
] as const

export type WizardStep = (typeof WIZARD_STEPS)[number]["n"]

/** Where each step lives; step 1 has no event yet. */
export function wizardHrefs(eventId: string | null) {
  return {
    1: eventId ? `/admin/events/${eventId}/edit` : "/admin/events/new",
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
}

export type ReviewCheck = { id: string; label: string; ok: boolean; required: boolean; href: string; hint?: string }

/** What to look at before publishing, required first. */
export function reviewChecks(f: ReviewFacts): ReviewCheck[] {
  const base = `/admin/events/${f.id}`
  const days = Math.round((Date.parse(f.endDate) - Date.parse(f.startDate)) / 86_400_000) + 1
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
  ]
}

export function canPublish(checks: ReviewCheck[]): boolean {
  return checks.filter((c) => c.required).every((c) => c.ok)
}
