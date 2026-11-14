// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Per-event automatic reminder delays (#1139), pure: no Prisma, no clock, no Date.now().
 *
 * An event without any rule keeps the legacy path untouched (`REMINDER_WINDOW_HOURS` in
 * `automatic-reminders.ts` and the three organisation switches in `notification-settings.ts`).
 * An event with at least one rule row — even all disabled — follows its own rows only. The one
 * function that decides this is `eventUsesCustomReminderRules`, so the rule can be changed in a
 * single place (PR 2 will explain it in the settings screen).
 *
 * A rule is counted back from the volunteer's earliest active shift of the event on that stored
 * local day (`shiftLocalDay` / `shiftStartInstant` in `reminder-groups.ts`): a shift past midnight
 * keeps its start day, and a day is 24 elapsed hours, never calendar arithmetic. Grouping stays
 * per volunteer, event and local day.
 */

import {
  shiftStartInstant,
  type GroupableRegistration,
  type ReminderGroup,
} from "./reminder-groups"

export const REMINDER_RULE_UNITS = ["hours", "days"] as const
export type ReminderRuleUnit = (typeof REMINDER_RULE_UNITS)[number]

/** At most this many rules per event (#1139). */
export const MAX_REMINDER_RULES = 3

/** A day is 24 elapsed hours, never a calendar day (#1139). */
export const HOURS_PER_DAY = 24

export const REMINDER_RULE_BOUNDS: Record<ReminderRuleUnit, { min: number; max: number }> = {
  hours: { min: 2, max: 336 },
  days: { min: 1, max: 14 },
}

/** What the table and the future settings screen provide. `unit` is loose: stored values are validated. */
export type ReminderRuleInput = {
  id: string
  unit: string
  value: number
  enabled: boolean
  displayOrder?: number
}

export type ValidReminderRule = {
  id: string
  unit: ReminderRuleUnit
  value: number
  enabled: boolean
  displayOrder: number
}

export function isReminderRuleUnit(unit: string): unit is ReminderRuleUnit {
  return (REMINDER_RULE_UNITS as readonly string[]).includes(unit)
}

/** The delay of a rule in hours; null when the unit is unknown. */
export function reminderRuleHours(rule: Pick<ReminderRuleInput, "unit" | "value">): number | null {
  if (rule.unit === "days") return rule.value * HOURS_PER_DAY
  if (rule.unit === "hours") return rule.value
  return null
}

export type ReminderRulesValidation =
  | { ok: true; rules: ValidReminderRule[] }
  | { ok: false; error: string }

/**
 * Bounds, integer values and the refusal of two rules with the same delay once converted to hours
 * (#1139). `displayOrder` defaults to the input position. Messages are French, ready for the
 * settings screen of PR 2.
 */
export function validateReminderRules(rules: readonly ReminderRuleInput[]): ReminderRulesValidation {
  if (rules.length > MAX_REMINDER_RULES) {
    return { ok: false, error: `Un événement ne peut pas avoir plus de ${MAX_REMINDER_RULES} rappels.` }
  }
  const seen = new Map<number, number>()
  const normalized: ValidReminderRule[] = []
  for (const [index, rule] of rules.entries()) {
    if (!isReminderRuleUnit(rule.unit)) {
      return { ok: false, error: `Unité de rappel inconnue : « ${rule.unit} ».` }
    }
    if (!Number.isInteger(rule.value)) {
      return { ok: false, error: "Le délai d'un rappel doit être un nombre entier." }
    }
    const bounds = REMINDER_RULE_BOUNDS[rule.unit]
    if (rule.value < bounds.min || rule.value > bounds.max) {
      return {
        ok: false,
        error: rule.unit === "hours"
          ? `Un rappel en heures doit être compris entre ${bounds.min} et ${bounds.max} heures.`
          : `Un rappel en jours doit être compris entre ${bounds.min} et ${bounds.max} jours.`,
      }
    }
    const hours = reminderRuleHours(rule)!
    const duplicate = seen.get(hours)
    if (duplicate !== undefined) {
      return { ok: false, error: `Deux rappels ont le même délai : ${hours} heures.` }
    }
    seen.set(hours, index)
    normalized.push({
      id: rule.id,
      unit: rule.unit,
      value: rule.value,
      enabled: rule.enabled,
      displayOrder: rule.displayOrder ?? index,
    })
  }
  return { ok: true, rules: normalized }
}

/**
 * The single switch between the legacy defaults and an event's own rules (#1139): no row means
 * exactly today's behaviour, at least one row (even all disabled) means the legacy path is off
 * for that event. Organisation switches never apply to an event that has its own rules.
 */
