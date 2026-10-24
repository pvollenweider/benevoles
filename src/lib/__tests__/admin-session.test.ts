import { describe, it, expect, vi, beforeEach } from "vitest"

const findUnique = vi.hoisted(() => vi.fn())
vi.mock("../prisma", () => ({ prisma: { adminUser: { findUnique } } }))

import { refreshAdminToken, beginLoginAttempt, loginDelayMs, LOGIN_DELAY_MAX_MS } from "../admin-session"
import { memoryStore, type RateLimitStore } from "../rate-limit"

const token = () => ({ sub: "admin-1", role: "admin", organizationId: "org-A" })

describe("refreshAdminToken (#266)", () => {
  beforeEach(() => findUnique.mockReset())

  it("keeps the session of an active admin", async () => {
    findUnique.mockResolvedValue({ sessionVersion: 0, isActive: true, role: "admin", organizationId: "org-A", organization: { active: true } })
    expect(await refreshAdminToken(token())).toMatchObject({ sub: "admin-1", role: "admin", organizationId: "org-A" })
  })

  it("ends the session of an admin deactivated after login", async () => {
    findUnique.mockResolvedValue({ sessionVersion: 0, isActive: false, role: "admin", organizationId: "org-A", organization: { active: true } })
    expect(await refreshAdminToken(token())).toBeNull()
  })

  it("ends the session of an admin removed after login", async () => {
    findUnique.mockResolvedValue(null)
    expect(await refreshAdminToken(token())).toBeNull()
  })

  it("ends the session of an org admin whose organization was disabled", async () => {
    findUnique.mockResolvedValue({ sessionVersion: 0, isActive: true, role: "admin", organizationId: "org-A", organization: { active: false } })
    expect(await refreshAdminToken(token())).toBeNull()
  })

  it("ends the session of an org admin whose organization is suspended, even if left active", async () => {
    findUnique.mockResolvedValue({ sessionVersion: 0, isActive: true, role: "admin", organizationId: "org-A", organization: { active: true, suspendedAt: new Date() } })
    expect(await refreshAdminToken(token())).toBeNull()
  })

  it("applies a role or organization change without re-login", async () => {
    findUnique.mockResolvedValue({ sessionVersion: 0, isActive: true, role: "super_admin", organizationId: null, organization: null })
    expect(await refreshAdminToken(token())).toMatchObject({ role: "super_admin", organizationId: null })
  })

  it("rejects a token without a subject", async () => {
    expect(await refreshAdminToken({})).toBeNull()
    expect(findUnique).not.toHaveBeenCalled()
  })
})

describe("session version (#360)", () => {
  beforeEach(() => findUnique.mockReset())
  const active = (sessionVersion: number) => ({ sessionVersion, isActive: true, role: "admin", organizationId: "org-A", organization: { active: true } })

  it("keeps a session whose version matches the account's", async () => {
    findUnique.mockResolvedValue(active(2))
    expect(await refreshAdminToken({ ...token(), sessionVersion: 2 })).not.toBeNull()
  })

  it("ends a session opened before a password change or reset", async () => {
    findUnique.mockResolvedValue(active(3))
    expect(await refreshAdminToken({ ...token(), sessionVersion: 2 })).toBeNull()
  })

  it("treats a token issued before versions existed as version 0", async () => {
    findUnique.mockResolvedValue(active(0))
    expect(await refreshAdminToken(token())).not.toBeNull()
    findUnique.mockResolvedValue(active(1))
    expect(await refreshAdminToken(token())).toBeNull()
  })
})

describe("session follows the account's email and name", () => {
  beforeEach(() => findUnique.mockReset())

  it("reloads them on every refresh, e.g. after an email change on the profile page", async () => {
    findUnique.mockResolvedValue({ sessionVersion: 0, isActive: true, role: "super_admin", organizationId: null, organization: null, email: "new@x.ch", name: "Nouveau nom" })
    const refreshed = await refreshAdminToken({ ...token(), email: "old@x.ch", name: "Ancien nom" })
    expect(refreshed).toMatchObject({ email: "new@x.ch", name: "Nouveau nom" })
  })
})

