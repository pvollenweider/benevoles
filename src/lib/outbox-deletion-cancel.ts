// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Cancels pending outbox rows addressed to a member being permanently deleted (#667), the same
 * situation and the same matching rule as a merge's absorbed record (src/lib/outbox-merge-cancel.ts,
 * #600): NotificationOutbox carries no `volunteerId` column, so a deletion can't cascade into it
 * at the database level the way it does MemberInvite/QuestionAnswer/PushSubscription/
 * DeliveryOutcome/DuplicateDismissal. Cancelling a still-pending row instead stops an email that
 * would otherwise go out to a member record that no longer exists once this transaction commits.
 *
 * Reuses the merge module's matching rule (`matchesAbsorbedRecipient`) as is — "the recipient
 * this row was sealed for" is the same question whether the member was absorbed or deleted — with
 * its own reason constant, so a cancelled-for-deletion row reads correctly in the outbox view.
 */

import { openPayload } from "./notifications/outbox"
import { matchesAbsorbedRecipient, type AbsorbedMemberIdentity, type OutboxMergeCancelDb } from "./outbox-merge-cancel"
import type { NotificationPayload } from "./notifications/types"

import { MEMBER_DELETED_CANCEL_REASON } from "./outbox-member-deleted-reason"

export { MEMBER_DELETED_CANCEL_REASON }

export type DeletedMemberIdentity = AbsorbedMemberIdentity
export type OutboxDeletionCancelDb = OutboxMergeCancelDb

/**
 * Cancels pending outbox rows addressed to the member about to be deleted, returns their ids.
 * Safe to call more than once (a row already cancelled is no longer "pending").
 */
export async function cancelOutboxForDeletedMember(db: OutboxDeletionCancelDb, organizationId: string, member: DeletedMemberIdentity): Promise<string[]> {
  const candidates = await db.notificationOutbox.findMany({ where: { organizationId, status: "pending" }, select: { id: true, payload: true } })
  const toCancel: string[] = []
  for (const row of candidates) {
    let payload: NotificationPayload
    try {
      payload = openPayload(row.payload)
    } catch {
      continue // key rotated away since this row was sealed: never touched here, the cron's own retry path handles it
    }
    if (matchesAbsorbedRecipient(payload, member)) toCancel.push(row.id)
  }
  if (toCancel.length > 0) {
    await db.notificationOutbox.updateMany({ where: { id: { in: toCancel } }, data: { status: "cancelled", lastError: MEMBER_DELETED_CANCEL_REASON } })
  }
  return toCancel
}