export function eventUsesCustomReminderRules(rules: readonly Pick<ReminderRuleInput, "id">[]): boolean {
  return rules.length > 0
}

/** A registration that can be grouped and whose confirmation time decides late sign-ups. */
export type ReminderRuleRegistration = GroupableRegistration & {
  /** When the registration row was created: the request time, not necessarily the confirmation. */
  createdAt: Date
  /**
   * The email confirmation that proved the address (#1253), when the sign-up went through one.
   * `confirmedAt` is the instant the place became active; `Registration.createdAt` stays the
   * request time. Null for a registration created active at once (admin, or an event without
   * email confirmation), which falls back to `createdAt`.
   */
  signupConfirmation?: { confirmedAt: Date | null } | null
}

/**
 * When a place became active, as far as this schema records it (#1139).
 *
 * `SignupConfirmation.confirmedAt` covers a public sign-up that waited for its email confirmation;
 * the registration row keeps that relation after the click (`Registration.signupConfirmationId`),
 * so a place requested before a reminder's due instant but confirmed after it is late. Every other
 * registration falls back to `createdAt`, which is right for a place created active at once.
 *
 * LIMIT: no column records when a `requested` (approval) or `waiting` place became `active` after
 * an organiser's approval or a waitlist promotion. Those transitions keep `createdAt` (and, for an
 * email-confirmed sign-up, `confirmedAt`), so a place approved or promoted after the due instant
 * can still pass as on time. Adding an activation timestamp is deliberately out of scope here.
 */
export function reminderPlaceActiveAt(registration: ReminderRuleRegistration): Date {
  return registration.signupConfirmation?.confirmedAt ?? registration.createdAt
}

export type ReminderRuleStatus = "due" | "not-yet" | "late" | "started" | "disabled"

export type ReminderRuleEvaluation = {
  status: ReminderRuleStatus
  /** `earliestStart - hours`; null when the rule's unit is unknown. */
  dueAt: Date | null
  hours: number | null
}

/** Due instant of a rule for a group: counted back from the earliest start of the local day. */
export function reminderRuleDueAt(earliestStart: Date, hours: number): Date {
  return new Date(earliestStart.getTime() - hours * 3_600_000)
}

/**
 * Whether a rule may go out now for one group (#1139):
 * - disabled rule: nothing;
 * - due instant still in the future: not yet;
 * - earliest shift already started: too late (the cron was down past the shift);
 * - every place of the group confirmed after the due instant: late sign-up, that rule is skipped
 *   (a later rule with a later due instant still applies);
 * - otherwise: due.
 */
export function reminderRuleStatus<T extends ReminderRuleRegistration>(
  group: ReminderGroup<T>,
  rule: Pick<ReminderRuleInput, "enabled" | "unit" | "value">,
  now: Date,
): ReminderRuleEvaluation {
  if (!rule.enabled) return { status: "disabled", dueAt: null, hours: null }
  const hours = reminderRuleHours(rule)
  if (hours === null) return { status: "disabled", dueAt: null, hours: null }
  const dueAt = reminderRuleDueAt(group.earliestStart, hours)
  if (now.getTime() < dueAt.getTime()) return { status: "not-yet", dueAt, hours }
  if (group.earliestStart.getTime() <= now.getTime()) return { status: "started", dueAt, hours }
  const confirmedBefore = group.registrations.some((r) => reminderPlaceActiveAt(r).getTime() <= dueAt.getTime())
  if (!confirmedBefore) return { status: "late", dueAt, hours }
  return { status: "due", dueAt, hours }
}

/** The occurrence state a pair carries: `sent` and `failed` are terminal, `queued` is in flight. */
export type ReminderOccurrenceKey = {
  eventId: string
  volunteerId: string
  localDay: string
  ruleId: string
  status: string
}

const occurrenceKey = (o: Pick<ReminderOccurrenceKey, "eventId" | "volunteerId" | "localDay" | "ruleId">) =>
  [o.eventId, o.volunteerId, o.localDay, o.ruleId].join("\u0000")

export type CustomReminderTrigger<T extends ReminderRuleRegistration> = {
  group: ReminderGroup<T>
  rule: ValidReminderRule
  dueAt: Date
  hours: number
}

/**
 * The (group, rule) pairs the cron must claim now (#1139), in due order. A `sent`, `queued` or
 * `failed` occurrence suppresses its pair; a `pending` or `cancelled` one does not (unsent
 * occurrences are recomputed from the current registrations, a sent one is never reopened, and a
 * terminal delivery failure is not retried by the hourly run).
 */
