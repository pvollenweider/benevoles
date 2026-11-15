// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Settings side of the per-event reminder rules (#1139): read the state the admin screen shows,
 * and save a new set of rules in one serialised transaction.
 *
 * The preview is built from the same loaders as the hourly cron (`loadCustomReminderGroups`,
 * `loadCustomReminderOccurrences` in `reminder-rules-server.ts`), so it cannot drift from what is
 * sent. Saving takes the event's advisory lock (`lockReminderRules`) before reading or writing:
 * two saves, or a save and the hourly run, cannot interleave. A rule's identity is its delay in
 * hours: a submitted delay resolves to the event's row of that delay (active or archived, revived)
 * or creates one, so changing a delay removes the old row and adds the new one. Unsent occurrences
 * and pending outbox rows of a removed or disabled delay are cancelled in the same transaction;
 * an occurrence already `sending` is left to record its own outcome and keeps its rule archived.
 */

import {
  eventUsesCustomReminderRules,
  isReminderRuleUnit,
  nextEventReminderPreview,
  reminderPreviewView,
  reminderRuleHours,
  reminderRulesChange,
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
 * Cancels unsent occurrences (and their pending outbox rows) of one or more rules. An occurrence
 * whose outbox row is `sending` is left alone: delivery already passed its last check, so the
 * completion or failure path records its outcome; a stalled claim later reclaimed by the outbox
 * sees the archived/disabled rule in `resolveCustomRuleReminder` and cancels the occurrence then.
 */
async function cancelUnsentOccurrences(
  tx: Db,
  occurrences: readonly { id: string; outboxId: string | null; status: string }[],
  sendingOutboxIds: ReadonlySet<string>,
  reason: string,
): Promise<void> {
  const unsent = occurrences.filter(
    (occurrence) =>
      (occurrence.status === "pending" || occurrence.status === "queued") &&
      (!occurrence.outboxId || !sendingOutboxIds.has(occurrence.outboxId)),
  )
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
 * Saves the event's rules (#1139): validates, checks every submitted id belongs to this event,
 * resolves each delay to the event's row of the same delay (active or archived) or creates one,
 * then cancels the unsent occurrences of every removed or disabled delay in the same transaction
 * under the event's advisory lock. `mode: "default"` removes every active row (archiving those
 * with sent history), which makes the legacy D-2 / D-1 / day-of path apply again.
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

    // A rule's identity is its delay in hours, not the id the client sent (#1139). The submitted
    // id is only checked to belong to this event; the row resolution below decides which row it is.
    if (validation.mode === "custom") {
      const eventRuleIds = new Set(event.reminderRules.map((row) => row.id))
      for (const [index, rule] of validation.rules.entries()) {
        if (rule.id && !eventRuleIds.has(rule.id)) {
          return { ok: false, status: 400, error: `Rappel ${index + 1} : ce rappel n'appartient pas à cet événement.`, rule: index + 1 }
        }
      }
    }

    // At most one row per (event, delay in hours), archived or not. Nothing has ever created a rule
    // in production (the setting ships with this PR), so no existing data breaks it and no data fix
    // is needed; every save takes the event's advisory lock, and this map is what maintains it.
    const rowsByHours = new Map<number, (typeof event.reminderRules)[number]>()
    for (const row of event.reminderRules) {
      const hours = reminderRuleHours(row)
      if (hours !== null && !rowsByHours.has(hours)) rowsByHours.set(hours, row)
    }
    const submitted = validation.mode === "custom" ? validation.rules : []
    // A submitted rule resolves to the event's row of the same delay, active or archived: it
    // revives and updates that row, or creates a new one. A row never changes its delay in hours.
    const after: ValidReminderRule[] = submitted.map((rule) => ({
      ...rule,
      id: rowsByHours.get(reminderRuleHours(rule)!)?.id ?? "",
    }))
    const resolvedIds = new Set(after.filter((rule) => rule.id).map((rule) => rule.id))
    // Changing a delay is therefore « remove the old delay, add the new one »: the old row is gone
    // from this list even when the client sent its id, and its unsent occurrences are cancelled.
    const removed = before.filter((rule) => !resolvedIds.has(rule.id))
    const removedIds = new Set(removed.map((rule) => rule.id))
    const resolved = after.filter((rule) => rule.id)
    const created = after.filter((rule) => !rule.id)
    const disabledIds = new Set(resolved.filter((rule) => !rule.enabled).map((rule) => rule.id))

    const occurrences: { id: string; eventId: string; volunteerId: string; localDay: string; ruleId: string; status: string; outboxId: string | null }[] = await loadCustomReminderOccurrences(tx, eventId)
    // An outbox row claimed (`sending`) is an email in flight: the save must neither cancel its
    // occurrence nor let the rule disappear under it. Only rows really in that state are skipped;
    // a stalled claim is later reclaimed and re-checked by `deliverOutbox`.
    const occurrenceOutboxIds = occurrences.map((occurrence) => occurrence.outboxId).filter((id): id is string => !!id)
    const inFlightRows: { id: string; status: string }[] = occurrenceOutboxIds.length > 0
      ? await tx.notificationOutbox.findMany({
          where: { id: { in: occurrenceOutboxIds } },
          select: { id: true, status: true },
        })
      : []
    const sendingOutboxIds = new Set<string>(
      inFlightRows.filter((row) => row.status === "sending").map((row) => row.id),
    )
    const sendingRuleIds = new Set<string>(
      occurrences
        .filter((occurrence) => occurrence.outboxId && sendingOutboxIds.has(occurrence.outboxId))
        .map((occurrence) => occurrence.ruleId),
    )

    // A removed rule's occurrence cascades away with it: cancel its pending outbox row first, or
    // the email would leave for a rule that no longer exists. An occurrence already `sending` is
    // kept so its delivery can still record a success.
    await cancelUnsentOccurrences(
      tx,
      occurrences.filter((occurrence) => removedIds.has(occurrence.ruleId)),
      sendingOutboxIds,
      "Rappel supprimé.",
    )
    // A disabled rule keeps its rows (re-enabling resumes from the current registrations) but
    // nothing queued or pending may leave with the old timing.
    await cancelUnsentOccurrences(
      tx,
      occurrences.filter((occurrence) => disabledIds.has(occurrence.ruleId)),
      sendingOutboxIds,
      "Rappel désactivé.",
    )

    // Resolve, revive and create rows. `displayOrder` follows the screen order; `archivedAt` is
    // cleared on a revived row so its sent occurrences protect the same delay again.
    for (const rule of resolved) {
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
      // A removed rule is archived, not deleted, when it has sent history or an email in flight:
      // recreating the same delay later must keep protecting volunteers already reminded. A rule
      // with neither is deleted as before.
      const sent = await tx.reminderOccurrence.groupBy({
        by: ["ruleId"],
        where: { ruleId: { in: [...removedIds] }, status: "sent" },
        _count: { _all: true },
      })
      const withSent = new Set<string>(sent.map((row: { ruleId: string }) => row.ruleId))
      const toArchive = removed.filter((rule) => withSent.has(rule.id) || sendingRuleIds.has(rule.id))
      const toDelete = removed.filter((rule) => !withSent.has(rule.id) && !sendingRuleIds.has(rule.id))
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
