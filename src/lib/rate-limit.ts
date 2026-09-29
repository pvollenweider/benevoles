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
 * If the store fails, the request is allowed and the error reported: a rate limit must never be
 * the reason the app is down (and when Postgres is down, nothing else works anyway).
 */

/** Hits in the key's current window, and the milliseconds left in it. */
export type WindowState = { count: number; msLeft: number }

export type RateLimitStore = {
  /** Counts one hit, starting a new window of `windowMs` if there's none or it has expired. */
  hit(key: string, windowMs: number): Promise<WindowState>
  /** The current window, without counting; null if none or expired. */
  peek(key: string): Promise<WindowState | null>
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
}

/** Same semantics in this process only: for unit tests, which run without a database. */
export function memoryStore(): RateLimitStore {
  const windows = new Map<string, { count: number; resetAt: number }>()
  return {
    async hit(key, windowMs) {
      const now = Date.now()
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
  }
}

const store: RateLimitStore = process.env.NODE_ENV === "test" ? memoryStore() : postgresStore

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
    return { ok: true, remaining: limit, retryAfter: 0 }
  }
}

/** Whether `key` has already used up `limit` in its current window — reads without counting. */
export async function isRateLimited(ip: string, route: string, limit: number, using: RateLimitStore = store): Promise<boolean> {
  try {
    const win = await using.peek(`${route}:${ip}`)
    return !!win && win.count >= limit
  } catch (e) {
    reportError("rate_limit.peek")(e)
    return false
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