export function triggeredCustomReminders<T extends ReminderRuleRegistration>(
  groups: readonly ReminderGroup<T>[],
  rules: readonly ReminderRuleInput[],
  now: Date,
  occurrences: readonly ReminderOccurrenceKey[] = [],
): CustomReminderTrigger<T>[] {
  const handled = new Set(
    occurrences.filter((o) => o.status === "sent" || o.status === "queued" || o.status === "failed").map(occurrenceKey),
  )
  const triggers: CustomReminderTrigger<T>[] = []
  for (const group of groups) {
    for (const rule of rules) {
      if (!rule.enabled) continue
      const candidate = { eventId: group.eventId, volunteerId: group.volunteerId, localDay: group.localDay, ruleId: rule.id }
      if (handled.has(occurrenceKey(candidate))) continue
      const evaluation = reminderRuleStatus(group, rule, now)
      if (evaluation.status !== "due" || !evaluation.dueAt || evaluation.hours === null) continue
      triggers.push({
        group,
        rule: {
          id: rule.id,
          unit: isReminderRuleUnit(rule.unit) ? rule.unit : "hours",
          value: rule.value,
          enabled: rule.enabled,
          displayOrder: rule.displayOrder ?? 0,
        },
        dueAt: evaluation.dueAt,
        hours: evaluation.hours,
      })
    }
  }
  return triggers.sort(
    (a, b) =>
      a.dueAt.getTime() - b.dueAt.getTime() ||
      a.group.localDay.localeCompare(b.group.localDay) ||
      a.group.volunteerId.localeCompare(b.group.volunteerId) ||
      a.rule.displayOrder - b.rule.displayOrder,
  )
}

/** A queued occurrence with the schedule stored after its outbox row was created. */
export type ReminderOccurrenceSchedule = ReminderOccurrenceKey & { dueAt: Date }

export type QueuedOccurrenceReschedule = {
  eventId: string
  volunteerId: string
  localDay: string
  ruleId: string
  /** Due instant recomputed from the current registrations. */
  dueAt: Date
}

/**
 * Recomputed due instant of every `queued` occurrence (#1139), pure: a shift moved later makes
 * delivery defer the outbox row to the new time; a later move back earlier must bring the row's
 * schedule forward, or the reminder waits for the old, later time and is cancelled because the
 * shift has started by then. A `queued` occurrence is otherwise suppressed by
 * `triggeredCustomReminders`, so this is the only place that moves it.
 *
 * A missing group (emptied day) or a disabled/deleted rule returns nothing: the delivery recheck
 * cancels it, exactly as before. Backoff and quota holds of the outbox row are not this function's
 * business: the caller only advances a schedule that has none.
 */
export function rescheduleQueuedOccurrences<T extends ReminderRuleRegistration>(
  groups: readonly ReminderGroup<T>[],
  rules: readonly Pick<ReminderRuleInput, "id" | "unit" | "value" | "enabled">[],
  occurrences: readonly ReminderOccurrenceSchedule[],
): QueuedOccurrenceReschedule[] {
  const groupKey = (value: Pick<ReminderOccurrenceKey, "eventId" | "volunteerId" | "localDay">) =>
    [value.eventId, value.volunteerId, value.localDay].join("\u0000")
  const groupByKey = new Map(groups.map((group) => [groupKey(group), group]))
  const ruleById = new Map(rules.map((rule) => [rule.id, rule]))
  const changes: QueuedOccurrenceReschedule[] = []
  for (const occurrence of occurrences) {
    if (occurrence.status !== "queued") continue
    const rule = ruleById.get(occurrence.ruleId)
    if (!rule || !rule.enabled) continue
    const hours = reminderRuleHours(rule)
    if (hours === null) continue
    const group = groupByKey.get(groupKey(occurrence))
    if (!group) continue
    changes.push({
      eventId: occurrence.eventId,
      volunteerId: occurrence.volunteerId,
      localDay: occurrence.localDay,
      ruleId: occurrence.ruleId,
      dueAt: reminderRuleDueAt(group.earliestStart, hours),
    })
  }
  return changes
}

/** The shift's local day as stored (`shiftLocalDay`), re-exported for callers of this module. */
export function reminderLocalDay(shift: { date: Date }): string {
  return shift.date.toISOString().slice(0, 10)
}

/** Start instant of a shift in the organisation's zone, for the anchor. */
export function reminderShiftStart(shift: { date: Date; startTime: string }, timeZone: string): Date {
  return shiftStartInstant(shift, timeZone)
}

