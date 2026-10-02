// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { getClientIp, isRateLimited, rateLimit, type RateLimitStore } from "./rate-limit"
import { hashToken } from "./token-hash"

/**
 * Rate limits of the personal-link API (/api/public/registrations/[token]) (#609).
 *
 * Only failed lookups count against the client IP: everyone behind one connection (a club, a
 * family, a venue's Wi-Fi) shares that IP, and normal use must not lock them out. A valid link is
 * limited on its own, keyed by the token's hash (never the token itself).
 *
 * An IP that used up its misses is refused even with a valid link: otherwise a blocked client
 * could still tell a valid token (200) from an invalid one (429), and the block would not slow a
 * scan at all.
 */

const HOUR = 60 * 60 * 1000

/** Failed lookups (unknown, cancelled or not withdrawable token) per IP per hour. */
export const TOKEN_MISS_LIMIT = 20

/** Requests per valid link per hour, by use. */
export const TOKEN_USE_LIMITS = { read: 60, withdraw: 30, availability: 30 } as const
export type TokenUse = keyof typeof TOKEN_USE_LIMITS

const MISS_ROUTE = "reg-token-miss"

/** Whether this client has used up its failed lookups; does not count. */
export async function tokenLookupsBlocked(req: Request, using?: RateLimitStore): Promise<boolean> {
  return isRateLimited(getClientIp(req), MISS_ROUTE, TOKEN_MISS_LIMIT, using)
}

/** Counts one failed lookup for this client. */
export async function recordTokenMiss(req: Request, using?: RateLimitStore): Promise<void> {
  await rateLimit(getClientIp(req), MISS_ROUTE, TOKEN_MISS_LIMIT, HOUR, using)
}

/** Counts one use of a valid link; false once that link has used up its limit for `use`. */
export async function tokenUseAllowed(token: string, use: TokenUse, using?: RateLimitStore): Promise<boolean> {
  return (await rateLimit(hashToken(token), `reg-token-${use}-link`, TOKEN_USE_LIMITS[use], HOUR, using)).ok
}
