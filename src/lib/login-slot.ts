// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { prisma } from "./prisma"
import { reportError } from "./report-error"

/**
 * One password check at a time per account once it has failed too often (src/lib/admin-session.ts,
 * loginDelayMs). The account-wide wait used to be a sleep inside each request, so attempts sent at
 * the same moment all slept side by side and were checked together. Now each attempt has to claim
 * the account's slot: the time from which its password may be checked. Only one attempt can hold
 * a slot that is still ahead; an attempt that arrives while it is held is refused without checking
 * its password, and does not move the slot (so nobody can push the owner's next try further away).
 *
 * The slot is a row of the RateLimit table (key `login-slot:<normalized email>`, `resetAt` = when
 * the claimed check may run), written with one atomic statement on the database clock, so every
 * app replica agrees. Expired rows go with the cleanup cron like any other RateLimit row. The key
 * is the address typed in the form, whether or not an account has it: an unknown address behaves
 * exactly like a known one.
 */
export type LoginSlotStore = {
  /**
   * Claims the slot of `key` for a check `delayMs` from now, unless another attempt holds one
   * still ahead. Returns how long to wait before checking the password, or null if refused.
   */
  claim(key: string, delayMs: number): Promise<number | null>
}

export const postgresLoginSlots: LoginSlotStore = {
  async claim(key, delayMs) {
    // Claimable when no slot is ahead (resetAt <= now()): the new slot is now() + delayMs.
    const rows = await prisma.$queryRaw<{ waitMs: number }[]>`
      INSERT INTO "RateLimit" ("key", "count", "resetAt")
      VALUES (${key}, 1, now() + ${delayMs}::integer * interval '1 millisecond')
      ON CONFLICT ("key") DO UPDATE SET
        "count"   = "RateLimit"."count" + 1,
        "resetAt" = EXCLUDED."resetAt"
      WHERE "RateLimit"."resetAt" <= now()
      RETURNING GREATEST(0, EXTRACT(EPOCH FROM ("resetAt" - now())) * 1000)::float8 AS "waitMs"`
    return rows.length > 0 ? rows[0].waitMs : null
  },
}

/** Same rules in this process only, for unit tests (no database). */
export function memoryLoginSlots(now: () => number = Date.now): LoginSlotStore {
  const slots = new Map<string, number>()
  return {
    async claim(key, delayMs) {
      const t = now()
      const held = slots.get(key)
      if (held !== undefined && held > t) return null
      slots.set(key, t + delayMs)
      return delayMs
    },
  }
}

const store: LoginSlotStore = process.env.NODE_ENV === "test" ? memoryLoginSlots() : postgresLoginSlots

/**
 * The wait before this attempt may check its password, or null when another attempt on the same
 * account holds the slot. A store failure lets the attempt through after its wait (reported), like
 * the other login budgets: a rate limit must never be the reason nobody can sign in.
 */
export async function claimLoginSlot(account: string, delayMs: number, using: LoginSlotStore = store): Promise<number | null> {
  try {
    return await using.claim(`login-slot:${account}`, delayMs)
  } catch (e) {
    reportError("login_slot.claim")(e)
    return delayMs
  }
}
