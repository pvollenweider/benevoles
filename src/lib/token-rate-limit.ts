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
export const TOKEN_USE_LIMITS = { read: 60, withdraw: 30, availability: 30, answers: 30, roster: 60, calendar: 60, swaps: 60, swap: 30, limits: 30, availabilityLink: 60, availabilityAnswer: 30 } as const
export type TokenUse = keyof typeof TOKEN_USE_LIMITS

/**
 * Which secret the failed lookups were about, each counted on its own: "personal" for the personal
 * links (the page and its API, the one-off calendar file), "calendar" for the calendar
 * subscriptions (#961). Calendar servers fetch subscriptions from addresses shared by many people
 * (Google's fetchers): a stale subscription there must never lock a volunteer out of their own
 * page, nor the other way round. The same limit applies to both.
 */
export type TokenFamily = "personal" | "calendar" | "availability"
const MISS_ROUTES: Record<TokenFamily, string> = { personal: "reg-token-miss", calendar: "reg-feed-miss", availability: "avail-token-miss" }

/** Seconds to tell a blocked client to wait (Retry-After). */
export const TOKEN_MISS_RETRY_AFTER = HOUR / 1000

/** Whether this client has used up its failed lookups; does not count. */
export async function tokenLookupsBlocked(req: Request, using?: RateLimitStore, family: TokenFamily = "personal"): Promise<boolean> {
  return isRateLimited(getClientIp(req), MISS_ROUTES[family], TOKEN_MISS_LIMIT, using)
}

/** Counts one failed lookup for this client. */
export async function recordTokenMiss(req: Request, using?: RateLimitStore, family: TokenFamily = "personal"): Promise<void> {
  await rateLimit(getClientIp(req), MISS_ROUTES[family], TOKEN_MISS_LIMIT, HOUR, using)
}

/** Counts one use of a valid link; false once that link has used up its limit for `use`. */
export async function tokenUseAllowed(token: string, use: TokenUse, using?: RateLimitStore): Promise<boolean> {
  return (await rateLimit(hashToken(token), `reg-token-${use}-link`, TOKEN_USE_LIMITS[use], HOUR, using)).ok
}
