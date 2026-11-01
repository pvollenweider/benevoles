// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import type { JWT } from "next-auth/jwt"
import { prisma } from "./prisma"
import { isRateLimited, rateLimit, releaseHit, reserveHit, type RateLimitStore } from "./rate-limit"
import { organizationAllowsSignIn } from "./admin-sign-in"
import { claimLoginSlot, type LoginSlotStore } from "./login-slot"
import { sessionHardExpiry } from "./session-lifetime"
import { reportError } from "./report-error"

/**
 * Re-reads the admin behind a session token on every server-side auth() call, so a JWT issued
 * before a change doesn't keep privileges until it expires (src/lib/session-lifetime.ts): a
 * signed-out session (its id revoked), a deactivated or removed
 * admin, or an org admin whose organization was disabled, gets `null` (NextAuth then clears the
 * session cookie); a changed role or organization is picked up from the DB instead of the token.
 *
 * Not used by the proxy (no Prisma there): it only gates redirects on the token as
 * issued. Every page and API route that reads data goes through auth() from src/auth.ts.
 */
export async function refreshAdminToken(token: JWT): Promise<JWT | null> {
  if (!token.sub || !token.sid) return null
  const [admin, revoked] = await Promise.all([
    prisma.adminUser.findUnique({
      where: { id: token.sub },
      select: { isActive: true, role: true, organizationId: true, sessionVersion: true, email: true, name: true, organization: { select: { active: true, suspendedAt: true } } },
    }),
    prisma.revokedSession.findUnique({ where: { sid: token.sid }, select: { sid: true } }),
  ])
  // Signed out (revokeSession): a copy of the cookie kept elsewhere is refused too.
  if (revoked) return null
  if (!admin || !admin.isActive) return null
  // Password changed or reset since this session was opened (#360). Tokens issued before the
  // version existed count as 0, the column's default.
  if ((token.sessionVersion ?? 0) !== admin.sessionVersion) return null
  if (!organizationAllowsSignIn(admin)) return null
  token.role = admin.role
  token.organizationId = admin.organizationId
  // Also follow an email or name change (super-admin profile), instead of showing the values
  // from sign-in until the session ends.
  token.email = admin.email
  token.name = admin.name
  return token
}

/**
 * « Se déconnecter » (next-auth `events.signOut`, src/auth.ts): records the session's id as
 * revoked until the session could no longer be used anyway, so the cookie stops working even if a
 * copy of it was kept (another browser profile, a shared computer, a saved request). The person's
 * other sessions are untouched. Idempotent: signing out twice with the same cookie is harmless.
 *
 * next-auth swallows an error thrown here and clears the cookie anyway, so a failure is reported
 * instead: the browser is signed out, but a copy of its cookie would live until its own expiry.
 */
export async function revokeSession(token: Pick<JWT, "sid" | "authTime"> | null | undefined): Promise<void> {
  if (!token?.sid || typeof token.authTime !== "number") return
  const expiresAt = sessionHardExpiry(token.authTime)
  try {
    await prisma.revokedSession.upsert({ where: { sid: token.sid }, create: { sid: token.sid, expiresAt }, update: {} })
  } catch (e) {
    reportError("session.revoke")(e)
  }
}

const LOGIN_WINDOW_MS = 15 * 60 * 1000
export const LOGIN_MAX_PER_IP = 30
export const LOGIN_MAX_PER_EMAIL_IP = 10
/** Failures on an account (from any address) before each attempt starts waiting. */
export const LOGIN_DELAY_AFTER = 5
export const LOGIN_DELAY_MAX_MS = 8_000

const normalizeEmail = (email: string) => email.trim().toLowerCase()

/**
 * The wait before checking a password, from the account's recent failures from every address:
 * none for the first five, then 1 s, 2 s, 4 s, then 8 s at most. It slows guessing spread across
 * many addresses without a hard block on the account, which let anyone keep a known admin locked
 * out by failing ten times (#1048). While someone keeps failing from many addresses, the owner's
 * attempt can still land while another one holds the account's slot and be refused: the price of
 * checking one password at a time (src/lib/login-slot.ts).
 */
export function loginDelayMs(accountFailures: number): number {
  if (accountFailures < LOGIN_DELAY_AFTER) return 0
  return Math.min(LOGIN_DELAY_MAX_MS, 1000 * 2 ** (accountFailures - LOGIN_DELAY_AFTER))
}

export type LoginAttempt = {
  /** False once this address, or this address for this account, used up its failure budget. */
  allowed: boolean
  /** How long to wait before checking the password (account-wide, see loginDelayMs). */
  delayMs: number
  /** A successful login does not count: gives back what this attempt reserved. */
  succeeded(): Promise<void>
}