// ── Preview (#1139) ──────────────────────────────────────────────────────────

export type ReminderPreviewState = "queued" | "scheduled" | "blocked"

export type ReminderPreviewBlockedReason =
  | "event-off"
  | "organization-blocked"
  | "no-rules"
  | "no-enabled-rule"
  | "no-upcoming-reminder"

export type CustomReminderPreview =
  | {
      state: "blocked"
      reason: ReminderPreviewBlockedReason
      /** Present for an organisation block: the reason returned by organizationSendingVerdict. */
      detail: string | null
      ruleId: null
      dueAt: null
      localDay: null
      recipientCount: 0
      shiftCount: 0
    }
  | {
      state: "queued" | "scheduled"
      reason: null
      detail: null
      ruleId: string
      dueAt: Date
      localDay: string
      /** Distinct volunteers whose next reminder is this rule at this due instant. */
      recipientCount: number
      /** Shifts listed in those emails. */
      shiftCount: number
    }

export type ReminderPreviewInput<T extends ReminderRuleRegistration> = {
  rules: readonly ReminderRuleInput[]
  groups: readonly ReminderGroup<T>[]
  now: Date
  occurrences?: readonly ReminderOccurrenceKey[]
  /** `Event.remindersEnabled`, the event-wide stop. */
  eventRemindersEnabled: boolean
  /** Suspension/deactivation decided elsewhere (`organizationSendingVerdict`); null when clear. */
  organizationBlockedReason?: string | null
}

/**
 * Read-only evaluator shared by the cron and a future preview (#1139): the next eligible group's
 * rule, its due instant, how many recipients it covers and whether it is queued (due now or
 * already in the outbox) or still scheduled. The cron uses the same `reminderRuleStatus` and
 * `triggeredCustomReminders` logic, so the preview cannot drift from what is sent.
 */
export function nextEventReminderPreview<T extends ReminderRuleRegistration>(
  input: ReminderPreviewInput<T>,
): CustomReminderPreview {
  const blocked = (reason: ReminderPreviewBlockedReason, detail: string | null = null): CustomReminderPreview => ({
    state: "blocked", reason, detail, ruleId: null, dueAt: null, localDay: null, recipientCount: 0, shiftCount: 0,
  })
  if (!input.eventRemindersEnabled) return blocked("event-off")
  if (input.organizationBlockedReason) return blocked("organization-blocked", input.organizationBlockedReason)
  if (!eventUsesCustomReminderRules(input.rules)) return blocked("no-rules")
  const enabled = input.rules.filter((r) => r.enabled)
  if (enabled.length === 0) return blocked("no-enabled-rule")

  const occurrences = input.occurrences ?? []
  const byKey = new Map(occurrences.map((o) => [occurrenceKey(o), o]))
  type Candidate = { group: ReminderGroup<T>; rule: ReminderRuleInput; dueAt: Date; state: "queued" | "scheduled" }
  const candidates: Candidate[] = []
  for (const group of input.groups) {
    for (const rule of enabled) {
      const occurrence = byKey.get(occurrenceKey({ ...group, ruleId: rule.id }))
      if (occurrence?.status === "sent" || occurrence?.status === "cancelled" || occurrence?.status === "failed") continue
      const evaluation = reminderRuleStatus(group, rule, input.now)
      if (evaluation.status !== "due" && evaluation.status !== "not-yet") continue
      if (!evaluation.dueAt) continue
      candidates.push({
        group,
        rule,
        dueAt: evaluation.dueAt,
        state: occurrence?.status === "queued" || evaluation.status === "due" ? "queued" : "scheduled",
      })
    }
  }
  if (candidates.length === 0) return blocked("no-upcoming-reminder")

  candidates.sort((a, b) => a.dueAt.getTime() - b.dueAt.getTime() || a.group.localDay.localeCompare(b.group.localDay))
  const first = candidates[0]
  // The next batch: every group whose same rule is due at the same instant.
  const batch = candidates.filter((c) => c.dueAt.getTime() === first.dueAt.getTime() && c.rule.id === first.rule.id)
  const volunteers = new Set(batch.map((c) => c.group.volunteerId))
  const shiftCount = batch.reduce((n, c) => n + c.group.registrations.length, 0)
  return {
    state: batch.some((c) => c.state === "queued") ? "queued" : "scheduled",
    reason: null,
    detail: null,
    ruleId: first.rule.id,
    dueAt: first.dueAt,
    localDay: first.group.localDay,
    recipientCount: volunteers.size,
    shiftCount,
  }
}
