import { describe, it, expect } from "vitest"
import { applySecondFactor, ENROLMENT_PASSWORD_MAX_AGE_MS, passwordRecentEnough, SECOND_FACTOR_MAX_AGE_MS, secondFactorPending, secondFactorUrl, signInClaims } from "../second-factor-session"

// Pentest F6: when a session still owes its second factor, and what it then hides.
const NOW = 1_800_000_000_000

describe("secondFactorPending", () => {
  const done = { role: "super_admin", loginNonce: "n1", authAt: NOW - 60_000, secondFactorAt: NOW - 30_000 }

  it("is pending for a super admin who only gave the password", () => {
    expect(secondFactorPending({ role: "super_admin", loginNonce: "n1", authAt: NOW }, NOW)).toBe(true)
  })

  it("is pending for a session issued before the second factor existed (no nonce, no check)", () => {
    expect(secondFactorPending({ role: "super_admin" }, NOW)).toBe(true)
    expect(secondFactorPending({ role: "super_admin", secondFactorAt: NOW }, NOW)).toBe(true)
  })

  it("is done after a check, for 12 hours, then pending again", () => {
    expect(secondFactorPending(done, NOW)).toBe(false)
    expect(secondFactorPending(done, done.secondFactorAt + SECOND_FACTOR_MAX_AGE_MS - 1)).toBe(false)
    expect(secondFactorPending(done, done.secondFactorAt + SECOND_FACTOR_MAX_AGE_MS)).toBe(true)
  })

  it("doesn't count a check older than the sign-in, or one dated in the future", () => {
    expect(secondFactorPending({ ...done, secondFactorAt: done.authAt - 1 }, NOW)).toBe(true)
    expect(secondFactorPending({ ...done, secondFactorAt: NOW + 120_000 }, NOW)).toBe(true)
  })

  it("never applies to organisation admins", () => {
    expect(secondFactorPending({ role: "admin" }, NOW)).toBe(false)
    expect(secondFactorPending({ role: "organizer" }, NOW)).toBe(false)
    expect(secondFactorPending({}, NOW)).toBe(false)
  })
})

describe("signInClaims", () => {
  it("gives every password sign-in a new nonce, its time, and drops an earlier check", () => {
    const token = signInClaims({ role: "super_admin", secondFactorAt: NOW - 1000, loginNonce: "old" } as Record<string, unknown> & { secondFactorAt?: number; loginNonce?: string; authAt?: number }, NOW)
    expect(token.loginNonce).toMatch(/^[0-9a-f]{32}$/)
    expect(token.loginNonce).not.toBe("old")
    expect(token.authAt).toBe(NOW)
    expect(token.secondFactorAt).toBeUndefined()
  })
})

describe("applySecondFactor", () => {
  it("withholds the role and organization of a pending session, so every role check fails closed", () => {
    const session = applySecondFactor({ user: { role: "super_admin", organizationId: null as string | null } }, { role: "super_admin", loginNonce: "n1", authAt: NOW }, NOW)
    expect(session.user.role).toBeUndefined()
    expect(session.user.organizationId).toBeNull()
    expect(session.secondFactor).toEqual({ pending: true, loginNonce: "n1", authAt: NOW })
  })

  it("leaves a completed session and organisation admins as they are", () => {
    const sa = applySecondFactor({ user: { role: "super_admin", organizationId: null as string | null } }, { role: "super_admin", loginNonce: "n1", authAt: NOW - 10, secondFactorAt: NOW }, NOW)
    expect(sa.user.role).toBe("super_admin")
    expect(sa.secondFactor?.pending).toBe(false)
    const owner = applySecondFactor({ user: { role: "admin", organizationId: "org-1" as string | null } }, { role: "admin", loginNonce: "n2", authAt: NOW }, NOW)
    expect(owner.user).toEqual({ role: "admin", organizationId: "org-1" })
    expect(owner.secondFactor?.pending).toBe(false)
  })
})

describe("passwordRecentEnough", () => {
  it("lets a sign-in of the last hour enrol, not an older or undated one", () => {
    expect(passwordRecentEnough(NOW - 1000, NOW)).toBe(true)
    expect(passwordRecentEnough(NOW - ENROLMENT_PASSWORD_MAX_AGE_MS, NOW)).toBe(false)
    expect(passwordRecentEnough(null, NOW)).toBe(false)
    expect(passwordRecentEnough(NOW + 5000, NOW)).toBe(false)
  })
})

describe("secondFactorUrl", () => {
  it("carries a same-site path back, never another site", () => {
    expect(secondFactorUrl("/super-admin/organizations?x=1")).toBe("/admin/two-factor?callbackUrl=%2Fsuper-admin%2Forganizations%3Fx%3D1")
    expect(secondFactorUrl("//evil.example/x")).toBe("/admin/two-factor")
    expect(secondFactorUrl("https://evil.example")).toBe("/admin/two-factor")
    expect(secondFactorUrl(null)).toBe("/admin/two-factor")
  })
})