describe("login failure budget (#266, #1048)", () => {
  /** One failed attempt: reserved, never given back. */
  const fail = async (ip: string, email: string, store: RateLimitStore) => (await beginLoginAttempt(ip, email, store)).allowed

  it("blocks an address after 10 failures on one account, whatever the email case", async () => {
    const store = memoryStore()
    for (let i = 0; i < 10; i++) expect(await fail("10.0.0.1", "Target@x.com", store)).toBe(true)
    expect(await fail("10.0.0.1", "target@x.com", store)).toBe(false)
  })

  it("never locks the account's owner out from another address (regression #1048)", async () => {
    const store = memoryStore()
    // A stranger fails 10 times from each of several addresses...
    for (let n = 0; n < 4; n++) for (let i = 0; i < 10; i++) await fail(`198.51.100.${n}`, "admin@x.com", store)
    // ...the owner, from their own address, is still let in (only made to wait).
    const owner = await beginLoginAttempt("203.0.113.7", "admin@x.com", store)
    expect(owner.allowed).toBe(true)
    expect(owner.delayMs).toBe(LOGIN_DELAY_MAX_MS)
  })

  it("blocks an address after 30 failures across accounts", async () => {
    const store = memoryStore()
    for (let i = 0; i < 30; i++) expect(await fail("10.0.0.2", `user${i}@x.com`, store)).toBe(true)
    expect(await fail("10.0.0.2", "fresh@x.com", store)).toBe(false)
    expect(await fail("10.0.0.3", "fresh@x.com", store)).toBe(true)
  })

  it("doesn't count refused retries against the address's budget for other accounts", async () => {
    const store = memoryStore()
    for (let i = 0; i < 10; i++) await fail("10.4.4.4", "a@x.com", store)
    // Refused retries on the blocked account...
    for (let i = 0; i < 40; i++) expect(await fail("10.4.4.4", "a@x.com", store)).toBe(false)
    // ...leave the colleague behind the same address able to sign in.
    expect((await beginLoginAttempt("10.4.4.4", "b@x.com", store)).allowed).toBe(true)
  })

  it("makes the account wait more after each failure from any address", async () => {
    const store = memoryStore()
    const delays: number[] = []
    for (let i = 0; i < 9; i++) delays.push((await beginLoginAttempt(`10.1.0.${i}`, "slow@x.com", store)).delayMs)
    expect(delays).toEqual([0, 0, 0, 0, 0, 1000, 2000, 4000, 8000])
  })

  it("doesn't count successful logins", async () => {
    const store = memoryStore()
    for (let i = 0; i < 50; i++) {
      const attempt = await beginLoginAttempt("10.9.9.9", "ok@x.com", store)
      expect(attempt).toMatchObject({ allowed: true, delayMs: 0 })
      await attempt.succeeded()
    }
  })

  it("counts parallel attempts before any password is checked", async () => {
    const store = memoryStore()
    const attempts = await Promise.all(Array.from({ length: 15 }, () => beginLoginAttempt("10.2.2.2", "race@x.com", store)))
    expect(attempts.filter((a) => a.allowed)).toHaveLength(10)
  })

  it("lets the login through when the store fails", async () => {
    const broken: RateLimitStore = { hit: () => Promise.reject(new Error("db down")), peek: () => Promise.reject(new Error("db down")) }
    const attempt = await beginLoginAttempt("10.3.3.3", "x@x.com", broken)
    expect(attempt).toMatchObject({ allowed: true, delayMs: 0 })
    await attempt.succeeded()
  })
})

describe("loginDelayMs", () => {
  it("waits from the sixth failure, doubling up to 8 s", () => {
    expect([0, 4, 5, 6, 7, 8, 20].map(loginDelayMs)).toEqual([0, 0, 1000, 2000, 4000, 8000, 8000])
  })
})
