// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import type { Prisma } from "@/generated/prisma/client"
import { prisma } from "./prisma"
import { decryptValue, encryptValue } from "./token-vault"
import QRCode from "qrcode"
import { base32Decode, generateTotpSecret, matchTotpStep, otpauthUri } from "./totp"
import { generateRecoveryCodes, hashRecoveryCode, normalizeRecoveryCode } from "./recovery-codes"
import { releaseHit, reserveHit, type RateLimitStore } from "./rate-limit"
import { notifyOperator } from "./operator-alerts"
import { reportError } from "./report-error"
import { configuredAppUrl } from "./urls"
import { siteName } from "./site"
import { passwordRecentEnough, requiresSecondFactor } from "./second-factor-session"

/**
 * The super admin's second factor on the server (pentest F6): enrolment, code checks, recovery
 * codes, and the reset used by the break-glass script. Session handling is elsewhere
 * (second-factor-session.ts, second-factor-proof.ts, second-factor-update.ts).
 *
 * Every write that accepts a code is a conditional update on the values read (account, its
 * sessionVersion, the secret itself, the last step used): two requests with the same code can't both
 * succeed, and a reset or a password change in between makes the check fail instead of applying to
 * a factor that no longer exists.
 */

/** No TOKEN_ENCRYPTION_KEY: a secret would have to be stored in clear, which is refused. */
export class SecondFactorUnavailableError extends Error {
  constructor() {
    super("TOKEN_ENCRYPTION_KEY is required to store a second-factor secret")
  }
}

/**
 * An enrolment not confirmed within a day starts over with a new secret. Long on purpose
 * (accessibility review, WCAG 2.2.1): installing an app can take a while, and a sign-in that has to
 * be redone in between comes back to the same QR code, so the entry already scanned keeps working.
 */
export const ENROLMENT_TTL_MS = 24 * 60 * 60 * 1000

const ATTEMPT_WINDOW_MS = 15 * 60 * 1000
export const SECOND_FACTOR_MAX_PER_ACCOUNT = 5
export const SECOND_FACTOR_MAX_PER_IP = 20

export type SecondFactorAttempt = { allowed: boolean; succeeded(): Promise<void> }
const BLOCKED: SecondFactorAttempt = { allowed: false, succeeded: async () => {} }

/**
 * Failed-code budget, shared by the code, a recovery code and the enrolment confirmation: per 15
 * minutes, 5 failures per account and 20 per address. Like the login budget, each attempt is counted
 * before the check and given back when it succeeds, so parallel guesses can't all pass a check made
 * before any of them is counted. Unlike it, a failure of the counter store refuses the attempt: the
 * second factor never runs without its limit.
 */
export async function beginSecondFactorAttempt(adminId: string, ip: string, using?: RateLimitStore): Promise<SecondFactorAttempt> {
  const keys = { account: `second-factor-account:${adminId}`, ip: `second-factor-ip:${ip}` }
  const [byAccount, byIp] = await Promise.all([reserveHit(keys.account, ATTEMPT_WINDOW_MS, using), reserveHit(keys.ip, ATTEMPT_WINDOW_MS, using)])
  const release = () => Promise.all([byAccount && releaseHit(keys.account, using), byIp && releaseHit(keys.ip, using)]).then(() => {})
  if (!byAccount || !byIp || byAccount.count > SECOND_FACTOR_MAX_PER_ACCOUNT || byIp.count > SECOND_FACTOR_MAX_PER_IP) {
    // Refused: not counted, so the budget stays at its limit rather than growing past it.
    await release()
    return BLOCKED
  }
  return { allowed: true, succeeded: release }
}

export type SecondFactorAccount = { id: string; email: string; role: string; sessionVersion: number; isActive: boolean }

export type SecondFactorStatus = { enrolled: boolean; enabledAt: Date | null; recoveryCodesLeft: number }

export async function secondFactorStatus(adminId: string): Promise<SecondFactorStatus> {
  const [admin, left] = await Promise.all([
    prisma.adminUser.findUnique({ where: { id: adminId }, select: { totpEnabledAt: true, totpSecretEnc: true } }),
    prisma.adminRecoveryCode.count({ where: { adminUserId: adminId, usedAt: null } }),
  ])
  const enrolled = !!admin?.totpEnabledAt && !!admin.totpSecretEnc
  return { enrolled, enabledAt: enrolled ? admin!.totpEnabledAt : null, recoveryCodesLeft: enrolled ? left : 0 }
}

/** A pending enrolment: secret, expiry, and the account's sessionVersion when it was offered. */
type PendingEnrolment = { s: string; e: number; v: number }

