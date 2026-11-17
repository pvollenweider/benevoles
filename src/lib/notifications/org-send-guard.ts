// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { ORG_INACTIVE_REASON } from "@/lib/outbox-org-cancel-reason"
import { ORG_PENDING_REASON } from "@/lib/outbox-org-pending-reason"
import { awaitsAutoApprovalReview } from "@/lib/auto-approval"
import { canEmailThirdParties, pendingRecipientAllowed, signupOwnerEmails } from "@/lib/org-approval"
import { prisma } from "@/lib/prisma"
import { ORG_ACCOUNT_ROLE_WHERE } from "../permissions"

export { ORG_INACTIVE_REASON, ORG_PENDING_REASON }

/**
 * No email or push for an organisation that is deactivated or no longer exists (#814). Checked
 * right before each actual send (sendNotification, sendPushToVolunteer), not when the message is
 * queued: an organisation deactivated after its emails were queued, or while the outbox is going
 * through a batch, sends nothing more from that moment on.
 *
 * NotificationOutbox.organizationId is not a foreign key: rows of a deleted organisation stay in
 * the queue, so a missing organisation blocks like a deactivated one. A message without an
 * organisation (platform emails: product updates, release check, super admin) is not concerned.
 *
 * An organisation awaiting validation (#810, src/lib/org-approval.ts) may only email its own
 * **active** owner account created with it by the sign-up confirmation (address proved by the
 * emailed confirmation link, `signupOwnerEmails`): anything else is refused the same way, and it
 * sends no push at all. Inactive accounts (an invitation not yet accepted) do not count: otherwise
 * inviting any address as an organiser would let a pending organisation email it. An account
 * activated from an invitation does not count either (#1045): that link used to be shown to the
 * owner who issued it, so activating it never proved access to the address.
 */

type OrgSendState = {
  active: boolean
  outboundEmailApprovedAt: Date | string | null
  autoApprovedAt?: Date | string | null
  autoApprovalReviewedAt?: Date | string | null
  createdAt?: Date | string
  admins?: { email: string; createdAt: Date | string }[]
}

/** The decision, from what the database says about the organisation (`null`: not found). */
export function sendingBlocked(organizationId: string | null | undefined, org: { active: boolean } | null): boolean {
  if (!organizationId) return false
  return !org || !org.active
}

/**
 * Why an email may not go, or null: deactivated or missing organisation first, then a pending
 * one writing to someone other than its administrators. `recipientEmail` undefined = a push.
 */
export function sendingVerdict(organizationId: string | null | undefined, org: OrgSendState | null, recipientEmail?: string | null): string | null {
  if (!organizationId) return null
  if (sendingBlocked(organizationId, org)) return ORG_INACTIVE_REASON
  if (canEmailThirdParties(org!)) return null
  const confirmed = org!.createdAt ? signupOwnerEmails(org!.createdAt, org!.admins ?? []) : []
  return pendingRecipientAllowed(recipientEmail, confirmed) ? null : ORG_PENDING_REASON
}

type OrgReader = {
  organization: {
    findUnique(args: { where: { id: string }; select: { active: true; outboundEmailApprovedAt: true; autoApprovedAt: true; autoApprovalReviewedAt: true; createdAt: true; admins: { where: { isActive: true; role: { in: string[] } }; select: { email: true; createdAt: true } } } }): Promise<OrgSendState | null>
  }
}

/**
 * What sendNotification needs to know about the organisation, from the one read it makes per
 * email: why the email may not go (`sendingVerdict`), and whether the space was validated
 * automatically and is not yet reviewed (`awaitsAutoApprovalReview`), which lowers its daily bulk
 * cap (src/lib/notifications/send-limits.ts). Read at every send, never cached: the operator's
 * review applies to the next email on every replica.
 */
export type OrgSendingState = { refused: string | null; unreviewedAutoApproval: boolean }

export async function organizationSendingState(organizationId: string | null | undefined, recipientEmail?: string | null, db: OrgReader = prisma): Promise<OrgSendingState> {
  if (!organizationId) return { refused: null, unreviewedAutoApproval: false }
  const org = await db.organization.findUnique({
    where: { id: organizationId },
    select: { active: true, outboundEmailApprovedAt: true, autoApprovedAt: true, autoApprovalReviewedAt: true, createdAt: true, admins: { where: { isActive: true, ...ORG_ACCOUNT_ROLE_WHERE }, select: { email: true, createdAt: true } } },
  })
  return { refused: sendingVerdict(organizationId, org, recipientEmail), unreviewedAutoApproval: !!org && awaitsAutoApprovalReview(org) }
}

/** Reads the organisation now and applies `sendingVerdict`. */
export async function organizationSendingVerdict(organizationId: string | null | undefined, recipientEmail?: string | null, db: OrgReader = prisma): Promise<string | null> {
  return (await organizationSendingState(organizationId, recipientEmail, db)).refused
}

/** For a push (no address): deactivated, missing or pending organisation all block. */
export async function organizationBlocksSending(organizationId: string | null | undefined, db: OrgReader = prisma): Promise<boolean> {
  return (await organizationSendingVerdict(organizationId, undefined, db)) !== null
}

type OutboxCanceller = {
  notificationOutbox: {
    updateMany(args: { where: { organizationId: string; status: "pending" }; data: { status: "cancelled"; lastError: string; claimedAt: null; deliveryNotBefore: null } }): Promise<{ count: number }>
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
    data: { status: "cancelled", lastError: ORG_INACTIVE_REASON, claimedAt: null, deliveryNotBefore: null },
  })
  return count
}
