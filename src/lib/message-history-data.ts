// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import type { OrgScopedPrisma } from "./prisma-org"
import { prisma } from "./prisma"
import { deliveryOf, pushLabel, type Delivery } from "./message-history"

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
}

/**
 * The targeted messages of one event (#467), newest first, with their delivery. The messages are
 * read through the organisation-scoped client; the outbox rows by message id and organisation.
 */
export async function loadMessageHistory(db: OrgScopedPrisma, organizationId: string, eventId: string): Promise<MessageHistoryItem[]> {
  const messages = await db.targetedMessage.findMany({
    where: { eventId },
    orderBy: { createdAt: "desc" },
    select: { id: true, createdAt: true, authorName: true, subject: true, message: true, audienceLabel: true, recipientCount: true, sentCount: true, failedCount: true, pushRequested: true, pushDevices: true, pushSent: true, pushFailed: true },
  })
  if (messages.length === 0) return []
  const rows = await prisma.notificationOutbox.findMany({
    where: { organizationId, targetedMessageId: { in: messages.map((m) => m.id) } },
    select: { targetedMessageId: true, status: true },
  })
  return messages.map(({ sentCount, failedCount, pushRequested, pushDevices, pushSent, pushFailed, ...m }) => ({
    ...m,
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
