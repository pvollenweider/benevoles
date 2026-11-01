// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { ADMIN_HOME, loginDestination } from "./admin-next"

/**
 * The second factor's place in the session (pentest F6). Edge-safe (no Node or Prisma import): it
 * runs in the proxy as well as on the server, through the session callback of auth.config.ts, so
 * both decide the same way from the same token.
 *
 * A super admin who signed in with the password only holds a « pending » session: its role and
 * organization are withheld (masked to nothing), so every existing check on `role === "super_admin"`,
 * hasLevel or the organization fails closed, and `secondFactor.pending` says why. The token becomes
 * complete once a code is checked: `secondFactorAt` is then set by the Node jwt callback (src/auth.ts)
 * from a server-made proof, never from what a client sends. It lasts SECOND_FACTOR_MAX_AGE_MS; after
 * that the code is asked again, even though the password session goes on.
 *
 * A token issued before this existed has no `loginNonce`: it is pending like any other, and the
 * second-factor page asks for a new sign-in before anything else.
 */

/** A checked code holds for 12 hours, then is asked again. */
export const SECOND_FACTOR_MAX_AGE_MS = 12 * 60 * 60 * 1000
/** Enrolling needs a password checked less than an hour ago. */
export const ENROLMENT_PASSWORD_MAX_AGE_MS = 60 * 60 * 1000

export const SECOND_FACTOR_PATH = "/admin/two-factor"

export type SecondFactorClaims = {
  role?: string
  loginNonce?: string
  authAt?: number
  secondFactorAt?: number
}

/** Roles that must give a second factor. The super admin only, for now. */
export function requiresSecondFactor(role: string | null | undefined): boolean {
  return role === "super_admin"
}

/** Whether this token still has to give its code. */
export function secondFactorPending(token: SecondFactorClaims, nowMs: number): boolean {
  if (!requiresSecondFactor(token.role)) return false
  const at = token.secondFactorAt
  if (typeof at !== "number" || !token.loginNonce) return true
  // A check made before this sign-in (should never happen: sign-in drops it) or in the future.
  if (typeof token.authAt === "number" && at < token.authAt) return true
  if (at > nowMs + 60_000) return true
  return nowMs - at >= SECOND_FACTOR_MAX_AGE_MS
}

/** A random id for a new sign-in (Web Crypto: works in the proxy too). */
export function newLoginNonce(): string {
  const bytes = new Uint8Array(16)
  globalThis.crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")
}

/** Claims of a fresh password sign-in: a new nonce, and no second factor yet. */
export function signInClaims<T extends SecondFactorClaims>(token: T, nowMs: number): T {
  token.loginNonce = newLoginNonce()
  token.authAt = nowMs
  delete token.secondFactorAt
  return token
}

type SessionLike = {
  user?: { role?: string; organizationId?: string | null } | null
  secondFactor?: { pending: boolean; loginNonce: string | null; authAt: number | null }
}

/**
 * Applies the second factor to a session built from the token: says whether it is pending, and if
 * so withholds the role and organization.
 */
export function applySecondFactor<S extends SessionLike>(session: S, token: SecondFactorClaims, nowMs: number): S & { secondFactor: NonNullable<SessionLike["secondFactor"]> } {
  const pending = secondFactorPending(token, nowMs)
  session.secondFactor = { pending, loginNonce: token.loginNonce ?? null, authAt: typeof token.authAt === "number" ? token.authAt : null }
  if (pending && session.user) {
    session.user.role = undefined
    session.user.organizationId = null
  }
  return session as S & { secondFactor: NonNullable<SessionLike["secondFactor"]> }
}

/** Whether the password of this session is recent enough to enrol a new factor. */
export function passwordRecentEnough(authAt: number | null | undefined, nowMs: number): boolean {
  return typeof authAt === "number" && nowMs - authAt >= 0 && nowMs - authAt < ENROLMENT_PASSWORD_MAX_AGE_MS
}

/**
 * The second-factor page's address, carrying where to go afterwards (a same-site admin path only:
 * the caller passes a path it built itself, never a full URL from the client).
 */
export function secondFactorUrl(callbackPath: string | null): string {
  if (!callbackPath || !callbackPath.startsWith("/") || callbackPath.startsWith("//")) return SECOND_FACTOR_PATH
  return `${SECOND_FACTOR_PATH}?callbackUrl=${encodeURIComponent(callbackPath)}`
}

/**
 * Where the second-factor page sends a completed session: the page the proxy sent away from
 * (validated like the login page's destination), the super admin space otherwise; never back to
 * the second-factor page itself.
 */
export function afterSecondFactor(callbackUrl: string | null | undefined): string {
  const path = loginDestination(callbackUrl)
  if (path === SECOND_FACTOR_PATH || path.startsWith(`${SECOND_FACTOR_PATH}?`) || path === ADMIN_HOME) return "/super-admin"
  return path
}
