// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Settings side of the per-event reminder rules (#1139): read the state the admin screen shows,
 * and save a new set of rules in one serialised transaction.
 *
 * The preview is built from the same loaders as the hourly cron (`loadCustomReminderGroups`,
 * `loadCustomReminderOccurrences` in `reminder-rules-server.ts`), so it cannot drift from what is
 * sent. Saving takes the event's advisory lock (`lockReminderRules`) before reading or writing:
 * two saves, or a save and the hourly run, cannot interleave. Occurrences that would otherwise
 * send with the old timing are cancelled or rescheduled in the same transaction, and a removed
 * rule's already-queued outbox row is cancelled before the cascade deletes the occurrence.
 */

import {
  eventUsesCustomReminderRules,
  isReminderRuleUnit,
  nextEventReminderPreview,
  nextReminderAttemptAt,
  reminderPreviewView,
  reminderRuleHours,
  reminderRulesChange,
  reminderRuleStatus,
  validateReminderRulesInput,
  type EventReminderRuleView,
  type ReminderRuleInput,
  type EventReminderRulesState,
  type ReminderRulesInput,
  type ValidReminderRule,
} from "./reminder-rules"
import {
  customReminderEventWithRulesSelect,
  isActiveReminderRule,
  loadCustomReminderGroups,
  loadCustomReminderOccurrences,
  lockReminderRules,
  type CustomReminderEventWithRules,
} from "./reminder-rules-server"
import { organizationSendingVerdict } from "./notifications/org-send-guard"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any

export type { EventReminderRuleView, EventReminderRulesState } from "./reminder-rules"

export type SaveEventReminderRulesResult =
  | {
      ok: true
      state: EventReminderRulesState
      /** Compact before/after for the event log; empty when nothing changed. */
      changes: Record<string, { from: unknown; to: unknown }>
    }
  | { ok: false; status: 400 | 404; error: string; rule?: number; positions?: [number, number] }

const view = (rule: { id: string; unit: string; value: number; enabled: boolean }): EventReminderRuleView => ({
  id: rule.id,
  unit: isReminderRuleUnit(rule.unit) ? rule.unit : "hours",
  value: rule.value,
  enabled: rule.enabled,
})

function toRules(event: CustomReminderEventWithRules): ReminderRuleInput[] {
  return event.reminderRules.filter(isActiveReminderRule).map((rule) => ({
    id: rule.id,
    unit: rule.unit,
    value: rule.value,
    enabled: rule.enabled,
    displayOrder: rule.displayOrder,
  }))
}

async function buildState(
  db: Db,
  event: CustomReminderEventWithRules,
  now: Date,
): Promise<EventReminderRulesState> {
  const rules = toRules(event)
  const occurrences = await loadCustomReminderOccurrences(db, event.id)
  // The preview is the one evaluator, only its loading window differs from the cron's: no
  // `maxHours + 24` work horizon, so a 2 h reminder for next month's registration is still shown.
  const groups = await loadCustomReminderGroups(db, event, rules, now, occurrences, { preview: true })
  const organizationBlockedReason = await organizationSendingVerdict(event.organizationId, undefined, db)
  const preview = nextEventReminderPreview({
    rules,
    groups,
    now,
    occurrences,
    eventRemindersEnabled: event.remindersEnabled,
    eventPublished: event.publicStatus === "published",
    organizationBlockedReason,
  })
  return {
    mode: eventUsesCustomReminderRules(rules) ? "custom" : "default",
    rules: event.reminderRules.filter(isActiveReminderRule).map(view),
    preview: reminderPreviewView(preview),
  }
}

/** The event's current rules and next send; null when it is not in this organisation. */
export async function loadEventReminderRulesState(
  db: Db,
  organizationId: string,
  eventId: string,
  now: Date,
): Promise<EventReminderRulesState | null> {
  const event = await db.event.findFirst({
    where: { id: eventId, organizationId },
    select: customReminderEventWithRulesSelect,
  })
  if (!event) return null
  return buildState(db, event, now)
}

/**
 * Cancels unsent occurrences (and their pending outbox rows) of one or more rules. A `sending`
 * row is left alone: the delivery re-reads the occurrence/rule and cancels it itself.
 */
async function cancelUnsentOccurrences(
  tx: Db,
  occurrences: readonly { id: string; outboxId: string | null; status: string }[],
  reason: string,
): Promise<void> {
  const unsent = occurrences.filter((occurrence) => occurrence.status === "pending" || occurrence.status === "queued")
  if (unsent.length === 0) return
  const outboxIds = unsent.map((occurrence) => occurrence.outboxId).filter((id): id is string => !!id)
  if (outboxIds.length > 0) {
    await tx.notificationOutbox.updateMany({
      where: { id: { in: outboxIds }, status: "pending" },
      data: { status: "cancelled", lastError: reason, claimedAt: null, deliveryNotBefore: null },
    })
  }
  await tx.reminderOccurrence.updateMany({
    where: { id: { in: unsent.map((occurrence) => occurrence.id) }, status: { in: ["pending", "queued"] } },
    data: { status: "cancelled", lastError: reason },
  })
}

