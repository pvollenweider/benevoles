import { describe, it, expect, afterAll, beforeAll, vi } from "vitest"
import { randomBytes } from "node:crypto"

/**
 * The super admin's second factor (pentest F6) against a real Postgres: every accepted code is a
 * conditional update, so two requests with the same code (or the same recovery code, or the same
 * enrolment) can't both succeed; a reset or a password change in between makes a check fail; the
 * failure budget holds on the shared limiter store.
 */

const alerts = vi.hoisted(() => ({ notifyOperator: vi.fn(async () => {}) }))
vi.mock("@/lib/operator-alerts", () => alerts)

import { prisma } from "@/lib/prisma"
import { postgresStore } from "@/lib/rate-limit"
import { base32Decode, hotp, timeStep } from "@/lib/totp"
import {
  beginSecondFactorAttempt, confirmEnrolment, pendingEnrolmentSecret, regenerateRecoveryCodes, resetSecondFactor,
  secondFactorStatus, SECOND_FACTOR_MAX_PER_ACCOUNT, verifySecondFactor, type SecondFactorAccount,
} from "@/lib/second-factor-server"

const url = process.env.DATABASE_URL
const tag = `int-2fa-${Date.now()}`

describe.skipIf(!url)("super admin second factor on Postgres", () => {
  let account: SecondFactorAccount
  let secret = ""
  let codes: string[] = []
  const now = Date.now()
  const step = timeStep(now)
  const codeAt = (s: number) => hotp(base32Decode(secret), s)

  beforeAll(async () => {
    vi.stubEnv("TOKEN_ENCRYPTION_KEY", randomBytes(32).toString("base64"))
    vi.stubEnv("TOKEN_ENCRYPTION_KEY_ID", "int")
    const admin = await prisma.adminUser.create({ data: { email: `${tag}@example.org`, name: "Opérateur", passwordHash: "x", role: "super_admin" } })
    account = { id: admin.id, email: admin.email, role: admin.role, sessionVersion: admin.sessionVersion, isActive: true }
  })

  afterAll(async () => {
    vi.unstubAllEnvs()
    await prisma.adminUser.deleteMany({ where: { email: { startsWith: tag } } })
    await prisma.rateLimit.deleteMany({ where: { key: { contains: tag } } })
    await prisma.$disconnect()
  })

  it("offers the same pending secret until it is confirmed, stored encrypted", async () => {
    secret = (await pendingEnrolmentSecret(account.id, now))!
    expect(secret).toMatch(/^[A-Z2-7]{32}$/)
    expect(await pendingEnrolmentSecret(account.id, now + 60_000)).toBe(secret)
    const row = await prisma.adminUser.findUniqueOrThrow({ where: { id: account.id }, select: { totpPendingSecretEnc: true, totpSecretEnc: true } })
    expect(row.totpPendingSecretEnc).toMatch(/^v2:int:/)
    expect(row.totpPendingSecretEnc).not.toContain(secret)
    expect(row.totpSecretEnc).toBeNull()
  })

  it("drops a pending secret offered before a password change (a QR code seen earlier keeps nothing)", async () => {
    const other = await prisma.adminUser.create({ data: { email: `${tag}-reset@example.org`, name: "Autre", passwordHash: "x", role: "super_admin" } })
    const before = (await pendingEnrolmentSecret(other.id, now))!
    await prisma.adminUser.update({ where: { id: other.id }, data: { sessionVersion: { increment: 1 } } })
    const stale = { id: other.id, email: other.email, role: other.role, sessionVersion: other.sessionVersion + 1, isActive: true }
    expect(await confirmEnrolment(stale, hotp(base32Decode(before), step), now)).toEqual({ ok: false, reason: "expired" })
    const after = await pendingEnrolmentSecret(other.id, now)
    expect(after).not.toBe(before)
  })

  it("enrols once when two confirmations race with the same code", async () => {
    const results = await Promise.all([confirmEnrolment(account, codeAt(step), now), confirmEnrolment(account, codeAt(step), now)])
    expect(results.filter((r) => r.ok)).toHaveLength(1)
    codes = (results.find((r) => r.ok) as { recoveryCodes: string[] }).recoveryCodes
    expect(codes).toHaveLength(10)
    const row = await prisma.adminUser.findUniqueOrThrow({ where: { id: account.id }, select: { totpSecretEnc: true, totpPendingSecretEnc: true, totpLastUsedStep: true } })
    expect(row.totpSecretEnc).toMatch(/^v2:int:/)
    expect(row.totpPendingSecretEnc).toBeNull()
    expect(row.totpLastUsedStep).toBe(step)
    const stored = await prisma.adminRecoveryCode.findMany({ where: { adminUserId: account.id } })
    expect(stored).toHaveLength(10)
    for (const c of codes) expect(stored.some((s) => s.codeHash.includes(c.replace(/-/g, "")))).toBe(false)
    expect(alerts.notifyOperator).toHaveBeenCalledTimes(1)
  })

  it("never accepts the enrolment code again, and accepts a newer one only once under a race", async () => {
    expect(await verifySecondFactor(account, { code: codeAt(step) }, now)).toEqual({ ok: false, reason: "invalid" })
    const results = await Promise.all([1, 2, 3].map(() => verifySecondFactor(account, { code: codeAt(step + 1) }, now)))
    expect(results.filter((r) => r.ok)).toHaveLength(1)
    // An older step is refused too, though still inside the window.
    expect((await verifySecondFactor(account, { code: codeAt(step - 1) }, now)).ok).toBe(false)
  })

  it("spends a recovery code once, whatever the race or the way it is typed", async () => {
    const typed = codes[0].toUpperCase().replace(/-/g, " ")
    const results = await Promise.all([verifySecondFactor(account, { recoveryCode: typed }, now), verifySecondFactor(account, { recoveryCode: codes[0] }, now)])
    expect(results.filter((r) => r.ok)).toHaveLength(1)
    expect((await secondFactorStatus(account.id)).recoveryCodesLeft).toBe(9)
  })

  it("regenerates the recovery codes with a fresh code: the old ones stop working", async () => {
    const fresh = await regenerateRecoveryCodes(account, codeAt(step + 1), now + 30_000)
    // step + 1 is spent already: refused, nothing replaced.
    expect(fresh.ok).toBe(false)
    const later = now + 60_000
    const ok = await regenerateRecoveryCodes(account, hotp(base32Decode(secret), timeStep(later)), later)
    expect(ok.ok).toBe(true)
    expect((await verifySecondFactor(account, { recoveryCode: codes[1] }, later)).ok).toBe(false)
    expect((await secondFactorStatus(account.id)).recoveryCodesLeft).toBe(10)
  })

  it("refuses a code for a session opened before a password change", async () => {
    const stale = { ...account, sessionVersion: account.sessionVersion - 1 }
    const later = now + 120_000
    expect((await verifySecondFactor(stale, { code: hotp(base32Decode(secret), timeStep(later)) }, later)).ok).toBe(false)
  })

  it("break-glass reset clears everything and ends the sessions, in one go", async () => {
    expect(await resetSecondFactor(`${tag}@EXAMPLE.org`, now)).toEqual({ ok: true, email: `${tag}@example.org` })
    const row = await prisma.adminUser.findUniqueOrThrow({ where: { id: account.id } })
    expect(row).toMatchObject({ totpSecretEnc: null, totpPendingSecretEnc: null, totpEnabledAt: null, totpLastUsedStep: null, sessionVersion: account.sessionVersion + 1 })
    expect(await prisma.adminRecoveryCode.count({ where: { adminUserId: account.id } })).toBe(0)
    expect(await resetSecondFactor("nobody@example.org", now)).toEqual({ ok: false, reason: "not_found" })
  })

  it("holds the failure budget on the shared store", async () => {
    const id = `${tag}-budget`
    const results = await Promise.all(Array.from({ length: SECOND_FACTOR_MAX_PER_ACCOUNT + 3 }, (_, i) => beginSecondFactorAttempt(id, `${tag}-ip-${i}`, postgresStore)))
    expect(results.filter((r) => r.allowed)).toHaveLength(SECOND_FACTOR_MAX_PER_ACCOUNT)
    await prisma.rateLimit.deleteMany({ where: { key: { contains: id } } })
  })
})
