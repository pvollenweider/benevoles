// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { z } from "zod"

/**
 * Email addresses are compared and stored normalized (#310): trimmed and lower-cased, so
 * `Alice@Example.com` and `alice@example.com` are the same volunteer / admin. (The local part
 * is case-sensitive in theory; in practice every provider ignores case.)
 */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

/**
 * One address, normalized then checked with the rule of the forms and API routes
 * (`z.string().trim().toLowerCase().email()`), capped at 200 characters like the personal-link
 * request. A list (`a@x.org, b@y.org`), a line break or a space inside the value is refused.
 */
export const emailAddressSchema = z.string().trim().toLowerCase().email().max(200)

export function isValidEmailAddress(value: string): boolean {
  return emailAddressSchema.safeParse(value).success
}

/**
 * A `mailto:` link to one stored address, or null when the value is not a single valid address
 * (an older import could hold a list): the page then shows the text without a link. The address
 * is percent-encoded, `@` kept as is (RFC 6068), so nothing in it can add a header or a recipient.
 */
export function mailtoHref(email: string | null | undefined): string | null {
  const parsed = emailAddressSchema.safeParse(email ?? "")
  if (!parsed.success) return null
  return `mailto:${encodeURIComponent(parsed.data).replace(/%40/g, "@")}`
}
