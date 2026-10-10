// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Periodic check that someone still wants to keep an organisation's space (#811). Not an
 * automatic deletion: after 18 months without meaningful activity and with no upcoming event, the
 * administrators are asked whether to keep the space, reminded twice, and only then is it
 * deactivated, and later erased. A suspended organisation (abuse, #810) never goes through here.
 *
 * Rollout: `ORG_INACTIVITY=report` (the default) computes and lists everything, and sends,
 * deactivates and deletes nothing. `on` sends the three emails and deactivates a space nobody
 * answered for; erasure is not enabled yet. Pure, Prisma-free.
 */

export type InactivityMode = "off" | "report" | "on"

export function inactivityMode(env: Record<string, string | undefined> = process.env): InactivityMode {
  const v = env.ORG_INACTIVITY?.trim().toLowerCase()
  return v === "off" ? "off" : v === "on" ? "on" : "report"
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
  /** The operator postponed the procedure: nothing happens before this date. */
  postponedUntil: Date | null
  /** The operator excluded the organisation for good: « Ne jamais désactiver automatiquement ». */
  exempt: boolean
}

export type InactivityAssessment =
  | { state: "excluded"; reason: "suspended" | "deactivated" | "exempt" | "upcoming-event" }
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
  if (f.exempt) return { state: "excluded", reason: "exempt" }
  if (f.hasUpcomingEvent) return { state: "excluded", reason: "upcoming-event" }
  const scheduled = addMonths(inactivitySince(f, fallback), INACTIVITY_MONTHS)
  const firstEmailAt = f.postponedUntil && f.postponedUntil.getTime() > scheduled.getTime() ? f.postponedUntil : scheduled
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

/** What the operator can postpone the procedure by, in months (« Reporter »). */
export const POSTPONE_MONTHS = [3, 6, 12] as const
export type PostponeMonths = (typeof POSTPONE_MONTHS)[number]

export function isPostponeMonths(value: unknown): value is PostponeMonths {
  return (POSTPONE_MONTHS as readonly unknown[]).includes(value)
}

/**
 * The date a postponement of `months` from `now` holds the procedure until. Counted from today,
 * not from the scheduled date: « reporter de 6 mois » means six months of quiet from now on.
 */
export function postponedUntil(now: Date, months: PostponeMonths): Date {
  return addMonths(now, months)
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

/**
 * One organisation's place in the check, in words, for its page in the super admin space.
 * `day` formats a date (the page's time zone); `now` tells a running postponement from an old one.
 */
export function inactivityStatusText(
  info: {
    lastActivityAt: Date | null
    postponedUntil: Date | null
    assessment: InactivityAssessment
    /** The procedure under way (`on`), and a deactivation it made. */
    noticeAt?: Date | null
    emailsSent?: number
    deactivatedAt?: Date | null
  },
  mode: InactivityMode,
  now: Date,
  day: (d: Date) => string,
): string {
  const last = `Dernière activité : ${info.lastActivityAt ? `le ${day(info.lastActivityAt)}` : "jamais mesurée"}.`
  if (mode === "off") return `${last} La vérification est désactivée (ORG_INACTIVITY=off).`
  const a = info.assessment
  if (info.deactivatedAt) return `${last} Désactivée faute de réponse le ${day(info.deactivatedAt)} ; ses administrateurs peuvent la réactiver depuis la page de connexion.`
  if (info.noticeAt && a.state === "due") {
    const n = info.emailsSent ?? 1
    return `${last} Premier email « Souhaitez-vous conserver votre espace ? » envoyé le ${day(info.noticeAt)} (${n} email${n > 1 ? "s" : ""} sur 3) ; sans réponse, désactivation le ${day(deactivationDate(info.noticeAt))}.`
  }
  if (a.state === "excluded") {
    const why = {
      suspended: "Organisation suspendue : la vérification ne la concerne pas.",
      deactivated: "Organisation désactivée : la vérification ne la concerne pas.",
      exempt: "Elle ne sera jamais désactivée automatiquement.",
      "upcoming-event": "Un événement est à venir ou en cours : rien ne se passe avant qu'il soit terminé.",
    }[a.reason]
    return `${last} ${why}`
  }
  const postponed = info.postponedUntil && info.postponedUntil.getTime() > now.getTime() ? info.postponedUntil : null
  const hold = postponed ? ` Reporté jusqu'au ${day(postponed)}.` : ""
  if (a.state === "active") return `${last}${hold} Premier email « Souhaitez-vous conserver votre espace ? » prévu le ${day(a.firstEmailAt)}.`
  const observe = mode === "report" ? " Mode observation : rien n'est envoyé." : ""
  return `${last}${hold} Premier email dû le ${day(a.firstEmailAt)} ; étape atteinte : ${a.stepLabel.charAt(0).toLowerCase()}${a.stepLabel.slice(1)}.${observe}`
}

/** Days after the first email actually sent: second reminder, last reminder, deactivation. */
export const SECOND_REMINDER_DAYS = 30
export const LAST_REMINDER_DAYS = 60
export const DEACTIVATION_DAYS = 75

/** The day a procedure started on `noticeAt` deactivates the space without an answer. */
export function deactivationDate(noticeAt: Date): Date {
  return new Date(noticeAt.getTime() + DEACTIVATION_DAYS * DAY_MS)
}

export type InactivityEmailStep = "first" | "second" | "last"

export type ProcedureAction =
  | { action: "none" }
  /** The procedure stops: activity, confirmation, upcoming event, postponement or exclusion. */
  | { action: "reset" }
  | { action: "email"; step: InactivityEmailStep }
  | { action: "deactivate" }

/**
 * What the nightly run does for one active organisation with `ORG_INACTIVITY=on`. The procedure
 * counts from the first email actually sent (`noticeAt`), never from the theoretical schedule:
 * switching `on` for a space idle for years still starts with the first email, and gives it the
 * full 75 days. Each email goes once (`emailsSent`); a missed night only delays a step.
 */
export function procedureAction(
  p: { assessment: InactivityAssessment; noticeAt: Date | null; emailsSent: number },
  now: Date,
): ProcedureAction {
  const due = p.assessment.state === "due"
  if (p.noticeAt === null) return due ? { action: "email", step: "first" } : { action: "none" }
  // Anything that makes the space not due any more (a later activity or confirmation moves the
  // schedule past today) stops the procedure.
  if (!due) return { action: "reset" }
  const days = Math.floor((now.getTime() - p.noticeAt.getTime()) / DAY_MS)
  if (days >= DEACTIVATION_DAYS) return { action: "deactivate" }
  if (days >= LAST_REMINDER_DAYS && p.emailsSent < 3) return { action: "email", step: "last" }
  if (days >= SECOND_REMINDER_DAYS && p.emailsSent < 2) return { action: "email", step: "second" }
  return { action: "none" }
}
