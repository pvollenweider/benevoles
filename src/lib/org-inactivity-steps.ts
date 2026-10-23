// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { localDateTimeToUtc } from "./time-zone"

/**
 * The three messages of the inactivity procedure (#811, #1114), as a state machine. Each step
 * (first, second, last) is queued once, then confirmed when at least one administrator's copy is
 * accepted by the mail relay (outbox status `sent`, recorded on the step in the same transaction:
 * sent outbox rows are purged every night). A step starts only once the previous one is
 * confirmed; the deactivation needs the three confirmed, at least 15 periods of 24 h after the
 * last one, and never before the first email + 75 days. A step that is not confirmed in time
 * blocks the procedure: nothing automatic any more, the operator handles it.
 *
 * Instants are UTC; the planned date is the start of a day in the organisation's time zone, so
 * the keep link stays valid through the last day announced (the day before). Pure, Prisma-free.
 */

export type StepKey = "first" | "second" | "last"
export const STEP_ORDER: readonly StepKey[] = ["first", "second", "last"]

export const STEP_LABELS: Record<StepKey, string> = {
  first: "1er message « Souhaitez-vous conserver votre espace ? »",
  second: "2e rappel",
  last: "Dernier rappel",
}

/** Calendar days (UTC) between a message's confirmation and the next one: from the 30th day after it. */
export const REMINDER_GAP_DAYS = 30
/** Full periods of 24 h between the last reminder's confirmation and the deactivation. */
export const FINAL_NOTICE_DAYS = 15
/** Never deactivated before the first email's acceptance + this many periods of 24 h (also the floor of an old procedure). */
export const MIN_DEACTIVATION_DAYS = 75
/** A step still unconfirmed this many periods of 24 h after being queued blocks the procedure. */
export const BLOCK_AFTER_DAYS = 3

const DAY_MS = 24 * 60 * 60 * 1000

export type StepRow = {
  step: StepKey
  queuedAt: Date
  /** First copy accepted by the relay; null while none was. */
  confirmedAt: Date | null
  /** Copies queued so far (administrators with an address). */
  recipients: number
  /** The planned date this step's email announced (start of the day after the deadline). */
  plannedAt: Date
}

export type BlockReason = "legacy" | "no-recipient" | "undelivered" | "held"

export const BLOCK_REASONS: Record<BlockReason, string> = {
  legacy: "commencée avant le suivi des envois, aucun de ses messages n'est prouvé",
  "no-recipient": "aucun administrateur avec une adresse email",
  undelivered: "aucune copie acceptée par le serveur d'envoi (envois échoués ou annulés)",
  held: `toujours en attente d'envoi après ${BLOCK_AFTER_DAYS} jours`,
}

export type ProcedureInput = {
  /** The organisation is due in the schedule (assessInactivity → « due »). */
  due: boolean
  noticeAt: Date | null
  steps: StepRow[]
  /** Outbox rows of the current unconfirmed step still pending or being sent. */
  waiting: number
  /** Stored planned date (start of the day after the deadline), null before the first step. */
  plannedAt: Date | null
  timeZone: string
}

export type ProcedureDecision =
  /** No procedure and nothing due. */
  | { action: "none" }
  /** The procedure stops: activity, confirmation, upcoming event, postponement or exclusion. */
  | { action: "reset" }
  | { action: "queue"; step: StepKey; plannedAt: Date }
  /** Waiting for the current step's confirmation, or for the next step's date. */
  | { action: "wait"; step: StepKey; confirmed: boolean; plannedAt: Date; nextAt: Date | null }
  | { action: "blocked"; step: StepKey | null; reason: BlockReason; plannedAt: Date | null }
  | { action: "deactivate"; plannedAt: Date }

function localYmd(instant: Date, timeZone: string): { y: number; m: number; d: number } {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(instant)
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value)
  return { y: get("year"), m: get("month"), d: get("day") }
}

/** The first local midnight in `timeZone` at or after `instant`. */
export function ceilToLocalMidnight(instant: Date, timeZone: string): Date {
  const { y, m, d } = localYmd(instant, timeZone)
  const midnight = localDateTimeToUtc(new Date(Date.UTC(y, m - 1, d)), "00:00", timeZone)
  if (midnight.getTime() >= instant.getTime()) return midnight
  return localDateTimeToUtc(new Date(Date.UTC(y, m - 1, d + 1)), "00:00", timeZone)
}

