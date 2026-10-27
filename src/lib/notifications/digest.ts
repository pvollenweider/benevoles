// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { prisma } from "@/lib/prisma"
import { openPayload, sealPayload } from "./outbox"
import type { NotificationKind, Recipient } from "./types"
export { digestDelayMs } from "./digest-items"

/** One line of a digest as stored: `mergeKey` only for items that merge (see `merge`). */
type DigestEntry<Item> = { key: string; value: Item; mergeKey?: string }

/**
 * One email for several events of the same kind, to the same person, about the same subject
 * (#869): each new item joins the pending, never-tried outbox row of its group and pushes it back
 * by `delayMs`; otherwise it starts one. The 5-minute outbox cron sends it once nobody added to it
 * for that long. The payload's `data.items` holds every item, oldest first; `data` the rest.
 */
/** Returns the row's id when it is already due (no delay), for an immediate delivery; null otherwise. */
export async function queueDigestItem<Item>(input: {
  kind: NotificationKind
  /** Same group, same email: e.g. kind + event + recipient address. */
  groupKey: string
  recipient: Recipient
  organizationId: string | null
  /** The member the email is for (#598), when it goes to a volunteer: the address check before
   * delivery (src/lib/outbox-recipient-check.ts) and the member cleanups read it off the payload. */
  volunteerId?: string | null
  base: Record<string, unknown>
  item: Item
  /** Stable per item: repeated while its email is pending (retry, double click), it is added once.
   * Once that email is sent, callers guarantee one run per item (the withdrawal's conditional update). */
  itemKey: string
  now: Date
  delayMs: number
  /**
   * Items that update an earlier one instead of adding a line (#984: a volunteer changing their
   * answers twice): while the email waits, the item with the same `key` is replaced by
   * `combine(earlier, new)`, or removed when that is null (and the email with it when it was the
   * only one). Without it, every item is a line of its own.
   */
  merge?: { key: string; combine: (previous: Item, next: Item) => Item | null }
}): Promise<string | null> {
  const sendAt = new Date(input.now.getTime() + input.delayMs)
  const due = input.delayMs <= 0
  const prefix = `${input.groupKey}:`
  const member = input.volunteerId ? { volunteerId: input.volunteerId } : {}
  return prisma.$transaction(async (tx) => {
    // Two items of one group at the same moment must find each other's row, not start two.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${input.groupKey}))`
    const pending = await tx.notificationOutbox.findFirst({
      where: { status: "pending", attempts: 0, dedupeKey: { startsWith: prefix } },
      select: { id: true, payload: true },
    })
    if (pending) {
      const previous = openPayload(pending.payload).data as { items?: DigestEntry<Item>[] }
      const items = previous.items ?? []
      if (items.some((i) => i.key === input.itemKey)) return due ? pending.id : null
      const merge = input.merge
      const earlier = merge ? items.findIndex((i) => i.mergeKey === merge.key) : -1
      let next: DigestEntry<Item>[]
      if (merge && earlier >= 0) {
        const combined = merge.combine(items[earlier].value, input.item)
        next = combined === null
          ? items.filter((_, i) => i !== earlier)
          : items.map((entry, i) => (i === earlier ? { ...entry, value: combined } : entry))
      } else {
        next = [...items, { key: input.itemKey, value: input.item, ...(merge ? { mergeKey: merge.key } : {}) }]
      }
      // Only while the row is still waiting: a delivery may claim it after the read above (the cron
      // does not take the group's lock), and then sends what it read. Claimed meanwhile, this item
      // starts a row of its own below rather than being written into an email already leaving.
      const stillPending = { id: pending.id, status: "pending", attempts: 0 }
      // Nothing left to say (a change undone before the email left): the email is dropped.
      if (next.length === 0) {
        const { count } = await tx.notificationOutbox.deleteMany({ where: stillPending })
        if (count > 0) return null
      } else {
        const { count } = await tx.notificationOutbox.updateMany({
          where: stillPending,
          data: {
            payload: sealPayload({ kind: input.kind, recipient: input.recipient, ...member, organizationId: input.organizationId, data: { ...input.base, items: next } }),
            nextAttemptAt: sendAt,
          },
        })
        if (count > 0) return due ? pending.id : null
      }
    }
    // An item already sent in an earlier email keeps its key: queued again, it is skipped.
    await tx.notificationOutbox.createMany({
      data: [{
        payload: sealPayload({ kind: input.kind, recipient: input.recipient, ...member, organizationId: input.organizationId, data: { ...input.base, items: [{ key: input.itemKey, value: input.item, ...(input.merge ? { mergeKey: input.merge.key } : {}) }] } }),
        dedupeKey: `${prefix}${input.itemKey}`,
        organizationId: input.organizationId,
        nextAttemptAt: sendAt,
      }],
      skipDuplicates: true,
    })
    if (!due) return null
    const row = await tx.notificationOutbox.findUnique({ where: { dedupeKey: `${prefix}${input.itemKey}` }, select: { id: true, status: true } })
    return row?.status === "pending" ? row.id : null
  })
}
