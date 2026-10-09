// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Periodic check that someone still wants to keep an organisation's space (#811). Not an
 * automatic deletion: after 18 months without meaningful activity and with no upcoming event, the
 * administrators are asked whether to keep the space, reminded twice, and only then is it
 * deactivated, and later erased. A suspended organisation (abuse, #810) never goes through here.
 *
 * Rollout: `ORG_INACTIVITY=report` first. It computes and lists everything, and sends,
 * deactivates and deletes nothing. `on` is not implemented yet and behaves as `report`. Pure,
 * Prisma-free.
 */

export type InactivityMode = "off" | "report"

export function inactivityMode(env: Record<string, string | undefined> = process.env): InactivityMode {
  return env.ORG_INACTIVITY?.trim().toLowerCase() === "off" ? "off" : "report"
}

/** Months without meaningful activity before the first « Souhaitez-vous conserver votre espace ? ». */
export const INACTIVITY_MONTHS = 18

/** Days after the first email: second reminder, last reminder, deactivation, erasure. */
export const INACTIVITY_STEPS = [
  { key: "first", label: "1er email « Souhaitez-vous conserver votre espace ? »", days: 0 },
  { key: "second", label: "2e rappel", days: 30 },
  { key: "last", label: "Dernier rappel", days: 60 },
  { key: "deactivate", label: "Désactivation", days: 75 },
  { key: "erase", label: "Effacement définitif", days: 165 },
] as const

export type InactivityStepKey = (typeof INACTIVITY_STEPS)[number]["key"]

export type InactivityFacts = {
  /** Latest meaningful activity (null: never measured; the migration sets it). */
  lastActivityAt: Date | null
  /** Latest « Conserver mon organisation » (not used yet: no email is sent in report mode). */
  lastRetentionConfirmedAt: Date | null
  /** An event that ends today or later: the procedure never starts or stops at once. */
  hasUpcomingEvent: boolean
  /** Ever published an event or received a registration (« utilisée ») or not (« jamais utilisée »). */
  everUsed: boolean
  suspended: boolean
  active: boolean
}

export type InactivityAssessment =
  | { state: "excluded"; reason: "suspended" | "deactivated" | "upcoming-event" }
  | { state: "active"; firstEmailAt: Date }
  | { state: "due"; step: InactivityStepKey; stepLabel: string; firstEmailAt: Date; nextStep: { key: InactivityStepKey; label: string; at: Date } | null }

const DAY_MS = 24 * 60 * 60 * 1000

function addMonths(date: Date, months: number): Date {
  const d = new Date(date)
  d.setUTCMonth(d.getUTCMonth() + months)
  return d
}

/** The reference date: the later of the last activity and the last confirmation. */
export function inactivitySince(f: Pick<InactivityFacts, "lastActivityAt" | "lastRetentionConfirmedAt">, fallback: Date): Date {
  const dates = [f.lastActivityAt, f.lastRetentionConfirmedAt].filter((d): d is Date => d !== null)
  return dates.length > 0 ? new Date(Math.max(...dates.map((d) => d.getTime()))) : fallback
}

/** Where an organisation stands in the schedule today (what `on` would do; `report` only lists it). */
export function assessInactivity(f: InactivityFacts, now: Date, fallback: Date = now): InactivityAssessment {
  if (f.suspended) return { state: "excluded", reason: "suspended" }
  if (!f.active) return { state: "excluded", reason: "deactivated" }
  if (f.hasUpcomingEvent) return { state: "excluded", reason: "upcoming-event" }
  const firstEmailAt = addMonths(inactivitySince(f, fallback), INACTIVITY_MONTHS)
  if (now.getTime() < firstEmailAt.getTime()) return { state: "active", firstEmailAt }
  const elapsedDays = Math.floor((now.getTime() - firstEmailAt.getTime()) / DAY_MS)
  let index = 0
  for (let i = 0; i < INACTIVITY_STEPS.length; i++) if (elapsedDays >= INACTIVITY_STEPS[i].days) index = i
  const step = INACTIVITY_STEPS[index]
  const next = INACTIVITY_STEPS[index + 1]
  return {
    state: "due",
    step: step.key,
    stepLabel: step.label,
    firstEmailAt,
    nextStep: next ? { key: next.key, label: next.label, at: new Date(firstEmailAt.getTime() + next.days * DAY_MS) } : null,
  }
}

/** A write that counts as meaningful activity: throttle the update of the organisation's date. */
export const ACTIVITY_THROTTLE_MS = 60 * 60 * 1000

/** The org-scoped models whose writes are meaningful activity (logs and bookkeeping are not). */
export const MEANINGFUL_MODELS: readonly string[] = [
  "event", "shift", "volunteer", "registration", "memberInvite", "eventPage", "sectorLeader",
  "eventMilestone", "eventQuestion", "targetedMessage", "messageTemplate", "organizationLogo",
]

export const WRITE_OPERATIONS: readonly string[] = ["create", "createMany", "createManyAndReturn", "update", "updateMany", "updateManyAndReturn", "upsert", "delete", "deleteMany"]

export function isMeaningfulWrite(model: string, operation: string): boolean {
  return MEANINGFUL_MODELS.includes(model) && WRITE_OPERATIONS.includes(operation)
}
