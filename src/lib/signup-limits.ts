// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Length limits of the public sign-up form (#1047), shared by the API schema and the form's
 * inputs. Far above normal use: they only stop a request from storing kilobytes of text that
 * organisers then see in their lists and CSV exports.
 */

import { MEMBER_PHONE_MAX } from "./text-limits"
import { hashToken } from "./token-hash"

/** Same limit as a member's phone in the admin (api/admin/members). */
export const SIGNUP_PHONE_MAX = MEMBER_PHONE_MAX
export const SIGNUP_COMMENT_MAX = 2000
/** Database ids (cuid) are 25 characters; tokens and codes have their own limits in the schema. */
export const SIGNUP_ID_MAX = 100
/** Shifts picked in one submission. */
export const SIGNUP_SHIFTS_MAX = 1000

/**
 * Requests without proof of the address, on an event that confirms sign-ups by email (#1253), per
 * event, address and connection: one address's mailbox must not be flooded with confirmation
 * emails. Counted per connection so that a stranger who knows an address only uses up their own
 * budget and never keeps the address's owner from signing up from another connection. What caps
 * the mailbox from many connections is the per-recipient cap at delivery (`PUBLIC_TRIGGERED` in
 * src/lib/notifications/send-limits.ts), and each request replaces the address's pending one.
 */
export const SIGNUP_ADDRESS_LIMIT = { max: 5, windowMs: 60 * 60 * 1000 } as const

/** The rate-limit key of that limit: a hash, never the address or the connection in the RateLimit table. */
export function signupAddressLimitKey(eventId: string, email: string, clientIp: string): string {
  return hashToken(JSON.stringify([eventId, email, clientIp])).slice(0, 32)
}

/**
 * A phone or comment over its limit, in words the volunteer can act on. A phone saved before the
 * limit existed can be longer and comes back pre-filled (remembered contact, personal page,
 * invite): `maxLength` doesn't cut a value set by the page, so the form and the API both say which
 * field to shorten instead of a generic refusal.
 */
export function tooLongSignupField(form: { phone?: unknown; comment?: unknown }): { field: "phone" | "comment"; message: string } | null {
  if (typeof form.phone === "string" && form.phone.length > SIGNUP_PHONE_MAX) {
    return { field: "phone", message: `Le téléphone ne peut pas dépasser ${SIGNUP_PHONE_MAX} caractères. Raccourcis-le, puis confirme à nouveau.` }
  }
  if (typeof form.comment === "string" && form.comment.length > SIGNUP_COMMENT_MAX) {
    return { field: "comment", message: `Le commentaire ne peut pas dépasser ${SIGNUP_COMMENT_MAX} caractères. Raccourcis-le, puis confirme à nouveau.` }
  }
  return null
}
