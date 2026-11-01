// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { prisma } from "./prisma"
import { reportError } from "./report-error"

/**
 * Fixed-window rate limiter, shared by every app replica (#322).
 *
 * Counters live in Postgres (`RateLimit` table): one row per key, bumped with a single atomic
 * upsert that starts a new window once the previous one has expired. Times come from the
 * database clock, so pods with drifting clocks still agree on when a window ends. Expired rows
 * are pruned by the cleanup cron.
 *
 * Postgres rather than Redis: the volume is tiny (logins, sign-ups, token links), and it avoids
 * running and securing another service. Unit tests use the in-memory store (no database).
 *
 * If the store fails, the error is reported and, by default, the request is allowed: a quota must
 * never be the reason the app is down (and when Postgres is down, nothing else works anyway). The
 * limits that guard a secret (a password, an account recovery, a link token) or an anonymous
 * creation are the exception: they refuse while the store fails (FAIL_CLOSED_ROUTES).
 */

/** Hits in the key's current window, and the milliseconds left in it. */
export type WindowState = { count: number; msLeft: number }

export type RateLimitStore = {
  /** Counts one hit, starting a new window of `windowMs` if there's none or it has expired. */
  hit(key: string, windowMs: number): Promise<WindowState>
  /** The current window, without counting; null if none or expired. */
  peek(key: string): Promise<WindowState | null>
  /** Several current windows in one read: only the keys with a live window are in the map. */
  peekMany?(keys: string[]): Promise<Map<string, WindowState>>
  /**
   * Gives back one hit of the current window (never below zero), for a budget that reserves a hit
   * before the work and returns it when the outcome must not count (a successful login, #1048).
   */
  release?(key: string): Promise<void>
}

export const postgresStore: RateLimitStore = {
  async hit(key, windowMs) {
    const [row] = await prisma.$queryRaw<{ count: number; msLeft: number }[]>`
      INSERT INTO "RateLimit" ("key", "count", "resetAt")
      VALUES (${key}, 1, now() + ${windowMs}::integer * interval '1 millisecond')
      ON CONFLICT ("key") DO UPDATE SET
        "count"   = CASE WHEN "RateLimit"."resetAt" <= now() THEN 1 ELSE "RateLimit"."count" + 1 END,
        "resetAt" = CASE WHEN "RateLimit"."resetAt" <= now() THEN EXCLUDED."resetAt" ELSE "RateLimit"."resetAt" END
      RETURNING "count", (EXTRACT(EPOCH FROM ("resetAt" - now())) * 1000)::float8 AS "msLeft"`
    return { count: row.count, msLeft: row.msLeft }
  },
  async peek(key) {
    const [row] = await prisma.$queryRaw<{ count: number; msLeft: number }[]>`
      SELECT "count", (EXTRACT(EPOCH FROM ("resetAt" - now())) * 1000)::float8 AS "msLeft"
      FROM "RateLimit" WHERE "key" = ${key} AND "resetAt" > now()`
    return row ? { count: row.count, msLeft: row.msLeft } : null
  },
  async peekMany(keys) {
    if (keys.length === 0) return new Map()
    const rows = await prisma.$queryRaw<{ key: string; count: number; msLeft: number }[]>`
      SELECT "key", "count", (EXTRACT(EPOCH FROM ("resetAt" - now())) * 1000)::float8 AS "msLeft"
      FROM "RateLimit" WHERE "key" = ANY(${keys}::text[]) AND "resetAt" > now()`
    return new Map(rows.map((r) => [r.key, { count: r.count, msLeft: r.msLeft }]))
  },
  async release(key) {
    await prisma.$executeRaw`
      UPDATE "RateLimit" SET "count" = GREATEST("count" - 1, 0) WHERE "key" = ${key} AND "resetAt" > now()`
  },
}

/**
 * Same semantics in this process only: for unit tests, which run without a database, and for a
 * route that must not write the client's IP anywhere (the anonymous video feedback, #646: per
 * replica, lost on restart, which is enough to slow down a script). Expired windows are swept once
 * the map holds more than `sweepAbove` keys, so a long-running process doesn't grow without bound.
 */
export function memoryStore(sweepAbove = 10_000): RateLimitStore {
  const windows = new Map<string, { count: number; resetAt: number }>()
  return {
    async hit(key, windowMs) {
      const now = Date.now()
      if (windows.size > sweepAbove) {
        for (const [k, w] of windows) if (w.resetAt <= now) windows.delete(k)
      }
      const win = windows.get(key)
      if (!win || win.resetAt <= now) {
        windows.set(key, { count: 1, resetAt: now + windowMs })
        return { count: 1, msLeft: windowMs }
      }
      win.count++
      return { count: win.count, msLeft: win.resetAt - now }
    },
    async peek(key) {
      const now = Date.now()
      const win = windows.get(key)
      return win && win.resetAt > now ? { count: win.count, msLeft: win.resetAt - now } : null
    },
    async peekMany(keys) {
      const now = Date.now()
      const found = new Map<string, WindowState>()
      for (const key of keys) {
        const win = windows.get(key)
        if (win && win.resetAt > now) found.set(key, { count: win.count, msLeft: win.resetAt - now })
      }
      return found
    },
    async release(key) {
      const win = windows.get(key)
      if (win && win.resetAt > Date.now()) win.count = Math.max(0, win.count - 1)
    },
  }
}

