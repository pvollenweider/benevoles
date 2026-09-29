// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import type { JWT } from "next-auth/jwt"
import { prisma } from "./prisma"
import { isRateLimited, rateLimit } from "./rate-limit"

/**
 * Re-reads the admin behind a session token on every server-side auth() call, so a JWT issued
 * before a change doesn't keep privileges until it expires (30 days): a deactivated or removed
 * admin, or an org admin whose organization was disabled, gets `null` (NextAuth then clears the
 * session cookie); a changed role or organization is picked up from the DB instead of the token.
 *
 * Not used by the middleware (edge runtime, no Prisma): it only gates redirects on the token as
 * issued. Every page and API route that reads data goes through auth() from src/auth.ts.
 */
export async function refreshAdminToken(token: JWT): Promise<JWT | null> {
  if (!token.sub) return null
  const admin = await prisma.adminUser.findUnique({
    where: { id: token.sub },
    select: { isActive: true, role: true, organizationId: true, organization: { select: { active: true } } },
  })
  if (!admin || !admin.isActive) return null
  if (admin.organization && !admin.organization.active) return null
  token.role = admin.role
  token.organizationId = admin.organizationId
  return token
}

const LOGIN_WINDOW_MS = 15 * 60 * 1000
const LOGIN_MAX_PER_EMAIL = 10
const LOGIN_MAX_PER_IP = 30

const normalizeEmail = (email: string) => email.trim().toLowerCase()

/**
 * Failed-login budget, per target account and per client IP — bcrypt cost alone doesn't bound
 * password guessing. Only failures count, so normal repeated logins never lock anyone out.
 * Checked before the password, so a blocked attempt says nothing about whether it was right.
 */
export async function loginAllowed(ip: string, email: string): Promise<boolean> {
  const [byEmail, byIp] = await Promise.all([
    isRateLimited(normalizeEmail(email), "login-email", LOGIN_MAX_PER_EMAIL),
    isRateLimited(ip, "login-ip", LOGIN_MAX_PER_IP),
  ])
  return !byEmail && !byIp
}

export async function recordLoginFailure(ip: string, email: string): Promise<void> {
  await Promise.all([
    rateLimit(normalizeEmail(email), "login-email", LOGIN_MAX_PER_EMAIL, LOGIN_WINDOW_MS),
    rateLimit(ip, "login-ip", LOGIN_MAX_PER_IP, LOGIN_WINDOW_MS),
  ])
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