function readPending(stored: string | null): PendingEnrolment | null {
  if (!stored) return null
  try {
    const value = JSON.parse(decryptValue(stored)) as Partial<PendingEnrolment>
    if (typeof value.s !== "string" || typeof value.e !== "number" || typeof value.v !== "number") return null
    return value as PendingEnrolment
  } catch {
    return null
  }
}

function seal(text: string): string {
  const enc = encryptValue(text)
  if (!enc) throw new SecondFactorUnavailableError()
  return enc
}

/**
 * The secret to show on the enrolment page: the one already offered to this account if it hasn't
 * expired (a reload or a new sign-in shows the same QR code), a new one otherwise. Null once the
 * account is enrolled. Only a session that passed the password recently gets here
 * (passwordRecentEnough), and confirming needs a code made from this very secret.
 */
export async function pendingEnrolmentSecret(adminId: string, nowMs: number): Promise<string | null> {
  const admin = await prisma.adminUser.findUnique({ where: { id: adminId }, select: { totpEnabledAt: true, totpPendingSecretEnc: true, sessionVersion: true } })
  if (!admin || admin.totpEnabledAt) return null
  const current = readPending(admin.totpPendingSecretEnc)
  // A password change or reset since it was offered drops it: whoever saw the old QR code keeps nothing.
  if (current && current.e > nowMs && current.v === admin.sessionVersion) return current.s
  const secret = generateTotpSecret()
  const sealed = seal(JSON.stringify({ s: secret, e: nowMs + ENROLMENT_TTL_MS, v: admin.sessionVersion } satisfies PendingEnrolment))
  const { count } = await prisma.adminUser.updateMany({
    where: { id: adminId, sessionVersion: admin.sessionVersion, totpEnabledAt: null, totpPendingSecretEnc: admin.totpPendingSecretEnc },
    data: { totpPendingSecretEnc: sealed },
  })
  if (count === 1) return secret
  // Another request got there first: show what it stored.
  const again = await prisma.adminUser.findUnique({ where: { id: adminId }, select: { totpEnabledAt: true, totpPendingSecretEnc: true, sessionVersion: true } })
  const stored = readPending(again?.totpPendingSecretEnc ?? null)
  return again && !again.totpEnabledAt && stored && stored.e > nowMs && stored.v === again.sessionVersion ? stored.s : null
}

/** The otpauth:// address of an enrolment, named after the site and the account. */
export function enrolmentUri(secret: string, email: string): string {
  return otpauthUri(secret, email, siteName())
}

/**
 * The enrolment's QR code, made on the server as SVG: black on white with a 4-module quiet zone, in
 * fixed colours so no theme can make it unreadable. Hidden from assistive technology: the wrapper
 * on the page names it, and the key written below is its text equivalent.
 */
export async function enrolmentQrSvg(uri: string): Promise<string> {
  const svg = await QRCode.toString(uri, { type: "svg", margin: 4, errorCorrectionLevel: "M", color: { dark: "#000000", light: "#ffffff" } })
  return svg.replace("<svg ", '<svg aria-hidden="true" focusable="false" ')
}

export type SecondFactorPageState =
  | { mode: "signin"; email: string }
  | { mode: "unavailable"; email: string }
  | { mode: "verify"; email: string }
  | { mode: "enrol"; email: string; secret: string; uri: string; qrSvg: string }

/**
 * What the second-factor page shows to a pending session: sign in again (a session from before the
 * second factor, or a password too old to enrol), enrol, or give a code. Null when the account
 * doesn't give a second factor.
 */
export async function secondFactorPage(session: { user?: { id?: string } | null; secondFactor?: { loginNonce: string | null; authAt: number | null } }, nowMs = Date.now()): Promise<SecondFactorPageState | null> {
  const id = session.user?.id
  if (!id) return null
  const account = await prisma.adminUser.findUnique({ where: { id }, select: { email: true, role: true, isActive: true } })
  if (!account || !account.isActive || !requiresSecondFactor(account.role)) return null
  if (!session.secondFactor?.loginNonce) return { mode: "signin", email: account.email }
  const status = await secondFactorStatus(id)
  if (status.enrolled) return { mode: "verify", email: account.email }
  if (!passwordRecentEnough(session.secondFactor.authAt, nowMs)) return { mode: "signin", email: account.email }
  try {
    const secret = await pendingEnrolmentSecret(id, nowMs)
    if (!secret) return { mode: "verify", email: account.email }
    const uri = enrolmentUri(secret, account.email)
    return { mode: "enrol", email: account.email, secret, uri, qrSvg: await enrolmentQrSvg(uri) }
  } catch (e) {
    if (e instanceof SecondFactorUnavailableError) return { mode: "unavailable", email: account.email }
    throw e
  }
}

