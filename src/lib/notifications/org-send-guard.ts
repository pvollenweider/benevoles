// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { ORG_INACTIVE_REASON } from "@/lib/outbox-org-cancel-reason"
import { prisma } from "@/lib/prisma"

export { ORG_INACTIVE_REASON }

/**
 * No email or push for an organisation that is deactivated or no longer exists (#814). Checked
 * right before each actual send (sendNotification, sendPushToVolunteer), not when the message is
 * queued: an organisation deactivated after its emails were queued, or while the outbox is going
 * through a batch, sends nothing more from that moment on.
 *
 * NotificationOutbox.organizationId is not a foreign key: rows of a deleted organisation stay in
 * the queue, so a missing organisation blocks like a deactivated one. A message without an
 * organisation (platform emails: product updates, release check, super admin) is not concerned.
 */

/** The decision, from what the database says about the organisation (`null`: not found). */
export function sendingBlocked(organizationId: string | null | undefined, org: { active: boolean } | null): boolean {
  if (!organizationId) return false
  return !org || !org.active
}

type OrgReader = { organization: { findUnique(args: { where: { id: string }; select: { active: true } }): Promise<{ active: boolean } | null> } }

/** Reads the organisation now and applies `sendingBlocked`. */
export async function organizationBlocksSending(organizationId: string | null | undefined, db: OrgReader = prisma): Promise<boolean> {
  if (!organizationId) return false
  const org = await db.organization.findUnique({ where: { id: organizationId }, select: { active: true } })
  return sendingBlocked(organizationId, org)
}

type OutboxCanceller = {
  notificationOutbox: {
    updateMany(args: { where: { organizationId: string; status: "pending" }; data: { status: "cancelled"; lastError: string; claimedAt: null } }): Promise<{ count: number }>
  }
}

/**
 * At deactivation, in the same transaction: every email of the organisation still waiting
 * (first try or retry) is cancelled, so a later reactivation never sends it. A row being sent at
 * that very moment (« sending ») is stopped by the send-time check instead.
 */
export async function cancelPendingOutboxForOrganization(db: OutboxCanceller, organizationId: string): Promise<number> {
  const { count } = await db.notificationOutbox.updateMany({
    where: { organizationId, status: "pending" },
    data: { status: "cancelled", lastError: ORG_INACTIVE_REASON, claimedAt: null },
  })
  return count
}