/** The last day to answer, as an instant inside it: the day before the planned date. */
export function deadlineDay(plannedAt: Date): Date {
  return new Date(plannedAt.getTime() - 1)
}

const later = (a: Date | null, b: Date): Date => (a && a.getTime() > b.getTime() ? a : b)
const plus = (d: Date, days: number) => new Date(d.getTime() + days * DAY_MS)
const utcDayStart = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))

/** When the step after one confirmed on `confirmedAt` may be queued: the 30th UTC day after. */
export function nextStepAt(confirmedAt: Date): Date {
  return plus(utcDayStart(confirmedAt), REMINDER_GAP_DAYS)
}

/**
 * The planned date when `step` is queued at `now`: what is left of the schedule if every later
 * step goes on time, never before the first email + 75 days, never earlier than already planned.
 */
export function plannedAtQueue(step: StepKey, now: Date, noticeAt: Date | null, stored: Date | null, timeZone: string): Date {
  const notice = noticeAt ?? now
  const ahead = step === "first" ? MIN_DEACTIVATION_DAYS : step === "second" ? REMINDER_GAP_DAYS + FINAL_NOTICE_DAYS : FINAL_NOTICE_DAYS
  const earliest = new Date(Math.max(plus(notice, MIN_DEACTIVATION_DAYS).getTime(), plus(now, ahead).getTime()))
  return later(stored, ceilToLocalMidnight(earliest, timeZone))
}

/** The planned date once the last reminder is confirmed: 15 full days after it, at least. */
export function plannedAfterLast(lastConfirmedAt: Date, noticeAt: Date, stored: Date | null, timeZone: string): Date {
  const earliest = new Date(Math.max(plus(noticeAt, MIN_DEACTIVATION_DAYS).getTime(), plus(lastConfirmedAt, FINAL_NOTICE_DAYS).getTime()))
  return later(stored, ceilToLocalMidnight(earliest, timeZone))
}

/** The steps in order, with the current one (the latest queued), or null when they skip one. */
export function orderedSteps(steps: StepRow[]): { ordered: StepRow[]; consistent: boolean } {
  const byKey = new Map(steps.map((s) => [s.step, s]))
  const ordered: StepRow[] = []
  let consistent = byKey.size === steps.length
  for (const key of STEP_ORDER) {
    const s = byKey.get(key)
    if (!s) break
    // A step queued before the previous one was confirmed never happens: treat it as broken.
    const prev = ordered.at(-1)
    if (prev && !prev.confirmedAt) consistent = false
    ordered.push(s)
  }
  if (ordered.length !== steps.length) consistent = false
  return { ordered, consistent }
}

/** What the nightly run does for one active organisation with `ORG_INACTIVITY=on`. */
export function decideProcedure(p: ProcedureInput, now: Date): ProcedureDecision {
  const started = p.noticeAt !== null || p.steps.length > 0
  if (!p.due) return started ? { action: "reset" } : { action: "none" }
  if (!started) return { action: "queue", step: "first", plannedAt: plannedAtQueue("first", now, null, null, p.timeZone) }

  const { ordered, consistent } = orderedSteps(p.steps)
  const noticeAt = p.noticeAt ?? ordered[0]?.queuedAt ?? null
  // A procedure started before the steps were recorded (or one that lost a step): its
  // `noticeAt + 75 days` is a floor, not a proof. Manual handling, never a restart.
  if (!consistent || ordered.length === 0 || noticeAt === null) {
    const floor = noticeAt ? ceilToLocalMidnight(plus(noticeAt, MIN_DEACTIVATION_DAYS), p.timeZone) : null
    return { action: "blocked", step: ordered.at(-1)?.step ?? null, reason: "legacy", plannedAt: floor ? later(p.plannedAt, floor) : p.plannedAt }
  }

  const current = ordered.at(-1)!
  const stored = later(p.plannedAt, current.plannedAt)
  // The 75 days count from the first message's acceptance by the relay, its queuing as a fallback.
  const floorFrom = ordered[0].confirmedAt ?? noticeAt
  if (!current.confirmedAt) {
    const reason: BlockReason | null =
      current.recipients === 0 ? "no-recipient"
      : p.waiting === 0 ? "undelivered"
      : now.getTime() - current.queuedAt.getTime() >= BLOCK_AFTER_DAYS * DAY_MS ? "held"
      : null
    if (reason) return { action: "blocked", step: current.step, reason, plannedAt: stored }
    return { action: "wait", step: current.step, confirmed: false, plannedAt: stored, nextAt: null }
  }

  if (current.step === "last") {
    const planned = plannedAfterLast(current.confirmedAt, floorFrom, stored, p.timeZone)
    if (now.getTime() >= planned.getTime()) return { action: "deactivate", plannedAt: planned }
    return { action: "wait", step: current.step, confirmed: true, plannedAt: planned, nextAt: planned }
  }

  const next = STEP_ORDER[STEP_ORDER.indexOf(current.step) + 1]
  const at = nextStepAt(current.confirmedAt)
  if (now.getTime() >= at.getTime()) return { action: "queue", step: next, plannedAt: plannedAtQueue(next, now, floorFrom, stored, p.timeZone) }
  return { action: "wait", step: current.step, confirmed: true, plannedAt: stored, nextAt: at }
}

