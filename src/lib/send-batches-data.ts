// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { Prisma } from "@/generated/prisma/client"
import { prisma } from "./prisma"
import { batchDelivery, batchDeliveryLabel, heldSentence, sendBatchKindLabel, type BatchDelivery } from "./send-batches"

/** How many batches a list shows at most (the Communication tab says so when it is reached). */
export const SEND_BATCH_LIST_LIMIT = 50

export type SendBatchView = {
  id: string
  kind: string
  kindLabel: string
  eventId: string
  eventTitle: string
  createdAt: Date
  /** Who sent it (who scheduled it, for a scheduled message), read now: a removed account says so. */
  actorLabel: string
  delivery: BatchDelivery
  /** « 118 envoyés, 1 en échec, 2 en attente ». */
  deliveryLabel: string
  /** The sentence when a sending limit delayed part of it, or null. */
  heldSentence: string | null
  /** The message history row (#467) for a message kind, while it exists. */
  targetedMessageId: string | null
  /** Failed emails of the batch still in the outbox: « Emails envoyés » can show them (30 days). */
  failedInOutbox: number
  /** Any email of the batch still in the outbox, whatever its state. */
  inOutbox: number
}

const actorLabelOf = (actorId: string | null, names: Map<string, string>) =>
  actorId ? (names.get(actorId) ?? "Un organisateur (compte supprimé)") : "Un organisateur"

/**
 * The batches of one organisation (#1101), newest first: of one event, or the given ids (the
 * activity log's page). Counters and live rows are read in one repeatable-read transaction, so a
 * nightly purge running meanwhile cannot count a row twice or not at all.
 */
export async function loadSendBatches(
  organizationId: string,
  opts: { eventId?: string; ids?: string[]; since?: Date; limit?: number } = {},
): Promise<SendBatchView[]> {
  if (opts.ids && opts.ids.length === 0) return []
  const { batches, rows } = await prisma.$transaction(async (tx) => {
    const batches = await tx.sendBatch.findMany({
      where: {
        organizationId,
        ...(opts.eventId ? { eventId: opts.eventId } : {}),
        ...(opts.ids ? { id: { in: opts.ids } } : {}),
        ...(opts.since ? { createdAt: { gte: opts.since } } : {}),
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: opts.limit ?? SEND_BATCH_LIST_LIMIT,
      select: {
        id: true, kind: true, eventId: true, actorId: true, createdAt: true, recipientCount: true,
        sentCount: true, heldSentCount: true, failedCount: true, cancelledCount: true, maxHeldWaitSec: true,
        targetedMessageId: true, event: { select: { title: true } },
      },
    })
    const rows = batches.length === 0 ? [] : await tx.notificationOutbox.findMany({
      where: { organizationId, sendBatchId: { in: batches.map((b) => b.id) } },
      select: { sendBatchId: true, status: true, lastHeldAt: true, firstHeldAt: true, sentAt: true },
    })
    return { batches, rows }
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead })
  if (batches.length === 0) return []

  const actorIds = [...new Set(batches.map((b) => b.actorId).filter((id): id is string => !!id))]
  const admins = actorIds.length ? await prisma.adminUser.findMany({ where: { id: { in: actorIds } }, select: { id: true, name: true } }) : []
  const names = new Map(admins.map((a) => [a.id, a.name]))
  const byBatch = new Map<string, typeof rows>()
  for (const r of rows) {
    const list = byBatch.get(r.sendBatchId!) ?? []
    list.push(r)
    byBatch.set(r.sendBatchId!, list)
  }

  return batches.map((b) => {
    const live = byBatch.get(b.id) ?? []
    const delivery = batchDelivery(b.recipientCount, b, live)
    return {
      id: b.id,
      kind: b.kind,
      kindLabel: sendBatchKindLabel(b.kind),
      eventId: b.eventId,
      eventTitle: b.event.title,
      createdAt: b.createdAt,
      actorLabel: actorLabelOf(b.actorId, names),
      delivery,
      deliveryLabel: batchDeliveryLabel(delivery),
      heldSentence: heldSentence(delivery),
      targetedMessageId: b.targetedMessageId,
      failedInOutbox: live.filter((r) => r.status === "failed").length,
      inOutbox: live.length,
    }
  })
}
