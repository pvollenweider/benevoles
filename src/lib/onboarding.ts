// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * First-run checklist of an organization (#369): every step already exists somewhere in the
 * admin, this only says in which order to go through them. Progress is derived from the data,
 * never stored; only dismissing the list is (Organization.onboardingDismissedAt).
 *
 * The test sign-up comes after publishing: a draft event isn't reachable from the public side
 * yet (see #370 for a preview), and the test registration can be cancelled afterwards.
 */

export type OnboardingFacts = {
  publicTitle: string | null
  charterCustomized: boolean
  timeZone: string | null
  /** Oldest event, to link its shift and publication pages. */
  firstEventId: string | null
  activeShiftCount: number
  /** Public URL of a published event, for the test sign-up. */
  publishedEventUrl: string | null
  registrationCount: number
}

export type OnboardingStep = {
  id: "organization" | "timeZone" | "event" | "shifts" | "publish" | "testSignup"
  label: string
  hint: string
  href: string
  /** Opens outside the admin (the public page). */
  external?: boolean
  done: boolean
  optional?: boolean
}

export function onboardingSteps(f: OnboardingFacts): OnboardingStep[] {
  const eventPage = f.firstEventId ? `/admin/events/${f.firstEventId}` : "/admin/events/new"
  return [
    {
      id: "organization",
      label: "Personnaliser la page publique et la charte",
      hint: "Titre affiché aux bénévoles et texte de la charte qu'ils acceptent en s'inscrivant. Des valeurs par défaut existent.",
      href: "/admin/settings/admins",
      done: f.publicTitle !== null || f.charterCustomized,
      optional: true,
    },
    {
      id: "timeZone",
      label: "Vérifier le fuseau horaire",
      hint: "Europe/Zurich par défaut. À changer seulement si vos événements ont lieu ailleurs.",
      href: "/admin/settings/admins",
      done: f.timeZone !== null,
      optional: true,
    },
    {
      id: "event",
      label: "Créer votre premier événement",
      hint: "Titre, dates, lieu et message de confirmation. Il reste en brouillon, invisible du public.",
      href: "/admin/events/new",
      done: f.firstEventId !== null,
    },
    {
      id: "shifts",
      label: "Définir les postes et les créneaux",
      hint: "Chaque créneau a un poste, un horaire et un nombre de places.",
      href: f.firstEventId ? `/admin/events/${f.firstEventId}/shifts` : "/admin/events/new",
      done: f.activeShiftCount > 0,
    },
    {
      id: "publish",
      label: "Publier l'événement",
      hint: "Depuis la page de l'événement, bouton « Publier » : les bénévoles peuvent alors s'inscrire.",
      href: eventPage,
      done: f.publishedEventUrl !== null,
    },
    {
      id: "testSignup",
      label: "Faire une inscription de test",
      hint: "Inscrivez-vous comme un bénévole pour vérifier le parcours et l'email reçu. Vous pourrez l'annuler ensuite.",
      href: f.publishedEventUrl ?? eventPage,
      external: f.publishedEventUrl !== null,
      done: f.registrationCount > 0,
    },
  ]
}

/** Required steps drive completion; optional ones are shown but never block it. */
export function onboardingProgress(steps: OnboardingStep[]) {
  const required = steps.filter((s) => !s.optional)
  const done = required.filter((s) => s.done).length
  return {
    done,
    total: required.length,
    complete: done === required.length,
    next: steps.find((s) => !s.done && !s.optional) ?? null,
  }
}

/** Shown until the required steps are done, unless an admin hid it. */
export function showOnboarding(steps: OnboardingStep[], dismissedAt: Date | null): boolean {
  return dismissedAt === null && !onboardingProgress(steps).complete
}
