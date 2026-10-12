// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { prisma } from "@/lib/prisma"
import { openPayload, sealPayload } from "./outbox"
import type { NotificationKind, Recipient } from "./types"

/**
 * One email for several events of the same kind, to the same person, about the same subject
 * (#869): each new item joins the pending, never-tried outbox row of its group and pushes it back
 * by `delayMs`; otherwise it starts one. The 5-minute outbox cron sends it once nobody added to it
 * for that long. The payload's `data.items` holds every item, oldest first; `data` the rest.
 */
export async function queueDigestItem<Item>(input: {
  kind: NotificationKind
  /** Same group, same email: e.g. kind + event + recipient address. */
  groupKey: string
  recipient: Recipient
  organizationId: string | null
  base: Record<string, unknown>
  item: Item
  /** Stable per item: repeated while its email is pending (retry, double click), it is added once.
   * Once that email is sent, callers guarantee one run per item (the withdrawal's conditional update). */
  itemKey: string
  now: Date
  delayMs: number
}): Promise<void> {
  const sendAt = new Date(input.now.getTime() + input.delayMs)
  const prefix = `${input.groupKey}:`
  await prisma.$transaction(async (tx) => {
    // Two items of one group at the same moment must find each other's row, not start two.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${input.groupKey}))`
    const pending = await tx.notificationOutbox.findFirst({
      where: { status: "pending", attempts: 0, dedupeKey: { startsWith: prefix } },
      select: { id: true, payload: true },
    })
    if (pending) {
      const previous = openPayload(pending.payload).data as { items?: { key: string; value: Item }[] }
      const items = previous.items ?? []
      if (items.some((i) => i.key === input.itemKey)) return
      await tx.notificationOutbox.update({
        where: { id: pending.id },
        data: {
          payload: sealPayload({ kind: input.kind, recipient: input.recipient, organizationId: input.organizationId, data: { ...input.base, items: [...items, { key: input.itemKey, value: input.item }] } }),
          nextAttemptAt: sendAt,
        },
      })
      return
    }
    // An item already sent in an earlier email keeps its key: queued again, it is skipped.
    await tx.notificationOutbox.createMany({
      data: [{
        payload: sealPayload({ kind: input.kind, recipient: input.recipient, organizationId: input.organizationId, data: { ...input.base, items: [{ key: input.itemKey, value: input.item }] } }),
        dedupeKey: `${prefix}${input.itemKey}`,
        organizationId: input.organizationId,
        nextAttemptAt: sendAt,
      }],
      skipDuplicates: true,
    })
  })
}