/**
 * Saves the event's rules (#1139): validates, checks every client id belongs to this event,
 * diffs kept/created/removed rules, then reconciles the unsent occurrences in the same
 * transaction under the event's advisory lock. `mode: "default"` deletes every row, which makes
 * the legacy D-2 / D-1 / day-of path apply again.
 */
export async function saveEventReminderRules(
  db: Db,
  organizationId: string,
  eventId: string,
  input: ReminderRulesInput,
  now: Date = new Date(),
): Promise<SaveEventReminderRulesResult> {
  const exists = await db.event.findFirst({ where: { id: eventId, organizationId }, select: { id: true } })
  if (!exists) return { ok: false, status: 404, error: "Non trouvé" }

  return db.$transaction(async (tx: Db): Promise<SaveEventReminderRulesResult> => {
    // First statement of the transaction: every writer of this event's rules takes the same
    // advisory lock, so the reads and writes below are serialised with the cron and other saves.
    await lockReminderRules(tx, eventId)
    const event: CustomReminderEventWithRules | null = await tx.event.findFirst({
      where: { id: eventId, organizationId },
      select: customReminderEventWithRulesSelect,
    })
    if (!event) return { ok: false, status: 404, error: "Non trouvé" }

    const before = toRules(event)
    const validation = validateReminderRulesInput(input)
    if (!validation.ok) {
      return {
        ok: false,
        status: 400,
        error: validation.error,
        ...(validation.rule ? { rule: validation.rule } : {}),
        ...(validation.positions ? { positions: validation.positions } : {}),
      }
    }

    const existing = new Map(before.map((rule) => [rule.id, rule]))
    if (validation.mode === "custom") {
      const seen = new Set<string>()
      for (const [index, rule] of validation.rules.entries()) {
        if (!rule.id) continue
        if (seen.has(rule.id)) {
          return { ok: false, status: 400, error: `Rappel ${index + 1} : ce rappel figure deux fois.`, rule: index + 1 }
        }
        seen.add(rule.id)
        if (!existing.has(rule.id)) {
          return { ok: false, status: 400, error: `Rappel ${index + 1} : ce rappel n'appartient pas à cet événement.`, rule: index + 1 }
        }
      }
    }

    const archivedRows = event.reminderRules.filter((rule) => !isActiveReminderRule(rule))
    const archivedById = new Set(archivedRows.map((rule) => rule.id))
    const afterInput: ValidReminderRule[] = validation.mode === "default"
      ? []
      : validation.rules.map((rule) => ({ ...rule, id: rule.id }))
    const byHours = (rules: readonly ReminderRuleInput[]): Map<number, ReminderRuleInput> => {
      const map = new Map<number, ReminderRuleInput>()
      for (const rule of rules) {
        const hours = reminderRuleHours(rule)
        if (hours !== null && !map.has(hours)) map.set(hours, rule)
      }
      return map
    }
    // A new row with the delay of a row removed in this same save keeps that row (and its sent
    // occurrences); otherwise it revives an archived row of the same delay. Creating a fresh id
    // would forget who was already reminded and send the reminder again.
    const activeRemovedByHours = byHours(before.filter((rule) => !afterInput.some((candidate) => candidate.id === rule.id)))
    const archivedByHours = byHours(archivedRows)
    const after: ValidReminderRule[] = afterInput.map((rule) => {
      if (rule.id) return rule
      const hours = reminderRuleHours(rule)
      if (hours === null) return rule
      const activeMatch = activeRemovedByHours.get(hours)
      if (activeMatch) {
        activeRemovedByHours.delete(hours)
        return { ...rule, id: activeMatch.id }
      }
      const archivedMatch = archivedByHours.get(hours)
      if (archivedMatch) {
        archivedByHours.delete(hours)
        return { ...rule, id: archivedMatch.id }
      }
      return rule
    })
    const afterById = new Map(after.filter((rule) => rule.id).map((rule) => [rule.id, rule]))
    const kept = after.filter((rule) => rule.id && existing.has(rule.id))
    const keptIds = new Set(kept.map((rule) => rule.id))
    const removed = before.filter((rule) => !keptIds.has(rule.id))
    const removedIds = new Set(removed.map((rule) => rule.id))
    const revived = after.filter((rule) => rule.id && archivedById.has(rule.id))
    const created = after.filter((rule) => !rule.id)
    const disabledIds = new Set(after.filter((rule) => rule.id && !rule.enabled).map((rule) => rule.id))
    const delayChangedIds = new Set(
      kept.filter((rule) => {
        const previous = existing.get(rule.id)!
        return previous.unit !== rule.unit || previous.value !== rule.value
      }).map((rule) => rule.id),
    )

    const occurrences: { id: string; eventId: string; volunteerId: string; localDay: string; ruleId: string; status: string; outboxId: string | null }[] = await loadCustomReminderOccurrences(tx, eventId)

    // A removed rule's occurrence cascades away with it: cancel its pending outbox row first, or
    // the email would leave for a rule that no longer exists.
    await cancelUnsentOccurrences(
      tx,
      occurrences.filter((occurrence) => removedIds.has(occurrence.ruleId)),
      "Rappel supprimé.",
    )
    // A disabled rule keeps its rows (re-enabling resumes from the current registrations) but
    // nothing queued or pending may leave with the old timing.
    await cancelUnsentOccurrences(
      tx,
      occurrences.filter((occurrence) => disabledIds.has(occurrence.ruleId)),
      "Rappel désactivé.",
    )

    // A kept rule whose delay changed: recompute every unsent occurrence from the current
    // registrations with the same `reminderRuleStatus` the cron uses, and cancel what is already
    // too late (started shift, late sign-up). Sent and failed ones are never reopened.
    if (delayChangedIds.size > 0) {
      const loaderRules: ReminderRuleInput[] = after.map((rule) => ({ ...rule, displayOrder: rule.displayOrder }))
      const groups = await loadCustomReminderGroups(tx, event, loaderRules, now, occurrences, { allShifts: true })
      const groupKey = (occurrence: { eventId: string; volunteerId: string; localDay: string }) =>
        [occurrence.eventId, occurrence.volunteerId, occurrence.localDay].join("\u0000")
      const groupByKey = new Map(groups.map((group) => [groupKey(group), group]))
      for (const occurrence of occurrences) {
        if (occurrence.status !== "pending" && occurrence.status !== "queued") continue
        if (!delayChangedIds.has(occurrence.ruleId)) continue
        const rule = afterById.get(occurrence.ruleId)
        if (!rule) continue
        const group = groupByKey.get(groupKey(occurrence))
        if (!group) {
          await cancelUnsentOccurrences(tx, [occurrence], "Plus aucune inscription confirmée ce jour-là.")
          continue
        }
        const evaluation = reminderRuleStatus(group, rule, now)
        if (evaluation.status === "started") {
          await cancelUnsentOccurrences(tx, [occurrence], "Le créneau a commencé.")
          continue
        }
        if (evaluation.status === "late") {
          await cancelUnsentOccurrences(tx, [occurrence], "Inscription confirmée après l'heure du rappel.")
          continue
        }
        if (evaluation.status === "disabled" || !evaluation.dueAt) {
          await cancelUnsentOccurrences(tx, [occurrence], "Rappel désactivé.")
          continue
        }
        await tx.reminderOccurrence.update({
          where: { id: occurrence.id },
          data: { dueAt: evaluation.dueAt },
        })
        if (occurrence.status === "queued" && occurrence.outboxId) {
          const row = await tx.notificationOutbox.findUnique({
            where: { id: occurrence.outboxId },
            select: { status: true, deliveryNotBefore: true },
          })
          if (row?.status === "pending") {
            await tx.notificationOutbox.updateMany({
              where: { id: occurrence.outboxId, status: "pending" },
              data: { nextAttemptAt: nextReminderAttemptAt(evaluation.dueAt, row.deliveryNotBefore) },
            })
          }
        }
      }
    }

    // Keep, revive, create and remove rows. `displayOrder` follows the screen order.
    for (const rule of kept) {
      await tx.eventReminderRule.update({
        where: { id: rule.id },
        data: { unit: rule.unit, value: rule.value, enabled: rule.enabled, displayOrder: rule.displayOrder },
      })
    }
    for (const rule of revived) {
      await tx.eventReminderRule.update({
        where: { id: rule.id },
        data: {
          unit: rule.unit, value: rule.value, enabled: rule.enabled, displayOrder: rule.displayOrder,
          archivedAt: null,
        },
      })
    }
    for (const rule of created) {
      await tx.eventReminderRule.create({
        data: { eventId, unit: rule.unit, value: rule.value, enabled: rule.enabled, displayOrder: rule.displayOrder },
      })
    }
    if (removed.length > 0) {
      // A removed rule with at least one sent occurrence is archived, not deleted: recreating the
      // same delay later must keep protecting the volunteers already reminded. A rule without
      // sent history is deleted as before.
      const sent = await tx.reminderOccurrence.groupBy({
        by: ["ruleId"],
        where: { ruleId: { in: [...removedIds] }, status: "sent" },
        _count: { _all: true },
      })
      const withSent = new Set<string>(sent.map((row: { ruleId: string }) => row.ruleId))
      const toArchive = removed.filter((rule) => withSent.has(rule.id))
      const toDelete = removed.filter((rule) => !withSent.has(rule.id))
      if (toArchive.length > 0) {
        await tx.eventReminderRule.updateMany({
          where: { id: { in: toArchive.map((rule) => rule.id) }, eventId },
          data: { archivedAt: now, enabled: false },
        })
      }
      if (toDelete.length > 0) {
        await tx.eventReminderRule.deleteMany({ where: { id: { in: toDelete.map((rule) => rule.id) }, eventId } })
      }
    }

    const state = await loadEventReminderRulesState(tx, organizationId, eventId, now)
    if (!state) return { ok: false, status: 404, error: "Non trouvé" }
    const changes = reminderRulesChange(
      { mode: eventUsesCustomReminderRules(before) ? "custom" : "default", rules: before },
      { mode: validation.mode, rules: after },
    )
    return { ok: true, state, changes }
  }, { maxWait: 10_000, timeout: 20_000 })
}
