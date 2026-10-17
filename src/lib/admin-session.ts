// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import type { JWT } from "next-auth/jwt"
import { prisma } from "./prisma"
import { isRateLimited, rateLimit, releaseHit, reserveHit, type RateLimitStore } from "./rate-limit"
import { organizationAllowsSignIn } from "./admin-sign-in"

/**
 * Re-reads the admin behind a session token on every server-side auth() call, so a JWT issued
 * before a change doesn't keep privileges until it expires (30 days): a deactivated or removed
 * admin, or an org admin whose organization was disabled, gets `null` (NextAuth then clears the
 * session cookie); a changed role or organization is picked up from the DB instead of the token.
 *
 * Not used by the proxy (no Prisma there): it only gates redirects on the token as
 * issued. Every page and API route that reads data goes through auth() from src/auth.ts.
 */
export async function refreshAdminToken(token: JWT): Promise<JWT | null> {
  if (!token.sub) return null
  const admin = await prisma.adminUser.findUnique({
    where: { id: token.sub },
    select: { isActive: true, role: true, organizationId: true, sessionVersion: true, email: true, name: true, organization: { select: { active: true } } },
  })
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
 * many addresses without ever refusing the account's owner, which a hard block on the account did
 * (anyone could keep a known admin locked out by failing ten times, #1048).
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
 * - the account, from every address, gets a growing wait (loginDelayMs) instead of a block.
 *
 * Every attempt is counted before the password is checked, and given back once it succeeds: only
 * failures stay counted, but parallel attempts can't all pass a check made before any of them is
 * recorded. A blocked attempt is refused before bcrypt runs, so it says nothing about the password.
 */
export async function beginLoginAttempt(ip: string, email: string, using?: RateLimitStore): Promise<LoginAttempt> {
  const account = normalizeEmail(email)
  const keys = { ip: `login-ip:${ip}`, emailIp: `login-email-ip:${account}|${ip}`, account: `login-account:${account}` }
  const [byIp, byEmailIp] = await Promise.all([
    reserveHit(keys.ip, LOGIN_WINDOW_MS, using),
    reserveHit(keys.emailIp, LOGIN_WINDOW_MS, using),
  ])
  const allowed = (!byIp || byIp.count <= LOGIN_MAX_PER_IP) && (!byEmailIp || byEmailIp.count <= LOGIN_MAX_PER_EMAIL_IP)
  if (!allowed) return { allowed: false, delayMs: 0, succeeded: async () => {} }
  const byAccount = await reserveHit(keys.account, LOGIN_WINDOW_MS, using)
  return {
    allowed: true,
    delayMs: byAccount ? loginDelayMs(byAccount.count - 1) : 0,
    succeeded: async () => {
      await Promise.all([releaseHit(keys.ip, using), releaseHit(keys.emailIp, using), releaseHit(keys.account, using)])
    },
  }
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
