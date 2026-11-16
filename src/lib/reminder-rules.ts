// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Per-event automatic reminder delays (#1139), pure: no Prisma, no clock, no Date.now().
 *
 * An event without any rule keeps the legacy path untouched (`REMINDER_WINDOW_HOURS` in
 * `automatic-reminders.ts` and the three organisation switches in `notification-settings.ts`).
 * An event with at least one rule row — even all disabled — follows its own rows only. The one
 * function that decides this is `eventUsesCustomReminderRules`, so the rule can be changed in a
 * single place; the event's settings screen explains it.
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
import { ORG_INACTIVE_REASON } from "./outbox-org-cancel-reason"
import { ORG_PENDING_REASON } from "./outbox-org-pending-reason"

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
  /** Set on a removed rule that already sent an occurrence: hidden, never counted nor sent. */
  archivedAt?: Date | null
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
  | {
      ok: false
      error: string
      /** 1-based position of the faulty rule, when the error is about one rule. */
      rule?: number
      /** Both 1-based positions of a duplicate delay, first then later. */
      positions?: [number, number]
    }

/**
 * Bounds, integer values and the refusal of two rules with the same delay once converted to hours
 * (#1139). `displayOrder` defaults to the input position. Messages are French and name the rule
 * by its 1-based position, ready for the settings screen of PR 2.
 */
