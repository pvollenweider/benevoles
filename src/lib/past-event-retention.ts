// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Retention of past events' personal data inside active organisations (#813). Owner decision
 * (2026-10-08): 3 years after the end of an event, its registrations are anonymised (counts and
 * hours stay). **Observation mode**: nothing is changed yet; the nightly cleanup and the super
 * admin statistics only say what would be anonymised, per organisation. Pure, Prisma-free.
 */

/** Years after an event's end before its volunteers' personal data would be anonymised. */
export const PAST_EVENT_RETENTION_YEARS = 3

/** Events that ended before this date are concerned: the same calendar day, 3 years earlier. */
export function pastEventCutoff(now: Date): Date {
  const cutoff = new Date(now)
  cutoff.setUTCFullYear(cutoff.getUTCFullYear() - PAST_EVENT_RETENTION_YEARS)
  return cutoff
}

/** What would be anonymised in one organisation. */
export type PastEventObservation = {
  organizationId: string
  organizationName: string
  events: number
  registrations: number
  /** Distinct members with at least one registration on those events. */
  members: number
  /** Of them, members with no registration on a more recent event: their whole history is old. */
  membersOnlyOld: number
  answers: number
  invites: number
  sectorLeaders: number
}

export type PastEventTotals = Omit<PastEventObservation, "organizationId" | "organizationName"> & { organizations: number }

export function pastEventTotals(rows: readonly PastEventObservation[]): PastEventTotals {
  const sum = (key: keyof Omit<PastEventObservation, "organizationId" | "organizationName">) => rows.reduce((n, r) => n + r[key], 0)
  return {
    organizations: rows.filter((r) => r.events > 0).length,
    events: sum("events"),
    registrations: sum("registrations"),
    members: sum("members"),
    membersOnlyOld: sum("membersOnlyOld"),
    answers: sum("answers"),
    invites: sum("invites"),
    sectorLeaders: sum("sectorLeaders"),
  }
}

/** One line for the cleanup's answer and the operator: what the rule would do today. */
export function pastEventSummary(t: PastEventTotals): string {
  if (t.events === 0) return "Aucun événement terminé depuis plus de 3 ans."
  const plural = (n: number, one: string, many: string) => `${n} ${n > 1 ? many : one}`
  return `${plural(t.events, "événement terminé", "événements terminés")} depuis plus de 3 ans dans ${plural(t.organizations, "organisation", "organisations")} : ${plural(t.registrations, "inscription", "inscriptions")} de ${plural(t.members, "membre", "membres")} seraient anonymisées (aucune modification pour l'instant).`
}
