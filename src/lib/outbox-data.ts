// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

// NotificationOutbox isn't a tenant model of the org-scoped client: the organization filter is
// written explicitly here and covered by the cross-tenant test.
import { prisma } from "./prisma"
import { openPayload } from "./notifications/outbox"
import { outboxCounts, outboxRowView, type OutboxRowView } from "./outbox-view"
import type { NotificationPayload } from "./notifications/types"
import { MERGED_MEMBER_CANCEL_REASON } from "./outbox-merge-cancel-reason"

/** Rows shown on the delivery page; sent rows only live until the nightly cleanup anyway. */
export const OUTBOX_PAGE_LIMIT = 200

/** The organization's recent notifications, newest first, with only recipient and kind opened. */
export async function loadOutbox(organizationId: string, limit: number = OUTBOX_PAGE_LIMIT) {
  const rows = await prisma.notificationOutbox.findMany({
    where: { organizationId },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: { id: true, status: true, attempts: true, nextAttemptAt: true, lastError: true, sentAt: true, createdAt: true, payload: true },
  })
  const views: OutboxRowView[] = rows.map(({ payload, ...row }) => {
    let opened: Pick<NotificationPayload, "kind" | "recipient"> | null = null
    try {
      const p = openPayload(payload)
      opened = { kind: p.kind, recipient: p.recipient }
    } catch {
      opened = null // key rotated away: the row still shows its state
    }
    return outboxRowView(row, opened)
  })
  return { rows: views, counts: outboxCounts(views), truncated: rows.length === limit }
}

/**
 * Puts a permanently failed notification back in the queue (#382). Returns false when the row
 * isn't this organization's or isn't failed: the same answer for both, nothing to learn. Also
 * refused for a row cancelled by a merge (#600, defence in depth under the UI's own `canRetry`):
 * its payload still carries the absorbed record's old address.
 */
export async function retryOutboxRow(id: string, organizationId: string): Promise<boolean> {
  const { count } = await prisma.notificationOutbox.updateMany({
    where: { id, organizationId, status: "failed", NOT: { lastError: MERGED_MEMBER_CANCEL_REASON } },
    data: { status: "pending", attempts: 0, nextAttemptAt: new Date(), claimedAt: null },
  })
  return count === 1
}
