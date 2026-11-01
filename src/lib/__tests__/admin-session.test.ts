import { describe, it, expect, vi, beforeEach } from "vitest"

const findUnique = vi.hoisted(() => vi.fn())
const revoked = vi.hoisted(() => ({ findUnique: vi.fn(), upsert: vi.fn() }))
const reported = vi.hoisted(() => vi.fn())
vi.mock("../prisma", () => ({ prisma: { adminUser: { findUnique }, revokedSession: revoked } }))
vi.mock("../report-error", () => ({ reportError: (label: string) => (e: unknown) => reported(label, e) }))

import { refreshAdminToken, revokeSession, beginLoginAttempt, loginDelayMs, LOGIN_DELAY_MAX_MS } from "../admin-session"
import { memoryStore, type RateLimitStore } from "../rate-limit"
import { memoryLoginSlots, type LoginSlotStore } from "../login-slot"

const token = () => ({ sub: "admin-1", role: "admin", organizationId: "org-A", sid: "session-1", authTime: 1_790_000_000 })

beforeEach(() => {
  revoked.findUnique.mockReset().mockResolvedValue(null)
  revoked.upsert.mockReset().mockResolvedValue({})
  reported.mockReset()
})

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

  it("rejects a token without a session id, issued before sign-out could revoke it", async () => {
    findUnique.mockResolvedValue({ sessionVersion: 0, isActive: true, role: "admin", organizationId: "org-A", organization: { active: true } })
    expect(await refreshAdminToken({ ...token(), sid: undefined })).toBeNull()
  })
})