const store: RateLimitStore = process.env.NODE_ENV === "test" ? memoryStore() : postgresStore

/**
 * Limits that refuse rather than allow when the store fails: password guessing (login, the
 * current-password check, invitation activation), account recovery, anonymous sign-ups, and the
 * lookups of link tokens (their failed-lookup counters and the token pages). A store failure there
 * means a short refusal for everyone, never an unlimited budget. The other limits (per-organisation
 * quotas, a valid link's own budget, push, feedback) stay open.
 */
export const FAIL_CLOSED_ROUTES: ReadonlySet<string> = new Set([
  // Passwords
  "login-ip", "login-email-ip", "login-account",
  "password-check-account", "password-check-ip",
  "accept-invite-ip", "accept-invite-token", "accept-invite-check",
  // Account recovery and reactivation
  "forgot-password", "reset-password", "org-reactivation", "org-reactivation-confirm",
  // Anonymous sign-ups
  "signup", "signup-confirm", "registrations",
  // Link tokens: failed lookups, and the pages that look a token up
  "reg-token-miss", "reg-feed-miss", "avail-token-miss", "member-invite-roster-miss",
  "leader-token-read", "member-invite-read", "member-invite-decline", "waitlist-confirm", "org-keep",
  "reg-calendar", "reg-link-request", "reg-link-resend-ip",
])

/** Seconds a fail-closed limit asks the client to wait while the store fails. */
export const STORE_FAILURE_RETRY_AFTER = 60

/** The route of a reservation key (`<route>:<id>`; the id may hold colons, an IPv6 address). */
const routeOfKey = (key: string) => key.slice(0, Math.max(0, key.indexOf(":")))

/** Whether a hit is allowed, from the window it was counted in. */
export function decide(win: WindowState, limit: number): { ok: boolean; remaining: number; retryAfter: number } {
  if (win.count > limit) return { ok: false, remaining: 0, retryAfter: Math.max(1, Math.ceil(win.msLeft / 1000)) }
  return { ok: true, remaining: Math.max(0, limit - win.count), retryAfter: 0 }
}

export async function rateLimit(
  ip: string,
  route: string,
  limit: number,
  windowMs: number,
  using: RateLimitStore = store,
): Promise<{ ok: boolean; remaining: number; retryAfter: number }> {
  try {
    return decide(await using.hit(`${route}:${ip}`, windowMs), limit)
  } catch (e) {
    reportError("rate_limit.hit")(e)
    if (FAIL_CLOSED_ROUTES.has(route)) return { ok: false, remaining: 0, retryAfter: STORE_FAILURE_RETRY_AFTER }
    return { ok: true, remaining: limit, retryAfter: 0 }
  }
}

/**
 * Counts one hit of `key` and returns its window, null if the store failed (reported): the caller
 * then lets the request through, like `rateLimit`. For a fail-closed route (FAIL_CLOSED_ROUTES,
 * read from the key's `<route>:` prefix) a failure gives a window already over any budget instead,
 * so the caller refuses; the login's per-account bucket, which only delays, then waits its longest
 * delay. With `releaseHit`, a budget that reserves the hit before the work, so parallel requests
 * can't all pass a check made before any is counted.
 */
export async function reserveHit(key: string, windowMs: number, using: RateLimitStore = store): Promise<WindowState | null> {
  try {
    return await using.hit(key, windowMs)
  } catch (e) {
    reportError("rate_limit.reserve")(e)
    if (FAIL_CLOSED_ROUTES.has(routeOfKey(key))) return { count: Number.MAX_SAFE_INTEGER, msLeft: STORE_FAILURE_RETRY_AFTER * 1000 }
    return null
  }
}

/** Gives back a hit counted by `reserveHit` (a store without `release` keeps it). */
export async function releaseHit(key: string, using: RateLimitStore = store): Promise<void> {
  try {
    await using.release?.(key)
  } catch (e) {
    reportError("rate_limit.release")(e)
  }
}

/** Whether `key` has already used up `limit` in its current window — reads without counting. */
export async function isRateLimited(ip: string, route: string, limit: number, using: RateLimitStore = store): Promise<boolean> {
  try {
    const win = await using.peek(`${route}:${ip}`)
    return !!win && win.count >= limit
  } catch (e) {
    reportError("rate_limit.peek")(e)
    return FAIL_CLOSED_ROUTES.has(route)
  }
}

/**
 * Client IP as seen by our own reverse proxy (#289).
 *
 * `X-Forwarded-For` is a list each proxy appends to: `client-supplied…, what proxy 1 saw, …`.
 * The leftmost entries are whatever the client chose to send, so keying rate limits on them
 * lets anyone pick a fresh bucket per request. The trustworthy entry is the one added by the
 * proxy closest to us: counted from the right, TRUSTED_PROXY_HOPS entries in (1 = the rightmost,
 * Traefik in front of the pod; raise it only if another proxy/LB appends in front of Traefik).
 */
export function getClientIp(req: Request): string {
  const hops = Math.max(1, Number.parseInt(process.env.TRUSTED_PROXY_HOPS ?? "1", 10) || 1)
  const chain = (req.headers.get("x-forwarded-for") ?? "")
    .split(",")
    .map((ip) => ip.trim())
    .filter(Boolean)
  if (chain.length > 0) return chain[Math.max(0, chain.length - hops)]
  return req.headers.get("x-real-ip")?.trim() || "unknown"
}