export type CodeOutcome =
  | { ok: true; recoveryCodes?: string[]; usedRecoveryCode?: boolean }
  | { ok: false; reason: "invalid" | "expired" | "not_enrolled" | "already_enrolled" }

/** A conditional write lost to a concurrent one: the whole transaction is rolled back. */
class LostRace extends Error {}

async function storeRecoveryCodes(tx: Prisma.TransactionClient, adminId: string): Promise<string[]> {
  const codes = generateRecoveryCodes()
  await tx.adminRecoveryCode.deleteMany({ where: { adminUserId: adminId } })
  await tx.adminRecoveryCode.createMany({ data: codes.map((code) => ({ adminUserId: adminId, codeHash: hashRecoveryCode(normalizeRecoveryCode(code)!) })) })
  return codes
}

/**
 * Confirms an enrolment with a first code from the app. On success the factor is on, the code's step
 * is spent, and the ten recovery codes are returned, to show once.
 */
export async function confirmEnrolment(account: SecondFactorAccount, code: string, nowMs: number): Promise<CodeOutcome> {
  const admin = await prisma.adminUser.findUnique({ where: { id: account.id }, select: { totpEnabledAt: true, totpPendingSecretEnc: true } })
  if (!admin) return { ok: false, reason: "invalid" }
  if (admin.totpEnabledAt) return { ok: false, reason: "already_enrolled" }
  const pending = readPending(admin.totpPendingSecretEnc)
  if (!pending || pending.e <= nowMs || pending.v !== account.sessionVersion) return { ok: false, reason: "expired" }
  const step = matchTotpStep(base32Decode(pending.s), code, nowMs, null)
  if (step === null) return { ok: false, reason: "invalid" }
  const secretEnc = seal(pending.s)
  try {
    const recoveryCodes = await prisma.$transaction(async (tx) => {
      const { count } = await tx.adminUser.updateMany({
        where: { id: account.id, sessionVersion: account.sessionVersion, totpEnabledAt: null, totpPendingSecretEnc: admin.totpPendingSecretEnc },
        data: { totpSecretEnc: secretEnc, totpEnabledAt: new Date(nowMs), totpLastUsedStep: step, totpPendingSecretEnc: null },
      })
      if (count !== 1) throw new LostRace()
      return storeRecoveryCodes(tx, account.id)
    })
    alertOperator("enrolled", account.id, nowMs)
    return { ok: true, recoveryCodes }
  } catch (e) {
    if (e instanceof LostRace) return { ok: false, reason: "invalid" }
    throw e
  }
}

/** Spends a code of the app: valid within the window, and newer than the last one accepted. */
async function spendTotpCode(db: Prisma.TransactionClient | typeof prisma, account: SecondFactorAccount, code: string, nowMs: number): Promise<CodeOutcome> {
  const admin = await db.adminUser.findUnique({ where: { id: account.id }, select: { totpEnabledAt: true, totpSecretEnc: true, totpLastUsedStep: true } })
  if (!admin?.totpEnabledAt || !admin.totpSecretEnc) return { ok: false, reason: "not_enrolled" }
  const step = matchTotpStep(base32Decode(decryptValue(admin.totpSecretEnc)), code, nowMs, admin.totpLastUsedStep)
  if (step === null) return { ok: false, reason: "invalid" }
  const { count } = await db.adminUser.updateMany({
    where: {
      id: account.id,
      sessionVersion: account.sessionVersion,
      totpSecretEnc: admin.totpSecretEnc,
      OR: [{ totpLastUsedStep: null }, { totpLastUsedStep: { lt: step } }],
    },
    data: { totpLastUsedStep: step },
  })
  return count === 1 ? { ok: true } : { ok: false, reason: "invalid" }
}

/** The sign-in's second step: a code of the app, or else a recovery code (spent once). */
export async function verifySecondFactor(account: SecondFactorAccount, input: { code?: string; recoveryCode?: string }, nowMs: number): Promise<CodeOutcome> {
  if (input.code !== undefined) return spendTotpCode(prisma, account, input.code, nowMs)
  const normalized = normalizeRecoveryCode(input.recoveryCode ?? "")
  const status = await prisma.adminUser.findUnique({ where: { id: account.id }, select: { totpEnabledAt: true, sessionVersion: true } })
  if (!status?.totpEnabledAt) return { ok: false, reason: "not_enrolled" }
  if (!normalized || status.sessionVersion !== account.sessionVersion) return { ok: false, reason: "invalid" }
  const { count } = await prisma.adminRecoveryCode.updateMany({
    where: { adminUserId: account.id, codeHash: hashRecoveryCode(normalized), usedAt: null },
    data: { usedAt: new Date(nowMs) },
  })
  if (count !== 1) return { ok: false, reason: "invalid" }
  alertOperator("recovery_code_used", account.id, nowMs)
  return { ok: true, usedRecoveryCode: true }
}

