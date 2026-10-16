// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import type { OrgScopedPrisma } from "./prisma-org"
import { prisma } from "./prisma"
import { deliveryOf, pushLabel, type Delivery } from "./message-history"
import { formatScheduledFor, scheduledStateLabel } from "./scheduled-message"

export type MessageHistoryItem = {
  id: string
  createdAt: Date
  authorName: string
  subject: string
  message: string
  audienceLabel: string
  recipientCount: number
  delivery: Delivery
  /** Push outcome (#468), null when none was asked. */
  push: string | null
  /** Failed emails still in the outbox, so resendable (the cleanup removes them after 30 days). */
  retryable: number
  /** When it was scheduled for (#1019), if it was sent by « Programmer l'envoi ». */
  scheduledFor: Date | null
}

/**
 * The targeted messages of one event (#467), newest first, with their delivery. The messages are
 * read through the organisation-scoped client; the outbox rows by message id and organisation.
 */
export async function loadMessageHistory(db: OrgScopedPrisma, organizationId: string, eventId: string): Promise<MessageHistoryItem[]> {
  const messages = await db.targetedMessage.findMany({
    where: { eventId },
    orderBy: { createdAt: "desc" },
    select: { id: true, createdAt: true, authorName: true, subject: true, message: true, audienceLabel: true, recipientCount: true, sentCount: true, failedCount: true, pushRequested: true, pushDevices: true, pushSent: true, pushFailed: true, scheduled: { select: { scheduledFor: true } } },
  })
  if (messages.length === 0) return []
  const rows = await prisma.notificationOutbox.findMany({
    where: { organizationId, targetedMessageId: { in: messages.map((m) => m.id) } },
    select: { targetedMessageId: true, status: true },
  })
  return messages.map(({ sentCount, failedCount, pushRequested, pushDevices, pushSent, pushFailed, scheduled, ...m }) => ({
    ...m,
    scheduledFor: scheduled?.scheduledFor ?? null,
    push: pushLabel({ pushRequested, pushDevices, pushSent, pushFailed }),
    delivery: deliveryOf({ sentCount, failedCount }, rows.filter((r) => r.targetedMessageId === m.id)),
    retryable: rows.filter((r) => r.targetedMessageId === m.id && r.status === "failed").length,
  }))
}

/**
 * Puts the failed emails of a message back in the queue; returns their ids. The status condition
 * is in the update itself, so two concurrent clicks can't re-queue the same row twice.
 */
export async function retryFailedOfMessage(targetedMessageId: string, organizationId: string): Promise<string[]> {
  const failed = await prisma.notificationOutbox.findMany({
    where: { targetedMessageId, organizationId, status: "failed" },
    select: { id: true },
  })
  const ids: string[] = []
  for (const { id } of failed) {
    const { count } = await prisma.notificationOutbox.updateMany({
      where: { id, status: "failed" },
      data: { status: "pending", attempts: 0, nextAttemptAt: new Date(), claimedAt: null },
    })
    if (count === 1) ids.push(id)
  }
  return ids
}

export type ScheduledMessageItem = {
  id: string
  subject: string
  message: string
  audienceLabel: string
  authorName: string
  scheduledFor: string
  /** « lundi 20 octobre à 18:00 », in the organisation's zone. */
  when: string
  /** Still cancellable: not claimed by the cron yet. */
  pending: boolean
  /** « Programmé, pas encore parti », « Annulé le … », « Non envoyé : … ». */
  state: string
}

/**
 * The scheduled messages of one event (#1019) not sent yet, then the cancelled or skipped ones;
 * a sent one is listed with the messages sent. Soonest first, then most recent first.
 */
export async function loadScheduledMessages(db: OrgScopedPrisma, eventId: string, timeZone: string, now: Date): Promise<ScheduledMessageItem[]> {
  const rows = await db.scheduledMessage.findMany({
    where: { eventId, status: { not: "sent" } },
    orderBy: { scheduledFor: "asc" },
    select: { id: true, subject: true, message: true, audienceLabel: true, authorName: true, scheduledFor: true, status: true, skipReason: true, cancelledAt: true, cancelledByName: true },
  })
  const fmt = (d: Date) => formatScheduledFor(d, timeZone, now)
  const isOpen = (r: { status: string }) => r.status === "scheduled" || r.status === "sending"
  return [...rows.filter(isOpen), ...rows.filter((r) => !isOpen(r)).reverse()].map((r) => ({
    id: r.id,
    subject: r.subject,
    message: r.message,
    audienceLabel: r.audienceLabel,
    authorName: r.authorName,
    scheduledFor: r.scheduledFor.toISOString(),
    when: fmt(r.scheduledFor),
    pending: r.status === "scheduled",
    state: scheduledStateLabel(r, fmt),
  }))
}
