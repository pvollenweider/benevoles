// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

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
