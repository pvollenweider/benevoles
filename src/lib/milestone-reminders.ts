// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Reminder to a milestone's owner (#985), run by the hourly reminders cron: one email per
 * milestone, from MILESTONE_REMINDER_DAYS before its due day (in the organisation's zone) until
 * the day itself, if it is not done. Sent once: `ownerRemindedAt` is set in the same transaction
 * as the outbox row, and the row's dedupe key (milestone, owner, due day) makes a second enqueue a
 * no-op. A new owner or due date clears `ownerRemindedAt` (PATCH route), so they get their own.
 *
 * Not for an archived event, a done milestone, or an owner whose account is deactivated. The
 * outbox delivers it (the cron calls deliverOutbox right after), so a failed send is retried.
 */
import { prisma } from "./prisma"
import { enqueueNotifications } from "./notifications/outbox"
import { orgTimeZone } from "./time-zone"
import { daysUntilDue, MILESTONE_REMINDER_DAYS, milestoneReminderDue } from "./milestones"

const DAY_MS = 86_400_000

export async function sendMilestoneOwnerReminders(now: Date = new Date()): Promise<{ eligible: number; enqueued: number }> {
  // A wide read (due days around the window in any zone), narrowed per organisation zone below.
  const candidates = await prisma.eventMilestone.findMany({
    where: {
      done: false,
      ownerRemindedAt: null,
      ownerId: { not: null },
      owner: { isActive: true },
      dueDate: { gte: new Date(now.getTime() - 2 * DAY_MS), lte: new Date(now.getTime() + (MILESTONE_REMINDER_DAYS + 2) * DAY_MS) },
      event: { publicStatus: { not: "archived" } },
    },
    include: {
      owner: { select: { id: true, name: true, email: true, organizationId: true } },
      event: { select: { id: true, title: true, organizationId: true, organization: { select: { timeZone: true } } } },
    },
  })

  const due = candidates.filter((m) =>
    // The owner must still belong to the event's organisation (it always does: the API checks it).
    m.owner && m.owner.organizationId === m.event.organizationId
    && milestoneReminderDue(m, now, orgTimeZone(m.event.organization)),
  )

  let enqueued = 0
  for (const m of due) {
    const owner = m.owner!
    const timeZone = orgTimeZone(m.event.organization)
    const dueDay = m.dueDate.toISOString().slice(0, 10)
    await prisma.$transaction(async (tx) => {
      // Conditional: a concurrent run, or an edit since the read, leaves nothing to do.
      const { count } = await tx.eventMilestone.updateMany({
        where: { id: m.id, ownerRemindedAt: null, ownerId: owner.id, dueDate: m.dueDate, done: false },
        data: { ownerRemindedAt: now },
      })
      if (count === 0) return
      await enqueueNotifications([{
        kind: "milestone_owner_reminder",
        recipient: { email: owner.email, name: owner.name },
        organizationId: m.event.organizationId,
        dedupeKey: `milestone_owner_reminder:${m.id}:${owner.id}:${dueDay}`,
        data: {
          ownerName: owner.name,
          eventId: m.event.id,
          eventTitle: m.event.title,
          milestoneTitle: m.title,
          // The due day as picked: stored at midnight UTC.
          dueDateLabel: m.dueDate.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }),
          daysLeft: daysUntilDue(m.dueDate, now, timeZone),
        },
      }], tx, { organizationId: m.event.organizationId })
      enqueued++
    })
  }
  return { eligible: due.length, enqueued }
}
