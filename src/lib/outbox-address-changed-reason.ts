// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import type { NotificationKind } from "./notifications/types"

/**
 * An invitation or a manual reminder still in the outbox (held by a sending limit) whose member's
 * address changed since it was queued (#1105): cancelled at delivery instead of sending a personal
 * link to the old address. Its own module, like the merge and deletion reasons, so the delivery
 * page can word it without importing the outbox.
 */
export const MEMBER_ADDRESS_CHANGED_REASON = "member_address_changed"

/** Kinds checked against the member's current address right before they leave. */
export const MEMBER_ADDRESS_CHECKED_KINDS: readonly NotificationKind[] = ["member_invite", "manual_reminder"]

const norm = (email: string | null | undefined) => (email ?? "").trim().toLowerCase()

/** True when the queued address is no longer the member's (or the member is gone). */
export function memberAddressChanged(queuedEmail: string | null | undefined, member: { email: string | null } | null): boolean {
  if (!member) return true
  return norm(member.email) !== norm(queuedEmail)
}
