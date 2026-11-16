// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { createHash } from "crypto"
import { isRateLimited, releaseHit, reserveHit, type RateLimitStore } from "./rate-limit"

export const ACTIVATION_WINDOW_MS = 60 * 60 * 1000
/** Activations from one address per hour: room for an office or a club activating several accounts. */
export const ACTIVATION_MAX_PER_IP = 20
/** Attempts on one invitation link per hour, whatever the address: a link is used once, this leaves room for retries. */
export const ACTIVATION_MAX_PER_TOKEN = 5

/**
 * Key for one invitation link in the limiter, never the link's token itself, nor the hash stored
 * on the account (`setupTokenHash`): a separate, shortened digest, so the RateLimit table holds
 * nothing that identifies or rebuilds a link.
 */
export function activationTokenDigest(token: string): string {
  return createHash("sha256").update(`accept-invite-budget:${token}`, "utf8").digest("hex").slice(0, 32)
}

/**
 * Budget for the activation POST of an invitation link, checked before the password is hashed.
 * Each attempt is counted before the work, so parallel requests can't all pass a check made
 * before any of them is recorded: past the budget, the extra ones are refused and their
 * reservation given back. Keys are per address and per link only, so someone without a valid
 * link can only use up their own address's budget, never block activations for others.
 * Every attempt stays counted, successful or not: a link is used once.
 */
export async function activationAllowed(ip: string, token: string, using?: RateLimitStore): Promise<boolean> {
  const digest = activationTokenDigest(token)
  const ipKey = `accept-invite-ip:${ip}`
  const tokenKey = `accept-invite-token:${digest}`
  // Already used up: refused without counting, so retries while blocked don't extend the block.
  const [ipFull, tokenFull] = await Promise.all([
    isRateLimited(ip, "accept-invite-ip", ACTIVATION_MAX_PER_IP, using),
    isRateLimited(digest, "accept-invite-token", ACTIVATION_MAX_PER_TOKEN, using),
  ])
  if (ipFull || tokenFull) return false
  const [byIp, byToken] = await Promise.all([
    reserveHit(ipKey, ACTIVATION_WINDOW_MS, using),
    reserveHit(tokenKey, ACTIVATION_WINDOW_MS, using),
  ])
  if ((byIp && byIp.count > ACTIVATION_MAX_PER_IP) || (byToken && byToken.count > ACTIVATION_MAX_PER_TOKEN)) {
    await Promise.all([releaseHit(ipKey, using), releaseHit(tokenKey, using)])
    return false
  }
  return true
}
