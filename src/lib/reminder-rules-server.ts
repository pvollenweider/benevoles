// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Claim and queue the custom reminders of the events that have their own rules (#1139).
 *
 * Legacy events never enter this module: the cron route keeps its existing query and adds
 * `reminderRules: { none: {} }` to it, so an event without a row goes through the old code path
 * unchanged. Here, a unique `ReminderOccurrence` is created for (event, volunteer, local day,
 * rule), claimed with a conditional `updateMany`, and the outbox row is enqueued in the same
 * transaction: two concurrent cron runs can only queue once. The outbox re-reads everything
 * before delivery (`reminder-occurrence-delivery.ts`).
 */

import { prisma } from "@/lib/prisma"
import { groupRemindersByDay, type GroupableRegistration } from "./reminder-groups"
import { orgTimeZone } from "./time-zone"
import {
  eventUsesCustomReminderRules,
  HOURS_PER_DAY,
  nextReminderAttemptAt,
  reminderPlaceActiveAt,
  reminderRuleDueAt,
  reminderRuleHours,
  reminderShiftStart,
  REMINDER_RULE_BOUNDS,
  rescheduleQueuedOccurrences,
  triggeredCustomReminders,
  validateReminderRules,
} from "./reminder-rules"
import { enqueueNotifications } from "./notifications/outbox"
import { reportError } from "./report-error"
import {
  buildCustomReminderPayload,
  customReminderEventSelect,
  customReminderRegistrationInclude,
  type CustomReminderGroup,
} from "./reminder-occurrence-delivery"

export type CustomReminderRun = {
  events: number
  rules: number
  /** (group, rule) pairs the pure evaluator found due this run. */
  eligible: number
  queued: number
  /** Time moved later between the claim and the current registrations: left for a later run. */
  deferred: number
  /** Queued occurrences whose due instant moved with their shifts this run. */
  rescheduled: number
  cancelled: number
  /** Another run already claimed or sent it. */
  handled: number
  failed: number
}

const EMPTY_RUN: CustomReminderRun = { events: 0, rules: 0, eligible: 0, queued: 0, deferred: 0, rescheduled: 0, cancelled: 0, handled: 0, failed: 0 }

/** Statuses written by the outbox on a queued occurrence, folded back before each run. */
export async function reconcileCustomReminderOccurrences(): Promise<number> {
  const queued = await prisma.reminderOccurrence.findMany({
    where: { status: "queued" },
    select: { id: true, outboxId: true },
  })
  let changed = 0
  for (const occurrence of queued) {
    if (!occurrence.outboxId) {
      const { count } = await prisma.reminderOccurrence.updateMany({
        where: { id: occurrence.id, status: "queued" },
        data: { status: "cancelled", lastError: "Notification introuvable." },
      })
      changed += count
      continue
    }
    const row = await prisma.notificationOutbox.findUnique({
      where: { id: occurrence.outboxId },
      select: { status: true, sentAt: true, lastError: true },
    })
    if (!row) {
      const { count } = await prisma.reminderOccurrence.updateMany({
        where: { id: occurrence.id, status: "queued" },
        data: { status: "cancelled", lastError: "Notification introuvable." },
      })
      changed += count
    } else if (row.status === "sent") {
      const { count } = await prisma.reminderOccurrence.updateMany({
        where: { id: occurrence.id, status: "queued" },
        data: { status: "sent", sentAt: row.sentAt ?? new Date() },
      })
      changed += count
    } else if (row.status === "failed") {
      // A final delivery failure is terminal for that reminder (#1139): the occurrence moves to
      // "failed", which the hourly run never reopens. Reopening automatically was the bug: every
      // run saw a cancelled occurrence, recomputed it and queued a fresh row with zero attempts,
      // forever. Only a relevant state change (shift, rule, address) or an explicit retry may
      // reopen it; neither is built here, so the simplest safe rule is: never automatically.
      const { count } = await prisma.reminderOccurrence.updateMany({
        where: { id: occurrence.id, status: "queued" },
        data: { status: "failed", lastError: row.lastError ?? "Envoi en échec." },
      })
      changed += count
    } else if (row.status === "cancelled") {
      // A cancellation is recomputed from the current registrations: an emptied group, a stopped
      // rule/event or a shift that has started all stay harmless on the next run.
      const { count } = await prisma.reminderOccurrence.updateMany({
        where: { id: occurrence.id, status: "queued" },
        data: { status: "cancelled", lastError: row.lastError ?? "Envoi annulé." },
      })
      changed += count
    }
  }
  return changed
}

/**
 * Runs the custom-rule path only. The route calls it before the legacy windows, then delivers the
 * outbox once at the end as before.
 */