/**
 * Failed-login budget (#266, #1048). bcrypt cost alone doesn't bound password guessing, so per
 * 15 minutes:
 * - an address gets 30 failures, whatever the accounts;
 * - an address gets 10 failures on one account: the hard block no longer covers the account from
 *   every address, so a stranger can't lock its owner out;
 * - the account, from every address, gets a growing wait (loginDelayMs) instead of a block, and
 *   once it waits, only one attempt at a time may check its password (src/lib/login-slot.ts).
 *
 * Every attempt is counted before the password is checked, and given back once it succeeds: only
 * failures stay counted, but parallel attempts can't all pass a check made before any of them is
 * recorded. A blocked attempt is refused before bcrypt runs, so it says nothing about the password,
 * and is not counted.
 */
const BLOCKED: LoginAttempt = { allowed: false, delayMs: 0, succeeded: async () => {} }

export async function beginLoginAttempt(ip: string, email: string, using?: RateLimitStore, slots?: LoginSlotStore): Promise<LoginAttempt> {
  const account = normalizeEmail(email)
  const keys = { ip: `login-ip:${ip}`, emailIp: `login-email-ip:${account}|${ip}`, account: `login-account:${account}` }
  // Already used up: refused without counting, so refused retries never eat the budget other
  // accounts behind the same address (an office, a mobile network) need.
  const [ipFull, emailIpFull] = await Promise.all([
    isRateLimited(ip, "login-ip", LOGIN_MAX_PER_IP, using),
    isRateLimited(`${account}|${ip}`, "login-email-ip", LOGIN_MAX_PER_EMAIL_IP, using),
  ])
  if (ipFull || emailIpFull) return BLOCKED
  const [byIp, byEmailIp] = await Promise.all([
    reserveHit(keys.ip, LOGIN_WINDOW_MS, using),
    reserveHit(keys.emailIp, LOGIN_WINDOW_MS, using),
  ])
  if ((byIp && byIp.count > LOGIN_MAX_PER_IP) || (byEmailIp && byEmailIp.count > LOGIN_MAX_PER_EMAIL_IP)) {
    // Lost a race with parallel attempts: refused, and the reservation given back.
    await Promise.all([releaseHit(keys.ip, using), releaseHit(keys.emailIp, using)])
    return BLOCKED
  }
  const byAccount = await reserveHit(keys.account, LOGIN_WINDOW_MS, using)
  const giveBack = async () => {
    await Promise.all([releaseHit(keys.ip, using), releaseHit(keys.emailIp, using), releaseHit(keys.account, using)])
  }
  const delayMs = byAccount ? loginDelayMs(byAccount.count - 1) : 0
  if (delayMs === 0) return { allowed: true, delayMs: 0, succeeded: giveBack }
  // One password check at a time on this account (src/lib/login-slot.ts): parallel attempts can't
  // all wait side by side. Refused, the attempt checked nothing, so it gives everything back.
  const wait = await claimLoginSlot(account, delayMs, slots)
  if (wait === null) {
    await giveBack()
    return BLOCKED
  }
  return { allowed: true, delayMs: wait, succeeded: giveBack }
}

const PASSWORD_CHECK_WINDOW_MS = 15 * 60 * 1000
const PASSWORD_CHECK_MAX_PER_ACCOUNT = 5
const PASSWORD_CHECK_MAX_PER_IP = 20

/**
 * Budget for the "current password" check of a signed-in admin (change password, super-admin
 * profile, #358): without it a stolen session could guess the current password indefinitely, at
 * the cost of one bcrypt comparison per request. Same approach as login: only failures count,
 * per account and per IP, checked before bcrypt runs.
 */
export async function passwordCheckAllowed(ip: string, adminId: string): Promise<boolean> {
  const [byAccount, byIp] = await Promise.all([
    isRateLimited(adminId, "password-check-account", PASSWORD_CHECK_MAX_PER_ACCOUNT),
    isRateLimited(ip, "password-check-ip", PASSWORD_CHECK_MAX_PER_IP),
  ])
  return !byAccount && !byIp
}

export async function recordPasswordCheckFailure(ip: string, adminId: string): Promise<void> {
  await Promise.all([
    rateLimit(adminId, "password-check-account", PASSWORD_CHECK_MAX_PER_ACCOUNT, PASSWORD_CHECK_WINDOW_MS),
    rateLimit(ip, "password-check-ip", PASSWORD_CHECK_MAX_PER_IP, PASSWORD_CHECK_WINDOW_MS),
  ])
}

export const PASSWORD_CHECK_BLOCKED = "Trop de tentatives avec un mot de passe incorrect. Réessayez dans un quart d'heure."
