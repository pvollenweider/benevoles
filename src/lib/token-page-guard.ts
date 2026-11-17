// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { headers } from "next/headers"
import type { ClientHeaders, RateLimitStore } from "./rate-limit"
import { recordTokenMiss, tokenLookupsBlocked, type TokenFamily } from "./token-rate-limit"

/**
 * Failed-lookup accounting for the pages a personal link opens (the sign-up confirmation, the
 * waitlist offer, « Je ne peux pas »), the same as their JSON APIs (src/lib/token-rate-limit.ts):
 * a connection that used up its unknown links is answered « Réessaie dans une heure » before anything
 * is looked up, valid link or not, so the block tells nothing about the link; an unknown link
 * counts one miss. A valid link never counts.
 *
 * The pages call it from their `cache()` loader, shared by `generateMetadata` and the page: one
 * decision and at most one miss per page view.
 */

export type GuardedLookup<T> = { blocked: true } | { blocked: false; value: T }

export async function guardTokenLookup<T>(
  client: ClientHeaders,
  lookup: () => Promise<T>,
  isUnknown: (value: T) => boolean,
  options: { family?: TokenFamily; using?: RateLimitStore } = {},
): Promise<GuardedLookup<T>> {
  const family = options.family ?? "personal"
  if (await tokenLookupsBlocked(client, options.using, family)) return { blocked: true }
  const value = await lookup()
  if (isUnknown(value)) await recordTokenMiss(client, options.using, family)
  return { blocked: false, value }
}

/** The current request's headers, for getClientIp, in a server component. */
export async function pageClient(): Promise<ClientHeaders> {
  return { headers: await headers() }
}
