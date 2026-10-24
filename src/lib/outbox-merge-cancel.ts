// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Cancels pending outbox rows addressed to a member absorbed by a merge (#600, owner decision):
 * `NotificationOutbox` carries no `volunteerId` column (the inventory table in #600 notes it has
 * no foreign key to Volunteer at all — only the sealed `payload` does, see
 * src/lib/notifications/outbox.ts), so a merge can't reassign these rows the way it reassigns
 * Registration/MemberInvite/QuestionAnswer. Cancelling them instead stops an email that would
 * otherwise go out to whichever address the organizer just confirmed was wrong.
 *
 * Only `status: "pending"` rows are touched — never `"sending"` (a delivery may be mid-flight
 * right now: claiming it here would race `deliverOutbox`'s own conditional update and could
 * silently drop a send that already left for the SMTP server) nor `"sent"`/`"failed"` (nothing to
 * cancel). Matching prefers the #598 `volunteerId` carried in the payload when the row has one
 * (set for every notification tied to a member since #598); only rows without it fall back to a
 * normalized email match, so a row that happens to share the old address with someone else but
 * was never tied to this member isn't touched by mistake.
 */

import { openPayload } from "./notifications/outbox"
import { normalizeEmail } from "./email-address"
import type { NotificationPayload } from "./notifications/types"
import { MERGED_MEMBER_CANCEL_REASON } from "./outbox-merge-cancel-reason"

export { MERGED_MEMBER_CANCEL_REASON }

export type AbsorbedMemberIdentity = { volunteerId: string; email: string | null }

/** Pure matching rule, unit-tested on its own (src/lib/__tests__/outbox-merge-cancel.test.ts). */
export function matchesAbsorbedRecipient(payload: Pick<NotificationPayload, "volunteerId" | "recipient">, absorbed: AbsorbedMemberIdentity): boolean {
  if (payload.volunteerId) return payload.volunteerId === absorbed.volunteerId
  const email = payload.recipient?.email?.trim()
  if (!email || !absorbed.email) return false
  return normalizeEmail(email) === normalizeEmail(absorbed.email)
}

/** The slice of the Prisma (or transaction) client this needs — see LinkRegenerationDb for the
 * same narrow, duck-typed pattern. NotificationOutbox isn't a tenant model of the org-scoped
 * client (no `organizationId` filter applied automatically): the caller's `organizationId` is
 * written into the query explicitly, same as src/lib/outbox-data.ts. */
export interface OutboxMergeCancelDb {
  notificationOutbox: {
    findMany(args: { where: { organizationId: string; status: "pending" }; select: { id: true; payload: true } }): Promise<{ id: string; payload: unknown }[]>
    updateMany(args: { where: { id: { in: string[] } }; data: { status: "cancelled"; lastError: string } }): Promise<{ count: number }>
  }
}

/**
 * Cancels pending outbox rows addressed to the absorbed member, returns their ids. Safe to call
 * more than once for the same merge (a row already cancelled is no longer `"pending"`, so a
 * second call simply finds nothing left to touch).
 */
export async function cancelOutboxForMergedMember(db: OutboxMergeCancelDb, organizationId: string, absorbed: AbsorbedMemberIdentity): Promise<string[]> {
  const candidates = await db.notificationOutbox.findMany({ where: { organizationId, status: "pending" }, select: { id: true, payload: true } })
  const toCancel: string[] = []
  for (const row of candidates) {
    let payload: NotificationPayload
    try {
      payload = openPayload(row.payload)
    } catch {
      continue // key rotated away since this row was sealed: never touched here, the cron's own retry path handles it
    }
    if (matchesAbsorbedRecipient(payload, absorbed)) toCancel.push(row.id)
  }
  if (toCancel.length > 0) {
    await db.notificationOutbox.updateMany({ where: { id: { in: toCancel } }, data: { status: "cancelled", lastError: MERGED_MEMBER_CANCEL_REASON } })
  }
  return toCancel
}