/**
 * Whether a queued inactivity email may still leave (checked right before the send): the
 * recipient is still an active administrator of the organisation at that address, and nothing
 * stopped the procedure since the step was queued (a later activity or answer, a postponement, an
 * exclusion). Otherwise the copy is cancelled; another administrator's copy can still confirm.
 */
export function inactivityCopyVerdict(
  copy: { recipientEmail: string; queuedAt: Date },
  org: {
    active: boolean
    exempt: boolean
    postponedUntil: Date | null
    lastActivityAt: Date | null
    lastRetentionConfirmedAt: Date | null
    adminEmails: string[]
  } | null,
  now: Date,
): string | null {
  if (!org || !org.active) return null // the organisation guard of sendNotification refuses it
  const email = copy.recipientEmail.trim().toLowerCase()
  if (!org.adminEmails.some((a) => a.trim().toLowerCase() === email)) return "Plus administrateur à cette adresse : message de la vérification d'inactivité annulé."
  const stoppedAfter = (d: Date | null) => d !== null && d.getTime() > copy.queuedAt.getTime()
  if (org.exempt || (org.postponedUntil && org.postponedUntil.getTime() > now.getTime()) || stoppedAfter(org.lastActivityAt) || stoppedAfter(org.lastRetentionConfirmedAt)) {
    return "Vérification d'inactivité arrêtée : message annulé."
  }
  return null
}

export type StepView = { step: StepKey; label: string; state: "queued" | "sent" | "blocked"; at: Date }

/** The procedure in words for the operator: each step queued, sent or blocked, and the real planned date. */
export function procedureView(p: ProcedureInput, now: Date): {
  steps: StepView[]
  blocked: { reason: BlockReason; text: string } | null
  /** Last day to answer (inside it), and the planned date itself, when known. */
  deadline: Date | null
  plannedAt: Date | null
  /** The next step and when it may be queued, if waiting for it. */
  next: { label: string; at: Date } | null
} {
  const decision = decideProcedure(p, now)
  const { ordered } = orderedSteps(p.steps)
  const blocked = decision.action === "blocked" ? { reason: decision.reason, text: BLOCK_REASONS[decision.reason] } : null
  const steps: StepView[] = ordered.map((s) => ({
    step: s.step,
    label: STEP_LABELS[s.step],
    state: s.confirmedAt ? "sent" : blocked && decision.action === "blocked" && decision.step === s.step ? "blocked" : "queued",
    at: s.confirmedAt ?? s.queuedAt,
  }))
  const plannedAt = "plannedAt" in decision ? decision.plannedAt : p.plannedAt
  let next: { label: string; at: Date } | null = null
  if (decision.action === "wait" && decision.confirmed && decision.nextAt && decision.step !== "last") {
    const key = STEP_ORDER[STEP_ORDER.indexOf(decision.step) + 1]
    next = { label: STEP_LABELS[key], at: decision.nextAt }
  }
  return { steps, blocked, deadline: plannedAt ? deadlineDay(plannedAt) : null, plannedAt, next }
}
