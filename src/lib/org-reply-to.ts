// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { isOwnerRole } from "./permissions"

/**
 * Reply-to address of a new organization (#1067): its first administrator's email, so volunteers'
 * replies reach a person from day one. Set at creation only; existing organizations keep theirs,
 * and the owner can change or clear it in the email settings. Normalized like the settings form
 * (trimmed, lower case, 200 characters at most); null when there is nothing usable to set.
 */
export function initialReplyToEmail(adminEmail: string | null | undefined): string | null {
  const email = adminEmail?.trim().toLowerCase() ?? ""
  if (!email || email.length > 200 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null
  return email
}

/**
 * Reply-to address offered when an administrator activates their account (#1077): an owner's
 * address, now confirmed by the activation, for an organization that still has none. Organisers
 * never set it. The caller writes it only while the organization's reply-to is still null, so a
 * value an owner set is never overwritten. A value an owner cleared is null too and can be filled
 * by a later owner's activation; activation happens once per account, so that stays rare.
 */
export function replyToOnActivation(role: string | null | undefined, email: string | null | undefined): string | null {
  return isOwnerRole(role) ? initialReplyToEmail(email) : null
}