export async function queueCustomRuleReminders(now: Date): Promise<CustomReminderRun> {
  await reconcileCustomReminderOccurrences()
  const run: CustomReminderRun = { ...EMPTY_RUN }

  // Bound the hourly work (#1139): an event is worth loading only when one of its shifts can
  // still reach the largest allowed delay (14 days at most), or when an occurrence is already
  // queued/pending and must keep moving with its shift. Per-event delays narrow this further below.
  const workFloor = new Date(now.getTime() - 2 * 86_400_000)
  const workHorizon = new Date(now.getTime() + (REMINDER_RULE_BOUNDS.days.max * HOURS_PER_DAY + 24) * 3_600_000)
  const events = await prisma.event.findMany({
    where: {
      publicStatus: "published",
      remindersEnabled: true,
      reminderRules: { some: { enabled: true } },
      OR: [
        { reminderOccurrences: { some: { status: { in: ["queued", "pending"] } } } },
        { shifts: { some: { status: { not: "cancelled" }, date: { gte: workFloor, lte: workHorizon } } } },
      ],
    },
    select: {
      ...customReminderEventSelect,
      reminderRules: {
        orderBy: [{ displayOrder: "asc" }, { createdAt: "asc" }],
        select: { id: true, unit: true, value: true, enabled: true, displayOrder: true },
      },
    },
  })

  for (const event of events) {
    if (!eventUsesCustomReminderRules(event.reminderRules)) continue
    run.events++
    const rules = event.reminderRules.filter((rule) => rule.enabled)
    if (rules.length === 0) continue
    // Defensive: a row written outside the future admin API must not send a nonsensical delay.
    const validation = validateReminderRules(rules)
    if (!validation.ok) {
      reportError("reminders.custom.invalid_rule")(new Error(`Événement ${event.id} : ${validation.error}`))
      continue
    }
    run.rules += validation.rules.length

    const timeZone = orgTimeZone(event.organization)
    const occurrences = await prisma.reminderOccurrence.findMany({
      where: { eventId: event.id },
      select: { id: true, eventId: true, volunteerId: true, localDay: true, ruleId: true, dueAt: true, status: true, outboxId: true },
    })
    const hasOpenOccurrence = occurrences.some((occurrence) => occurrence.status === "queued" || occurrence.status === "pending")
    // Bound the hourly work (#1139): with no queued/pending occurrence to reconcile, only shifts
    // that can still reach the event's largest enabled delay matter; the stored local day can sit
    // up to a day away from the start instant, hence the day of slack on each side.
    const maxHours = Math.max(...validation.rules.map((rule) => reminderRuleHours(rule) ?? 0))
    const floor = new Date(now.getTime() - 2 * 86_400_000)
    const horizon = new Date(now.getTime() + (maxHours + 24) * 3_600_000)
    const registrations = await prisma.registration.findMany({
      where: {
        eventId: event.id,
        status: "active",
        shift: {
          status: { not: "cancelled" },
          ...(hasOpenOccurrence ? {} : { date: { gte: floor, lte: horizon } }),
        },
      },
      include: customReminderRegistrationInclude,
    })
    // Only places of shifts that have not started yet: a started shift is never reminded.
    const upcoming = registrations.filter((registration) => reminderShiftStart(registration.shift, timeZone).getTime() > now.getTime())
    const groups = groupRemindersByDay(
      upcoming as (typeof upcoming[number] & GroupableRegistration)[],
      () => timeZone,
    )
    // A queued occurrence is suppressed by the trigger evaluator; recompute its due instant from
    // the current registrations so a shift moved back earlier brings its outbox row forward.
    for (const change of rescheduleQueuedOccurrences(groups, validation.rules, occurrences)) {
      const occurrence = occurrences.find(
        (candidate) =>
          candidate.eventId === change.eventId &&
          candidate.volunteerId === change.volunteerId &&
          candidate.localDay === change.localDay &&
          candidate.ruleId === change.ruleId,
      )
      if (!occurrence || occurrence.status !== "queued") continue
      if (occurrence.dueAt.getTime() !== change.dueAt.getTime()) {
        await prisma.reminderOccurrence.update({ where: { id: occurrence.id }, data: { dueAt: change.dueAt } })
        run.rescheduled++
      }
      if (!occurrence.outboxId) continue
      const row = await prisma.notificationOutbox.findUnique({
        where: { id: occurrence.outboxId },
        select: { status: true, nextAttemptAt: true, deliveryNotBefore: true },
      })
      if (!row || row.status !== "pending") continue
      // Schedule against both deadlines: the reminder's new due instant and the delivery's own
      // retry/hold deadline. No `attempts` or `firstHeldAt` exclusion: a row that already attempted
      // or was held can still be brought forward to its constraint after a shift moves back earlier.
      const proposed = nextReminderAttemptAt(change.dueAt, row.deliveryNotBefore)
      if (proposed.getTime() >= row.nextAttemptAt.getTime()) continue
      // Atomic and conditional: concurrent runs can only move the delivery earlier, never back
      // later, and a hold written meanwhile (deliveryNotBefore now later) is never bypassed.
      await prisma.notificationOutbox.updateMany({
        where: {
          id: occurrence.outboxId,
          status: "pending",
          nextAttemptAt: { gt: proposed },
          OR: [{ deliveryNotBefore: null }, { deliveryNotBefore: { lte: proposed } }],
        },
        data: { nextAttemptAt: proposed },
      })
    }
    const triggers = triggeredCustomReminders(groups, validation.rules, now, occurrences)
    run.eligible += triggers.length

    for (const trigger of triggers) {
      try {
        const outcome = await prisma.$transaction(async (tx) => {
          const key = {
            eventId: trigger.group.eventId,
            volunteerId: trigger.group.volunteerId,
            localDay: trigger.group.localDay,
            ruleId: trigger.rule.id,
          }
          await tx.reminderOccurrence.createMany({
            data: [{ ...key, dueAt: trigger.dueAt, status: "pending" }],
            skipDuplicates: true,
          })
          const occurrence = await tx.reminderOccurrence.findUniqueOrThrow({
            where: { eventId_volunteerId_localDay_ruleId: key },
          })
          if (occurrence.status === "sent" || occurrence.status === "queued" || occurrence.status === "failed") return "handled" as const
          // A cancelled occurrence may be recomputed from the current registrations. Its old
          // outbox row kept the dedupe key; release it so the new claim can queue a fresh row
          // (the old row stays as history, never sent).
          if (occurrence.outboxId) {
            await tx.notificationOutbox.updateMany({
              where: { id: occurrence.outboxId, status: { in: ["cancelled", "failed"] } },
              data: { dedupeKey: null },
            })
          }
          const claimed = await tx.reminderOccurrence.updateMany({
            where: { id: occurrence.id, status: { in: ["pending", "cancelled"] } },
            data: { status: "queued", dueAt: trigger.dueAt, outboxId: null, sentAt: null, lastError: null },
          })
          if (claimed.count === 0) return "handled" as const

          const cancel = async (reason: string) => {
            await tx.reminderOccurrence.update({
              where: { id: occurrence.id },
              data: { status: "cancelled", outboxId: null, lastError: reason },
            })
            return "cancelled" as const
          }

          const freshEvent = await tx.event.findUnique({ where: { id: event.id }, select: customReminderEventSelect })
          if (!freshEvent || freshEvent.publicStatus !== "published" || !freshEvent.remindersEnabled) {
            return cancel("Rappels coupés pour cet événement.")
          }
          const freshRule = await tx.eventReminderRule.findUnique({ where: { id: trigger.rule.id } })
          if (!freshRule || !freshRule.enabled || freshRule.eventId !== freshEvent.id) {
            return cancel("Rappel désactivé pour cet événement.")
          }
          const freshRegistrations = await tx.registration.findMany({
            where: {
              eventId: freshEvent.id,
              volunteerId: trigger.group.volunteerId,
              status: "active",
              shift: { status: { not: "cancelled" } },
            },
            include: customReminderRegistrationInclude,
          })
          const freshZone = orgTimeZone(freshEvent.organization)
          const group = groupRemindersByDay(
            freshRegistrations as (typeof freshRegistrations[number] & GroupableRegistration)[],
            () => freshZone,
          ).find((g) => g.localDay === trigger.group.localDay) as CustomReminderGroup | undefined
          if (!group) return cancel("Plus aucune inscription confirmée ce jour-là.")
          if (group.earliestStart.getTime() <= now.getTime()) return cancel("Le créneau a commencé.")
          const hours = reminderRuleHours(freshRule)
          if (hours === null) return cancel("Délai de rappel invalide.")
          const dueAt = reminderRuleDueAt(group.earliestStart, hours)
          if (dueAt.getTime() > now.getTime()) {
            await tx.reminderOccurrence.update({
              where: { id: occurrence.id },
              data: { status: "pending", dueAt, outboxId: null, lastError: null },
            })
            return "deferred" as const
          }
          if (!group.registrations.some((r) => reminderPlaceActiveAt(r).getTime() <= dueAt.getTime())) {
            return cancel("Inscription confirmée après l'heure du rappel.")
          }
          const payload = buildCustomReminderPayload({
            occurrenceId: occurrence.id,
            rule: freshRule,
            event: freshEvent,
            group,
            now,
            timeZone: freshZone,
          })
          if (!payload.recipient.email?.trim()) return cancel("Aucune adresse email.")
          const ids = await enqueueNotifications([{ ...payload, dedupeKey: `reminder-rule:${occurrence.id}` }], tx)
          if (ids.length === 0) return cancel("Aucune adresse email.")
          await tx.reminderOccurrence.update({
            where: { id: occurrence.id },
            data: { status: "queued", outboxId: ids[0], dueAt, lastError: null },
          })
          return "queued" as const
        })
        run[outcome]++
      } catch (e) {
        run.failed++
        reportError("reminders.custom")(e)
      }
    }
  }
  return run
}