/**
 * New recovery codes (the old ones stop working), with a current code of the app: spending the code
 * and replacing the codes happen in one transaction, or not at all.
 */
export async function regenerateRecoveryCodes(account: SecondFactorAccount, code: string, nowMs: number): Promise<CodeOutcome> {
  try {
    const outcome = await prisma.$transaction(async (tx) => {
      const spent = await spendTotpCode(tx, account, code, nowMs)
      if (!spent.ok) return spent
      return { ok: true as const, recoveryCodes: await storeRecoveryCodes(tx, account.id) }
    })
    if (outcome.ok) alertOperator("recovery_codes_regenerated", account.id, nowMs)
    return outcome
  } catch (e) {
    if (e instanceof LostRace) return { ok: false, reason: "invalid" }
    throw e
  }
}

export type ResetOutcome = { ok: true; email: string } | { ok: false; reason: "not_found" | "not_super_admin" }

/**
 * Break-glass reset (scripts/reset-two-factor.ts): clears the factor, the pending enrolment, the
 * replay state and every recovery code, and ends the account's sessions (sessionVersion + 1), in one
 * transaction. The next sign-in enrols again.
 */
export async function resetSecondFactor(email: string, nowMs: number, db: typeof prisma = prisma): Promise<ResetOutcome> {
  const outcome = await db.$transaction(async (tx) => {
    const admin = await tx.adminUser.findFirst({ where: { email: { equals: email.trim(), mode: "insensitive" } }, select: { id: true, email: true, role: true } })
    if (!admin) return { ok: false as const, reason: "not_found" as const }
    if (admin.role !== "super_admin") return { ok: false as const, reason: "not_super_admin" as const }
    await tx.adminUser.update({
      where: { id: admin.id },
      data: { totpSecretEnc: null, totpPendingSecretEnc: null, totpEnabledAt: null, totpLastUsedStep: null, sessionVersion: { increment: 1 } },
    })
    await tx.adminRecoveryCode.deleteMany({ where: { adminUserId: admin.id } })
    return { ok: true as const, email: admin.email, id: admin.id }
  })
  if (!outcome.ok) return outcome
  await alertOperatorNow("reset", outcome.id, nowMs)
  return { ok: true, email: outcome.email }
}

type SecurityEvent = "enrolled" | "recovery_code_used" | "recovery_codes_regenerated" | "reset"

const ALERT_TEXT: Record<SecurityEvent, { title: string; message: string }> = {
  enrolled: {
    title: "Double authentification activée",
    message: "Un compte super admin vient d'activer la double authentification. Si ce n'est pas vous, réinitialisez-la et changez le mot de passe.",
  },
  recovery_code_used: {
    title: "Code de secours utilisé",
    message: "Un code de secours vient de servir à se connecter à un compte super admin. Si ce n'est pas vous, réinitialisez la double authentification et changez le mot de passe.",
  },
  recovery_codes_regenerated: {
    title: "Nouveaux codes de secours",
    message: "De nouveaux codes de secours viennent d'être créés pour un compte super admin ; les anciens ne fonctionnent plus.",
  },
  reset: {
    title: "Double authentification réinitialisée",
    message: "La double authentification d'un compte super admin vient d'être réinitialisée depuis le serveur. La prochaine connexion demandera de l'activer à nouveau.",
  },
}

/** No personal data in an alert (operator-alerts.ts): what happened, and where to look. */
function alertFor(event: SecurityEvent, adminId: string, nowMs: number) {
  const base = configuredAppUrl()
  return { key: `second-factor:${event}:${adminId}:${nowMs}`, priority: 4 as const, ...ALERT_TEXT[event], url: base ? `${base}/super-admin/profile` : undefined }
}

async function alertOperatorNow(event: SecurityEvent, adminId: string, nowMs: number): Promise<void> {
  // Never undoes or fails what was just done: the security change stands even if the alert fails.
  await notifyOperator(alertFor(event, adminId, nowMs)).catch(reportError(`second_factor.alert_${event}`))
}

function alertOperator(event: SecurityEvent, adminId: string, nowMs: number): void {
  void alertOperatorNow(event, adminId, nowMs)
}
