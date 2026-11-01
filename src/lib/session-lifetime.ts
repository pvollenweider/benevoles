// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Lifetime of an administration session (JWT strategy). Edge-safe: no Prisma, no Node-only API,
 * so the proxy (src/proxy.ts) and auth() (src/auth.ts) apply the same rules.
 *
 * - Idle limit: the session cookie and the JWT expire SESSION_IDLE_SECONDS after the last request
 *   that renewed them (next-auth `session.maxAge`, renewed by the proxy on each signed-in request).
 * - Absolute limit: whatever the activity, a session ends SESSION_ABSOLUTE_SECONDS after the
 *   sign-in that opened it (`authTime`, set once at sign-in and never renewed).
 * - Each session carries a random id (`sid`), set at sign-in: signing out revokes that id on the
 *   server (src/lib/admin-session.ts), so a copy of the cookie stops working too, without signing
 *   the person out of their other devices.
 *
 * A token without `sid` or `authTime` was issued before these rules and is refused: its holder
 * signs in again once.
 */

/** 7 days without any signed-in request ends the session. */
export const SESSION_IDLE_SECONDS = 7 * 24 * 3600
/** 30 days after sign-in, the session ends even if it was used every day. */
export const SESSION_ABSOLUTE_SECONDS = 30 * 24 * 3600

export type SessionClaims = { sid?: unknown; authTime?: unknown }

const nowSeconds = (now: Date) => Math.floor(now.getTime() / 1000)

/** The claims a new session starts with, at sign-in. */
export function newSessionClaims(now: Date = new Date(), randomId: () => string = () => crypto.randomUUID()): { sid: string; authTime: number } {
  return { sid: randomId(), authTime: nowSeconds(now) }
}

/**
 * Whether a token's session is still within its lifetime: it has a session id, a sign-in time that
 * is not in the future (a minute of clock skew allowed) and not older than the absolute limit.
 */
export function sessionWithinLifetime(token: SessionClaims, now: Date = new Date()): boolean {
  if (typeof token.sid !== "string" || token.sid.length === 0 || token.sid.length > 64) return false
  if (typeof token.authTime !== "number" || !Number.isFinite(token.authTime)) return false
  const t = nowSeconds(now)
  return token.authTime <= t + 60 && t - token.authTime < SESSION_ABSOLUTE_SECONDS
}

/** When a session signed in at `authTime` (seconds) can no longer be used anyway. */
export function sessionHardExpiry(authTime: number): Date {
  return new Date((authTime + SESSION_ABSOLUTE_SECONDS) * 1000)
}

/**
 * The session cookie over HTTPS: `__Host-` instead of next-auth's default `__Secure-` prefix, so
 * the browser only accepts it from this exact host, with `Path=/` and no `Domain`. Another
 * subdomain can then never plant a session cookie for this one. Over plain HTTP (local
 * development, the end-to-end tests) next-auth's default stays, as a `__Host-` cookie needs Secure.
 *
 * Follows next-auth's own choice of secure cookies: the protocol of AUTH_URL (NEXTAUTH_URL).
 */
export function sessionCookieOverride(env: Record<string, string | undefined> = process.env) {
  const url = env.AUTH_URL ?? env.NEXTAUTH_URL
  if (!url?.startsWith("https://")) return undefined
  return {
    sessionToken: {
      name: "__Host-authjs.session-token",
      options: { httpOnly: true, sameSite: "lax" as const, path: "/", secure: true },
    },
  }
}
