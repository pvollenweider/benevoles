import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { NextResponse } from "next/server"

// Pentest F6: the second step of a super admin's sign-in, and new recovery codes from the profile.

const m = vi.hoisted(() => ({
  auth: vi.fn(),
  update: vi.fn(),
  findUnique: vi.fn(),
  status: vi.fn(),
  begin: vi.fn(),
  verify: vi.fn(),
  confirm: vi.fn(),
  regenerate: vi.fn(),
  requireSuperAdmin: vi.fn(),
  succeeded: vi.fn(),
}))
vi.mock("@/auth", () => ({ auth: m.auth, unstable_update: m.update }))
vi.mock("@/lib/prisma", () => ({ prisma: { adminUser: { findUnique: m.findUnique } } }))
vi.mock("@/lib/auth-guard", () => ({ requireSuperAdmin: m.requireSuperAdmin }))
vi.mock("@/lib/operator-alerts", () => ({ notifyOperator: vi.fn() }))
vi.mock("@/lib/second-factor-server", async (orig) => ({
  ...(await orig<typeof import("@/lib/second-factor-server")>()),
  secondFactorStatus: m.status,
  beginSecondFactorAttempt: m.begin,
  verifySecondFactor: m.verify,
  confirmEnrolment: m.confirm,
  regenerateRecoveryCodes: m.regenerate,
}))

import { POST } from "@/app/api/admin/two-factor/route"
import { POST as regenerate } from "@/app/api/super-admin/two-factor/recovery-codes/route"
import { verifySecondFactorProof } from "@/lib/second-factor-proof"

const SECRET = "test-auth-secret-of-at-least-32-characters"
const account = { id: "sa-1", email: "operator@example.org", role: "super_admin", sessionVersion: 2, isActive: true }
const pendingSession = (authAt = Date.now() - 60_000, loginNonce: string | null = "nonce-1") =>
  ({ user: { id: "sa-1" }, secondFactor: { pending: true, loginNonce, authAt } })