describe("sign-out revokes the session on the server (pentest F2)", () => {
  beforeEach(() => findUnique.mockReset())
  const active = { sessionVersion: 0, isActive: true, role: "admin", organizationId: "org-A", organization: { active: true } }

  it("refuses a copy of the cookie once its session id is revoked", async () => {
    findUnique.mockResolvedValue(active)
    expect(await refreshAdminToken(token())).not.toBeNull()
    revoked.findUnique.mockResolvedValue({ sid: "session-1" })
    expect(await refreshAdminToken(token())).toBeNull()
    expect(revoked.findUnique).toHaveBeenLastCalledWith({ where: { sid: "session-1" }, select: { sid: true } })
  })

  it("leaves the person's other sessions open", async () => {
    findUnique.mockResolvedValue(active)
    revoked.findUnique.mockImplementation(async ({ where }: { where: { sid: string } }) => (where.sid === "session-1" ? { sid: "session-1" } : null))
    expect(await refreshAdminToken({ ...token(), sid: "session-2" })).not.toBeNull()
  })

  it("records the id until the session's absolute end, idempotently", async () => {
    await revokeSession({ sid: "session-1", authTime: 1_790_000_000 })
    expect(revoked.upsert).toHaveBeenCalledWith({
      where: { sid: "session-1" },
      create: { sid: "session-1", expiresAt: new Date((1_790_000_000 + 30 * 86_400) * 1000) },
      update: {},
    })
  })

  it("does nothing for a token without a session id", async () => {
    await revokeSession({})
    await revokeSession(null)
    expect(revoked.upsert).not.toHaveBeenCalled()
  })

  it("reports a failed write instead of throwing (next-auth clears the cookie anyway)", async () => {
    revoked.upsert.mockRejectedValue(new Error("db down"))
    await expect(revokeSession({ sid: "session-1", authTime: 1_790_000_000 })).resolves.toBeUndefined()
    expect(reported).toHaveBeenCalledWith("session.revoke", expect.any(Error))
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

/** A slot store on a clock the test moves forward by hand. */
function clockedSlots(): { slots: LoginSlotStore; advance: (ms: number) => void } {
  let now = 1_000_000
  return { slots: memoryLoginSlots(() => now), advance: (ms) => { now += ms } }
}

describe("login failure budget (#266, #1048)", () => {
  /** Slots always free: these tests are about the address budgets, not the account's slot. */
  const freeSlots: LoginSlotStore = { claim: async (_key, delayMs) => delayMs }
  /** One failed attempt: reserved, never given back. */
  const fail = async (ip: string, email: string, store: RateLimitStore) => (await beginLoginAttempt(ip, email, store, freeSlots)).allowed

  it("blocks an address after 10 failures on one account, whatever the email case", async () => {
    const store = memoryStore()
    for (let i = 0; i < 10; i++) expect(await fail("10.0.0.1", "Target@x.com", store)).toBe(true)
    expect(await fail("10.0.0.1", "target@x.com", store)).toBe(false)
  })

  it("never locks the account's owner out from another address (regression #1048)", async () => {
    const store = memoryStore()
    const { slots, advance } = clockedSlots()
    // A stranger fails 10 times from each of several addresses, one after the other...
    for (let n = 0; n < 4; n++) for (let i = 0; i < 10; i++) {
      const attempt = await beginLoginAttempt(`198.51.100.${n}`, "admin@x.com", store, slots)
      expect(attempt.allowed).toBe(true)
      advance(attempt.delayMs)
    }
    // ...the owner, from their own address, is still let in (only made to wait).
    const owner = await beginLoginAttempt("203.0.113.7", "admin@x.com", store, slots)
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
    expect((await beginLoginAttempt("10.4.4.4", "b@x.com", store, freeSlots)).allowed).toBe(true)
  })

  it("makes the account wait more after each failure from any address", async () => {
    const store = memoryStore()
    const { slots, advance } = clockedSlots()
    const delays: number[] = []
    for (let i = 0; i < 9; i++) {
      const attempt = await beginLoginAttempt(`10.1.0.${i}`, "slow@x.com", store, slots)
      delays.push(attempt.delayMs)
      advance(attempt.delayMs)
    }
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
    const attempts = await Promise.all(Array.from({ length: 15 }, () => beginLoginAttempt("10.2.2.2", "race@x.com", store, freeSlots)))
    expect(attempts.filter((a) => a.allowed)).toHaveLength(10)
  })

  it("refuses the login while the store fails: password guessing never gets an unlimited budget", async () => {
    const broken: RateLimitStore = { hit: () => Promise.reject(new Error("db down")), peek: () => Promise.reject(new Error("db down")) }
    const attempt = await beginLoginAttempt("10.3.3.3", "x@x.com", broken)
    expect(attempt).toMatchObject({ allowed: false })
  })
})

describe("one password check at a time once the account waits (pentest F4)", () => {
  /** Five failures on the account from five addresses: the next attempt has to wait. */
  async function failFiveTimes(email: string, store: RateLimitStore, slots: LoginSlotStore) {
    for (let i = 0; i < 5; i++) expect((await beginLoginAttempt(`192.0.2.${i}`, email, store, slots)).delayMs).toBe(0)
  }

  it("lets one of two concurrent attempts through and refuses the other, never both", async () => {
    const store = memoryStore()
    const { slots } = clockedSlots()
    await failFiveTimes("pair@x.com", store, slots)
    const [a, b] = await Promise.all([
      beginLoginAttempt("198.51.100.1", "pair@x.com", store, slots),
      beginLoginAttempt("198.51.100.2", "pair@x.com", store, slots),
    ])
    expect([a.allowed, b.allowed].sort()).toEqual([false, true])
  })

  it("checks one of 25 parallel attempts from 25 addresses, and gives the refused ones their budget back", async () => {
    const store = memoryStore()
    const { slots } = clockedSlots()
    await failFiveTimes("crowd@x.com", store, slots)
    const attempts = await Promise.all(Array.from({ length: 25 }, (_, i) => beginLoginAttempt(`203.0.113.${i}`, "crowd@x.com", store, slots)))
    expect(attempts.filter((a) => a.allowed)).toHaveLength(1)
    // Refused attempts checked nothing: only the five failures and the one allowed attempt count.
    expect((await store.peek("login-account:crowd@x.com"))?.count).toBe(6)
    expect(await store.peek("login-ip:203.0.113.24")).toMatchObject({ count: 0 })
  })

  it("lets the next attempt through once the slot has passed, and a refused one doesn't move it", async () => {
    const store = memoryStore()
    const { slots, advance } = clockedSlots()
    await failFiveTimes("slot@x.com", store, slots)
    const first = await beginLoginAttempt("198.51.100.1", "slot@x.com", store, slots)
    expect(first).toMatchObject({ allowed: true, delayMs: 1000 })
    advance(500)
    expect((await beginLoginAttempt("198.51.100.2", "slot@x.com", store, slots)).allowed).toBe(false)
    advance(500)
    expect((await beginLoginAttempt("198.51.100.3", "slot@x.com", store, slots))).toMatchObject({ allowed: true, delayMs: 2000 })
  })

  it("treats an address with no account exactly like one with an account", async () => {
    for (const email of ["admin@x.com", "nobody-here@x.com"]) {
      const store = memoryStore()
      const { slots } = clockedSlots()
      await failFiveTimes(email, store, slots)
      const both = await Promise.all([beginLoginAttempt("198.51.100.1", email, store, slots), beginLoginAttempt("198.51.100.2", email, store, slots)])
      expect(both.map((a) => a.allowed).sort()).toEqual([false, true])
    }
  })

  it("claims no slot while the account doesn't wait yet", async () => {
    const store = memoryStore()
    const claim = vi.fn(async () => 0)
    const attempts = await Promise.all(Array.from({ length: 5 }, (_, i) => beginLoginAttempt(`192.0.2.${i}`, "fresh@x.com", store, { claim })))
    expect(attempts.every((a) => a.allowed && a.delayMs === 0)).toBe(true)
    expect(claim).not.toHaveBeenCalled()
  })

  it("lets the attempt through after its wait when the slot store fails", async () => {
    const store = memoryStore()
    const { slots } = clockedSlots()
    await failFiveTimes("broken@x.com", store, slots)
    const attempt = await beginLoginAttempt("198.51.100.1", "broken@x.com", store, { claim: () => Promise.reject(new Error("db down")) })
    expect(attempt).toMatchObject({ allowed: true, delayMs: 1000 })
    expect(reported).toHaveBeenCalledWith("login_slot.claim", expect.any(Error))
  })
})

describe("loginDelayMs", () => {
  it("waits from the sixth failure, doubling up to 8 s", () => {
    expect([0, 4, 5, 6, 7, 8, 20].map(loginDelayMs)).toEqual([0, 0, 1000, 2000, 4000, 8000, 8000])
  })
})

describe("login budget while the rate-limit store fails", () => {
  it("refuses when only the counting fails, after a successful read", async () => {
    const base = memoryStore()
    const store = { peek: base.peek, hit: () => Promise.reject(new Error("db down")), release: base.release }
    const attempt = await beginLoginAttempt("1.2.3.4", "ana@example.org", store)
    expect(attempt.allowed).toBe(false)
  })
})