export function validateReminderRules(rules: readonly ReminderRuleInput[]): ReminderRulesValidation {
  if (rules.length > MAX_REMINDER_RULES) {
    return { ok: false, error: `Un événement ne peut pas avoir plus de ${MAX_REMINDER_RULES} rappels.`, rule: MAX_REMINDER_RULES + 1 }
  }
  const seen = new Map<number, number>()
  const normalized: ValidReminderRule[] = []
  for (const [index, rule] of rules.entries()) {
    const position = index + 1
    if (!isReminderRuleUnit(rule.unit)) {
      return { ok: false, error: `Rappel ${position} : unité de rappel inconnue : « ${rule.unit} ».`, rule: position }
    }
    if (!Number.isInteger(rule.value)) {
      return { ok: false, error: `Rappel ${position} : le délai doit être un nombre entier.`, rule: position }
    }
    const bounds = REMINDER_RULE_BOUNDS[rule.unit]
    if (rule.value < bounds.min || rule.value > bounds.max) {
      return {
        ok: false,
        error: rule.unit === "hours"
          ? `Rappel ${position} : un rappel en heures doit être compris entre ${bounds.min} et ${bounds.max} heures.`
          : `Rappel ${position} : un rappel en jours doit être compris entre ${bounds.min} et ${bounds.max} jours.`,
        rule: position,
      }
    }
    const hours = reminderRuleHours(rule)!
    const duplicate = seen.get(hours)
    if (duplicate !== undefined) {
      const first = duplicate + 1
      return {
        ok: false,
        error: `Les rappels ${first} et ${position} ont le même délai : ${hours} heures.`,
        // The later rule is the one that makes the delay a duplicate: mark it, so the screen can
        // focus the field the organiser has to change.
        rule: position,
        positions: [first, position],
      }
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

/** A rule as the settings screen sends it: an existing `id`, or none for a new one. */
export type ReminderRuleDraftInput = {
  id?: string
  unit: string
  value: number
  enabled: boolean
}

/** The whole settings payload: the legacy defaults, or the event's own rules. */
export type ReminderRulesInput =
  | { mode: "default" }
  | { mode: "custom"; rules: readonly ReminderRuleDraftInput[] }

export type ReminderRulesInputValidation =
  | { ok: true; mode: "default"; rules: [] }
  | { ok: true; mode: "custom"; rules: ValidReminderRule[] }
  | { ok: false; error: string; rule?: number; positions?: [number, number] }

/**
 * Normalises and validates the settings payload (#1139): custom mode needs at least one rule;
 * a rule without an `id` is new and gets an empty id, which the server treats as a creation.
 * Messages name the rule, so the API can attach the error to its field.
 */
export function validateReminderRulesInput(input: ReminderRulesInput): ReminderRulesInputValidation {
  if (input.mode === "default") return { ok: true, mode: "default", rules: [] }
  if (input.rules.length === 0) {
    return { ok: false, error: "Ajoutez au moins un rappel, ou choisissez les délais habituels." }
  }
  const result = validateReminderRules(input.rules.map((rule) => ({
    id: rule.id ?? "",
    unit: rule.unit,
    value: rule.value,
    enabled: rule.enabled,
  })))
  return result.ok
    ? { ok: true, mode: "custom", rules: result.rules }
    : { ok: false, error: result.error, ...(result.rule ? { rule: result.rule } : {}), ...(result.positions ? { positions: result.positions } : {}) }
}

/**
 * The single switch between the legacy defaults and an event's own rules (#1139): no row means
 * exactly today's behaviour, at least one row (even all disabled) means the legacy path is off
 * for that event. Organisation switches never apply to an event that has its own rules.
 * Archived rows are history, not rules: an event whose rows are all archived is back in default
 * mode, so the legacy path applies again.
 */
export function eventUsesCustomReminderRules<T extends object>(rules: readonly T[]): boolean {
  return rules.some((rule) => !("archivedAt" in rule) || !(rule as { archivedAt?: Date | null }).archivedAt)
}

/** « 7 jours », « 2 heures »: one delay in words, singular agreed. */
export function reminderRuleDelay(rule: Pick<ReminderRuleInput, "unit" | "value">): string {
  const unit = rule.unit === "days" ? "jour" : "heure"
  return `${rule.value} ${unit}${rule.value > 1 ? "s" : ""}`
}

/** « 7 jours avant »: how the summaries and the preview word one delay. */
export function reminderRuleDelayBefore(rule: Pick<ReminderRuleInput, "unit" | "value">): string {
  return `${reminderRuleDelay(rule)} avant`
}

const frenchList = (items: readonly string[]): string =>
  items.length > 1 ? `${items.slice(0, -1).join(", ")} et ${items[items.length - 1]}` : items[0] ?? ""

/** The enabled delays, in the event's order: « 7 jours avant, 2 heures avant ». */
export function reminderRulesDelayList(rules: readonly Pick<ReminderRuleInput, "unit" | "value" | "enabled">[]): string {
  return frenchList(rules.filter((rule) => rule.enabled).map(reminderRuleDelayBefore))
}

/** A compact before/after description for the event log, disabled rules included. */
export function reminderRulesDescription(rules: readonly Pick<ReminderRuleInput, "unit" | "value" | "enabled">[]): string {
  return rules.length === 0
    ? "(aucun)"
    : rules.map((rule) => `${reminderRuleDelay(rule)}${rule.enabled ? "" : " (désactivé)"}`).join(", ")
}

export type ReminderRulesSnapshot = {
  mode: "default" | "custom"
  rules: readonly Pick<ReminderRuleInput, "unit" | "value" | "enabled">[]
}

/**
 * The change the event log records (#1139): the mode and the compact list before/after, nothing
 * that is not needed to understand what the organiser changed.
 */
export function reminderRulesChange(
  before: ReminderRulesSnapshot,
  after: ReminderRulesSnapshot,
): Record<string, { from: unknown; to: unknown }> {
  const changes: Record<string, { from: unknown; to: unknown }> = {}
  if (before.mode !== after.mode) {
    changes.reminderRulesMode = { from: before.mode, to: after.mode }
  }
  const from = reminderRulesDescription(before.rules)
  const to = reminderRulesDescription(after.rules)
  if (from !== to) changes.reminderRules = { from, to }
  return changes
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
 * When a reminder's outbox row may next be attempted (#1139): the later of the reminder's own due
 * instant (shift and rule) and the delivery's own constraint (retry backoff or sending-limit hold).
 * Kept as two deadlines so a shift moved back earlier brings the row forward to its constraint,
 * never past it, whatever the row's `attempts` count.
 */
export function nextReminderAttemptAt(dueAt: Date, deliveryNotBefore: Date | null): Date {
  return deliveryNotBefore && deliveryNotBefore.getTime() > dueAt.getTime() ? deliveryNotBefore : dueAt
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
  rule: Pick<ReminderRuleInput, "enabled" | "unit" | "value"> & { archivedAt?: Date | null },
  now: Date,
): ReminderRuleEvaluation {
  if (rule.archivedAt || !rule.enabled) return { status: "disabled", dueAt: null, hours: null }
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

/**
 * The one terminal-status policy shared by the cron and the preview (#1139): `sent` and `failed`
 * are final, never reopened. `queued` is already in flight: the cron must not claim it again, but
 * the preview still shows it as the current send. `pending` and `cancelled` are recomputed from
 * the current registrations, so a disabled-then-re-enabled rule is queued again by both.
 */
export function reminderOccurrenceTerminal(status: string): boolean {
  return status === "sent" || status === "failed"
}

export function reminderOccurrenceHandled(status: string): boolean {
  return reminderOccurrenceTerminal(status) || status === "queued"
}

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
  const handled = new Set(occurrences.filter((o) => reminderOccurrenceHandled(o.status)).map(occurrenceKey))
  const triggers: CustomReminderTrigger<T>[] = []
  for (const group of groups) {
    for (const rule of rules) {
      if (rule.archivedAt || !rule.enabled) continue
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
 * business: the caller combines this due instant with the row's `deliveryNotBefore` deadline.
 */
export function rescheduleQueuedOccurrences<T extends ReminderRuleRegistration>(
  groups: readonly ReminderGroup<T>[],
  rules: readonly (Pick<ReminderRuleInput, "id" | "unit" | "value" | "enabled"> & { archivedAt?: Date | null })[],
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
    if (!rule || rule.archivedAt || !rule.enabled) continue
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
  | "event-unpublished"
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
  /** `Event.publicStatus === "published"`: the cron and the delivery resolver send nothing else. */
  eventPublished?: boolean
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
  if (input.eventPublished === false) return blocked("event-unpublished")
  if (input.organizationBlockedReason) return blocked("organization-blocked", input.organizationBlockedReason)
  if (!eventUsesCustomReminderRules(input.rules)) return blocked("no-rules")
  const enabled = input.rules.filter((r) => !r.archivedAt && r.enabled)
  if (enabled.length === 0) return blocked("no-enabled-rule")

  const occurrences = input.occurrences ?? []
  const byKey = new Map(occurrences.map((o) => [occurrenceKey(o), o]))
  type Candidate = { group: ReminderGroup<T>; rule: ReminderRuleInput; dueAt: Date; state: "queued" | "scheduled" }
  const candidates: Candidate[] = []
  for (const group of input.groups) {
    for (const rule of enabled) {
      const occurrence = byKey.get(occurrenceKey({ ...group, ruleId: rule.id }))
      // Same terminal policy as `triggeredCustomReminders`: a cancelled occurrence is recomputed,
      // so disabling then re-enabling a rule shows the reminder the cron will queue again; a
      // queued one stays visible as the current send.
      if (occurrence && reminderOccurrenceTerminal(occurrence.status)) continue
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

/** The preview as JSON and as the client component receive it (`dueAt` serialised). */
export type CustomReminderPreviewView =
  | {
      state: "blocked"
      reason: ReminderPreviewBlockedReason
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
      dueAt: string
      localDay: string
      recipientCount: number
      shiftCount: number
    }

/** One rule as the settings screen edits it. */
export type EventReminderRuleView = {
  id: string
  unit: "hours" | "days"
  value: number
  enabled: boolean
}

/** What the reminder-rules API returns and the settings form renders. */
export type EventReminderRulesState = {
  mode: "default" | "custom"
  rules: EventReminderRuleView[]
  preview: CustomReminderPreviewView
}

export function reminderPreviewView(preview: CustomReminderPreview): CustomReminderPreviewView {
  return preview.state === "blocked"
    ? {
        state: "blocked",
        reason: preview.reason,
        detail: preview.detail,
        ruleId: null,
        dueAt: null,
        localDay: null,
        recipientCount: 0,
        shiftCount: 0,
      }
    : {
        state: preview.state,
        reason: null,
        detail: null,
        ruleId: preview.ruleId,
        dueAt: preview.dueAt.toISOString(),
        localDay: preview.localDay,
        recipientCount: preview.recipientCount,
        shiftCount: preview.shiftCount,
      }
}

const plural = (n: number, one: string, many: string) => `${n} ${n > 1 ? many : one}`

/** « jeudi 12 juin à 08:00 », in the organisation's zone. */
function previewMoment(iso: string, timeZone: string): string {
  const at = new Date(iso)
  const day = at.toLocaleDateString("fr-FR", { timeZone, weekday: "long", day: "numeric", month: "long" })
  const time = at.toLocaleTimeString("fr-FR", { timeZone, hour: "2-digit", minute: "2-digit" })
  return `${day} à ${time}`
}

/** Why an email may not go, in one sentence, from `organizationSendingVerdict`'s detail code. */
function organizationBlockedSentence(detail: string | null): string {
  if (detail === ORG_INACTIVE_REASON) return "L'organisation est désactivée : aucun email ne partira."
  if (detail === ORG_PENDING_REASON) return "L'espace attend encore sa validation : aucun email ne partira pour l'instant."
  return detail
    ? `L'organisation ne peut pas envoyer d'emails (${detail}).`
    : "L'organisation ne peut pas envoyer d'emails."
}

/**
 * The one sentence of the « Prochain envoi » block (#1139), from the saved preview. Not a live
 * region: the component renders it as ordinary text.
 */
export function customReminderPreviewSentence(preview: CustomReminderPreviewView, timeZone: string): string {
  if (preview.state === "scheduled") {
    return `Prochain rappel : ${previewMoment(preview.dueAt, timeZone)}, pour ${plural(preview.recipientCount, "personne", "personnes")} (${plural(preview.shiftCount, "créneau", "créneaux")}).`
  }
  if (preview.state === "queued") {
    return `Un rappel est en cours d'envoi pour ${plural(preview.recipientCount, "personne", "personnes")} (${plural(preview.shiftCount, "créneau", "créneaux")}).`
  }
  switch (preview.reason) {
    case "event-off":
      return "Les rappels automatiques sont coupés pour cet événement : aucun rappel ne partira."
    case "event-unpublished":
      return "L'événement n'est pas publié : les rappels ne partiront qu'après sa publication."
    case "organization-blocked":
      return organizationBlockedSentence(preview.detail)
    case "no-enabled-rule":
      return "Tous les rappels de cet événement sont désactivés : aucun email ne partira."
    case "no-rules":
      return "Cet événement utilise les délais habituels : choisissez ses propres délais pour voir le prochain envoi."
    case "no-upcoming-reminder":
      return "Rien à envoyer pour l'instant : aucun créneau à venir ne peut encore recevoir ces rappels."
    default:
      return "Aucun rappel à venir."
  }
}