const post = (body: unknown) => POST(new Request("http://localhost/api/admin/two-factor", { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": "10.0.0.1" }, body: JSON.stringify(body) }))

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv("AUTH_SECRET", SECRET)
  m.auth.mockResolvedValue(pendingSession())
  m.findUnique.mockResolvedValue(account)
  m.status.mockResolvedValue({ enrolled: true, enabledAt: new Date(), recoveryCodesLeft: 10 })
  m.begin.mockResolvedValue({ allowed: true, succeeded: m.succeeded })
  m.verify.mockResolvedValue({ ok: true })
  m.confirm.mockResolvedValue({ ok: true, recoveryCodes: ["a", "b"] })
  m.update.mockResolvedValue({ user: { id: "sa-1", role: "super_admin" }, secondFactor: { pending: false } })
})
afterEach(() => vi.unstubAllEnvs())

describe("POST /api/admin/two-factor", () => {
  it("refuses without a session, for a completed one, and for an account that doesn't give a second factor", async () => {
    m.auth.mockResolvedValueOnce(null)
    expect((await post({ code: "123456" })).status).toBe(401)
    m.auth.mockResolvedValueOnce({ user: { id: "sa-1" }, secondFactor: { pending: false } })
    expect((await post({ code: "123456" })).status).toBe(409)
    m.findUnique.mockResolvedValueOnce({ ...account, role: "admin" })
    expect((await post({ code: "123456" })).status).toBe(403)
    m.findUnique.mockResolvedValueOnce({ ...account, isActive: false })
    expect((await post({ code: "123456" })).status).toBe(403)
    expect(m.verify).not.toHaveBeenCalled()
  })

  it("asks a session from before the second factor (no nonce) to sign in again", async () => {
    m.auth.mockResolvedValue(pendingSession(Date.now(), null))
    const res = await post({ code: "123456" })
    expect(res.status).toBe(401)
    expect(await res.json()).toMatchObject({ code: "SIGN_IN_AGAIN" })
  })

  it("enrols only with a password checked within the hour", async () => {
    m.status.mockResolvedValue({ enrolled: false, enabledAt: null, recoveryCodesLeft: 0 })
    m.auth.mockResolvedValue(pendingSession(Date.now() - 2 * 60 * 60 * 1000))
    const old = await post({ code: "123456" })
    expect(old.status).toBe(401)
    expect(await old.json()).toMatchObject({ code: "SIGN_IN_AGAIN" })
    expect(m.confirm).not.toHaveBeenCalled()

    m.auth.mockResolvedValue(pendingSession())
    const res = await post({ code: "123456" })
    expect(res.status).toBe(200)
    expect(res.headers.get("cache-control")).toBe("no-store")
    expect(await res.json()).toMatchObject({ ok: true, recoveryCodes: ["a", "b"] })
    expect(m.confirm).toHaveBeenCalledWith(account, "123456", expect.any(Number))
  })

  it("doesn't accept a recovery code before enrolment", async () => {
    m.status.mockResolvedValue({ enrolled: false, enabledAt: null, recoveryCodesLeft: 0 })
    expect((await post({ recoveryCode: "abcd-efgh-jkmn-pqrs" })).status).toBe(400)
  })

  it("refuses with 429 once the failure budget is spent, before checking anything", async () => {
    m.begin.mockResolvedValue({ allowed: false, succeeded: vi.fn() })
    const res = await post({ code: "123456" })
    expect(res.status).toBe(429)
    expect(m.verify).not.toHaveBeenCalled()
  })

  it("answers a wrong code with 400, keeps the failure counted and never touches the session", async () => {
    m.verify.mockResolvedValue({ ok: false, reason: "invalid" })
    const res = await post({ code: "123456" })
    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/Code incorrect/)
    expect(m.succeeded).not.toHaveBeenCalled()
    expect(m.update).not.toHaveBeenCalled()
  })

  it("completes the session with a proof bound to this sign-in, and gives the attempt back", async () => {
    const res = await post({ code: "123456" })
    expect(res.status).toBe(200)
    expect(m.succeeded).toHaveBeenCalled()
    const data = m.update.mock.calls[0][0] as { secondFactorProof: string }
    expect(verifySecondFactorProof(data.secondFactorProof, { sub: "sa-1", sessionVersion: 2, loginNonce: "nonce-1" }, Date.now(), SECRET)).toBe(true)
    expect(verifySecondFactorProof(data.secondFactorProof, { sub: "sa-1", sessionVersion: 2, loginNonce: "nonce-2" }, Date.now(), SECRET)).toBe(false)
  })

  it("passes a recovery code on, and reports a session that didn't complete", async () => {
    await post({ recoveryCode: "abcd-efgh-jkmn-pqrs" })
    expect(m.verify).toHaveBeenCalledWith(account, { recoveryCode: "abcd-efgh-jkmn-pqrs" }, expect.any(Number))
    m.update.mockResolvedValue({ secondFactor: { pending: true } })
    expect((await post({ code: "123456" })).status).toBe(500)
  })

  it("refuses unexpected fields and oversized input", async () => {
    expect((await post({ code: "123456", secondFactorAt: 1 })).status).toBe(400)
    expect((await post({ code: "1".repeat(50) })).status).toBe(400)
    expect((await post(null)).status).toBe(400)
  })
})

describe("POST /api/super-admin/two-factor/recovery-codes", () => {
  const call = (body: unknown) => regenerate(new Request("http://localhost/api/super-admin/two-factor/recovery-codes", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }))

  beforeEach(() => {
    m.requireSuperAdmin.mockResolvedValue({ session: { user: { id: "sa-1", role: "super_admin" } } })
    m.regenerate.mockResolvedValue({ ok: true, recoveryCodes: ["x", "y"] })
  })

  it("is for a completed super admin session only (the guard's answer is returned as is)", async () => {
    m.requireSuperAdmin.mockResolvedValue(NextResponse.json({ error: "x", code: "SECOND_FACTOR_REQUIRED" }, { status: 401 }))
    expect((await call({ code: "123456" })).status).toBe(401)
    expect(m.regenerate).not.toHaveBeenCalled()
  })

  it("makes new codes for the caller's own account with a current code, answered without caching", async () => {
    const res = await call({ code: "123456" })
    expect(res.status).toBe(200)
    expect(res.headers.get("cache-control")).toBe("no-store")
    expect(await res.json()).toEqual({ ok: true, recoveryCodes: ["x", "y"] })
    expect(m.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "sa-1" } }))
    expect(m.regenerate).toHaveBeenCalledWith(account, "123456", expect.any(Number))
  })

  it("refuses a wrong code and a spent budget", async () => {
    m.regenerate.mockResolvedValue({ ok: false, reason: "invalid" })
    expect((await call({ code: "123456" })).status).toBe(400)
    m.begin.mockResolvedValue({ allowed: false, succeeded: vi.fn() })
    expect((await call({ code: "123456" })).status).toBe(429)
  })
})
