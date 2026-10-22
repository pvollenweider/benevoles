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
 * address, now confirmed by the activation, for an organization that has never had one. Organisers
 * never set it. `editedInSettings` says whether an owner has ever changed the reply-to in the email
 * settings (every such change is logged since the setting exists, #381): a null value after an edit
 * was cleared on purpose and stays null. The caller also writes only while the value is still
 * null, so an address an owner set is never overwritten.
 */
export function replyToOnActivation(
  role: string | null | undefined,
  email: string | null | undefined,
  editedInSettings: boolean,
): string | null {
  if (!isOwnerRole(role) || editedInSettings) return null
  return initialReplyToEmail(email)
}
