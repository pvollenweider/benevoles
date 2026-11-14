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
  reminderRuleDueAt,
  reminderRuleHours,
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
  cancelled: number
  /** Another run already claimed or sent it. */
  handled: number
  failed: number
}

const EMPTY_RUN: CustomReminderRun = { events: 0, rules: 0, eligible: 0, queued: 0, deferred: 0, cancelled: 0, handled: 0, failed: 0 }

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
    } else if (row.status === "cancelled" || row.status === "failed") {
      const { count } = await prisma.reminderOccurrence.updateMany({
        where: { id: occurrence.id, status: "queued" },
        data: { status: "cancelled", lastError: row.lastError ?? (row.status === "failed" ? "Envoi en échec." : "Envoi annulé.") },
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

  const events = await prisma.event.findMany({
    where: { publicStatus: "published", remindersEnabled: true, reminderRules: { some: {} } },
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
    const registrations = await prisma.registration.findMany({
      where: { eventId: event.id, status: "active", shift: { status: { not: "cancelled" } } },
      include: customReminderRegistrationInclude,
    })
    const groups = groupRemindersByDay(
      registrations as (typeof registrations[number] & GroupableRegistration)[],
      () => timeZone,
    )
    const occurrences = await prisma.reminderOccurrence.findMany({
      where: { eventId: event.id },
      select: { eventId: true, volunteerId: true, localDay: true, ruleId: true, status: true },
    })
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
          if (occurrence.status === "sent" || occurrence.status === "queued") return "handled" as const
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
          if (!group.registrations.some((r) => r.createdAt.getTime() <= dueAt.getTime())) {
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
