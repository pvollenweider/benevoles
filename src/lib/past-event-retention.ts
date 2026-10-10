// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Retention of past events' personal data inside active organisations (#813). Owner decisions
 * (2026-10-08, 2026-10-09): 3 years after the end of an event, its registrations are anonymised
 * (counts and hours stay), each member's moving to one anonymous record; the organisation is told
 * once, 30 days before its first batch, then a batch runs each month. The rule only changes data
 * with `PAST_EVENT_RETENTION=enforce`; by default (observation) the nightly cleanup and the super
 * admin statistics only say what it would anonymise. Pure, Prisma-free.
 */

export type PastEventRetentionMode = "observe" | "enforce"

/** `PAST_EVENT_RETENTION=enforce` switches the rule on; anything else observes. */
export function pastEventRetentionMode(env: Record<string, string | undefined> = process.env): PastEventRetentionMode {
  return env.PAST_EVENT_RETENTION?.trim().toLowerCase() === "enforce" ? "enforce" : "observe"
}

/** Days between the notice to an organisation and its first batch. */
export const PAST_EVENT_NOTICE_DAYS = 30

export type PastEventStep =
  /** Nothing to anonymise in this organisation. */
  | { kind: "none" }
  /** Tell the organisation: its first batch runs in 30 days. */
  | { kind: "notice"; firstBatchOn: Date }
  /** Told already, waiting for the 30 days or for next month's batch. */
  | { kind: "wait"; until: Date }
  /** Anonymise every concerned event now. */
  | { kind: "batch" }

const DAY = 24 * 60 * 60 * 1000

/** The first day of the month after `d`, UTC: when the next monthly batch may run. */
function nextMonth(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1))
}

/**
 * What the nightly cleanup does for one organisation today. One notice ever, 30 days before the
 * first batch; then at most one batch per calendar month (UTC), whatever ended in between: the
 * notice says « puis chaque mois ». An organisation with nothing concerned is left alone, notice
 * or not.
 */
export function pastEventStep(
  org: { concernedEvents: number; noticeAt: Date | null; batchAt: Date | null },
  now: Date,
): PastEventStep {
  if (org.concernedEvents === 0) return { kind: "none" }
  if (!org.noticeAt) return { kind: "notice", firstBatchOn: new Date(now.getTime() + PAST_EVENT_NOTICE_DAYS * DAY) }
  const noticeOver = new Date(org.noticeAt.getTime() + PAST_EVENT_NOTICE_DAYS * DAY)
  if (now < noticeOver) return { kind: "wait", until: noticeOver }
  if (org.batchAt && now < nextMonth(org.batchAt)) return { kind: "wait", until: nextMonth(org.batchAt) }
  return { kind: "batch" }
}

/** What one batch did in an organisation, for the cleanup's answer and the event log. */
export type PastEventBatchCounts = {
  events: number
  registrations: number
  /** Anonymous records created: one per member and per batch. */
  anonymousRecords: number
  answers: number
  invites: number
  sectorLeaders: number
}

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

/** One line for the cleanup's answer and the operator: what the rule would do today, or still has to do. */
export function pastEventSummary(t: PastEventTotals, mode: PastEventRetentionMode = "observe"): string {
  if (t.events === 0) return "Aucun événement terminé depuis plus de 3 ans."
  const plural = (n: number, one: string, many: string) => `${n} ${n > 1 ? many : one}`
  return `${plural(t.events, "événement terminé", "événements terminés")} depuis plus de 3 ans dans ${plural(t.organizations, "organisation", "organisations")} : ${plural(t.registrations, "inscription", "inscriptions")} de ${plural(t.members, "membre", "membres")} ${mode === "enforce" ? "restent à anonymiser (préavis de 30 jours, puis un lot par mois)." : "seraient anonymisées (aucune modification pour l'instant)."}`
}
