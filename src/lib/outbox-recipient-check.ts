// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { prisma } from "./prisma"
import { hashToken } from "./token-hash"
import type { NotificationPayload } from "./notifications/types"
import {
  ACCOUNT_LINK_REVOKED_REASON,
  AVAILABILITY_LINK_REVOKED_REASON,
  LEADER_LINK_REVOKED_REASON,
  MEMBER_ADDRESS_CHANGED_REASON,
  PERSONAL_LINK_REVOKED_REASON,
  memberAddressChanged,
} from "./outbox-address-changed-reason"

/**
 * Last check of an outbox email right before it leaves (deliverOutbox): is its recipient still the
 * right person for what it carries? An email waits in the queue for a few seconds, ten minutes for
 * a grouped one, hours when a sending limit holds it; meanwhile an organiser may correct a
 * member's address, an administrator may change their password or address, a sector leader may be
 * removed. Returns the cancellation reason, or null when the email may go. A cancelled email is
 * never redirected to the new address: the action that changed things sends what is needed.
 *
 * Inventory of the kinds (src/lib/notifications/types.ts) and what checks them here:
 * - Every email to a member (the payload's `volunteerId`, #598: confirmations, reminders, waitlist,
 *   invitations, removals, restorations, targeted messages, open shifts, lost-link re-sends…): the
 *   member's current address must be the recipient. They carry a personal link, an invitation
 *   link or the member's shifts.
 * - A payload with a personal link (`data.editToken`) but no `volunteerId`: the link must still
 *   exist and its member have the recipient's address (previews are rendered, never queued).
 * - Sector leader emails (`sector_leader_*`, `data.token`): the leader must still exist, with
 *   this link and this address. They carry the role's roster link and volunteers' names.
 * - Availability requests (`availability_request`, #1146, `data.token`): the request must still hold
 *   this link (renewed on an address change, revoked when collection is turned off), then the
 *   member's address is checked as for every member email.
 * - Account emails with a single-use link (password_reset, admin_invite, signup_account_link,
 *   org_reactivation): the link must still be the account's current one, for this address.
 * - Inactivity messages: their own check (inactivityCopyBlocked in outbox.ts).
 * - Organiser-facing emails (admin_notification, registration_cancelled, digests, answers_changed,
 *   addresses_to_verify_summary, milestone_owner_reminder, past_event_notice), platform emails
 *   (product_update, release_available, operator_alert, space_approved, signup_confirmation,
 *   admin_welcome): no personal link of a member; not checked here.
 */
export async function outboxRecipientVerdict(payload: NotificationPayload): Promise<string | null> {
  const recipient = payload.recipient?.email ?? null
  const data = (payload.data ?? {}) as Record<string, unknown>

  if (payload.kind === "availability_request") {
    const live = typeof data.token === "string" && data.token
      ? await prisma.availabilityRequest.findUnique({ where: { tokenHash: hashToken(data.token) }, select: { id: true } })
      : null
    if (!live) return AVAILABILITY_LINK_REVOKED_REASON
  }

  if (payload.volunteerId) {
    const member = await prisma.volunteer.findUnique({ where: { id: payload.volunteerId }, select: { email: true } })
    return memberAddressChanged(recipient, member) ? MEMBER_ADDRESS_CHANGED_REASON : null
  }

  if (typeof data.editToken === "string" && data.editToken) {
    const reg = await prisma.registration.findUnique({
      where: { editTokenHash: hashToken(data.editToken) },
      select: { volunteer: { select: { email: true } } },
    })
    if (!reg) return PERSONAL_LINK_REVOKED_REASON
    return memberAddressChanged(recipient, reg.volunteer) ? MEMBER_ADDRESS_CHANGED_REASON : null
  }

  if (payload.kind.startsWith("sector_leader_") && typeof data.token === "string" && data.token) {
    const leader = await prisma.sectorLeader.findUnique({ where: { tokenHash: hashToken(data.token) }, select: { email: true } })
    return memberAddressChanged(recipient, leader) ? LEADER_LINK_REVOKED_REASON : null
  }

  const account = accountLink(payload)
  if (account) {
    const hash = hashToken(account.token)
    const where = account.column === "passwordResetTokenHash" ? { passwordResetTokenHash: hash }
      : account.column === "setupTokenHash" ? { setupTokenHash: hash }
      : { orgReactivationTokenHash: hash }
    const admin = await prisma.adminUser.findUnique({ where, select: { email: true } })
    return memberAddressChanged(recipient, admin) ? ACCOUNT_LINK_REVOKED_REASON : null
  }

  return null
}

type AccountColumn = "passwordResetTokenHash" | "setupTokenHash" | "orgReactivationTokenHash"

/** The single-use account link an email carries: which AdminUser column holds its hash, and the token. */
export function accountLink(payload: Pick<NotificationPayload, "kind" | "data">): { column: AccountColumn; token: string } | null {
  const data = (payload.data ?? {}) as Record<string, unknown>
  const pick = (field: string, column: AccountColumn) => {
    const token = tokenFromUrl(data[field])
    return token ? { column, token } : null
  }
  switch (payload.kind) {
    case "password_reset": return pick("resetUrl", "passwordResetTokenHash")
    case "admin_invite":
    case "signup_account_link": return pick("inviteUrl", "setupTokenHash")
    case "org_reactivation": return pick("reactivateUrl", "orgReactivationTokenHash")
    default: return null
  }
}

/** The `token` query parameter of a link, or null. */
export function tokenFromUrl(url: unknown): string | null {
  if (typeof url !== "string") return null
  try {
    return new URL(url).searchParams.get("token") || null
  } catch {
    return null
  }
}
