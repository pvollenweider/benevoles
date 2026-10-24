// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Reasons an email still in the outbox is cancelled right before it leaves because its recipient
 * or its link is no longer the right one (src/lib/outbox-recipient-check.ts). Their own module,
 * like the merge and deletion reasons, so the delivery page can word them without importing the
 * outbox.
 *
 * MEMBER_ADDRESS_CHANGED_REASON: any email to a member whose address changed since it was queued
 * (#1105 for invitations and manual reminders, now every member email): never sent to the old
 * address, never redirected to the new one.
 */
export const MEMBER_ADDRESS_CHANGED_REASON = "member_address_changed"

/**
 * An account email (password reset, account activation, reactivation) whose link was replaced or
 * revoked since it was queued (a newer request, a password change, an address change): the link
 * would not work, and the address may no longer be the account's.
 */
export const ACCOUNT_LINK_REVOKED_REASON = "account_link_revoked"

/**
 * An email with a personal link but no member id whose link no longer exists (renewed after an
 * address correction, a merge, an erasure): it can't be tied to a member any more, and its link
 * would not work.
 */
export const PERSONAL_LINK_REVOKED_REASON = "personal_link_revoked"

/** A sector leader email whose leader was removed, or whose link or address changed, since it was queued. */
export const LEADER_LINK_REVOKED_REASON = "leader_link_revoked"

const norm = (email: string | null | undefined) => (email ?? "").trim().toLowerCase()

/** True when the queued address is no longer the member's (or the member is gone). */
export function memberAddressChanged(queuedEmail: string | null | undefined, member: { email: string | null } | null): boolean {
  if (!member) return true
  return norm(member.email) !== norm(queuedEmail)
}
