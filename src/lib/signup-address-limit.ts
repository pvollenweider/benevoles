// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { hashToken } from "./token-hash"

/**
 * The rate-limit key of SIGNUP_ADDRESS_LIMIT (src/lib/signup-limits.ts): a hash of the event, the
 * address and the connection, never the address or the connection in the RateLimit table. JSON
 * keeps the three parts apart whatever characters they hold (an IPv6 address has colons).
 *
 * Server only: it uses Node's crypto through token-hash. Kept out of signup-limits.ts, which the
 * public page loads in the browser.
 */
export function signupAddressLimitKey(eventId: string, email: string, clientIp: string): string {
  return hashToken(JSON.stringify([eventId, email, clientIp])).slice(0, 32)
}
