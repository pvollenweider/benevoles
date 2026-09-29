import { describe, it, expect, vi, beforeEach } from "vitest"

const findUnique = vi.hoisted(() => vi.fn())
vi.mock("../prisma", () => ({ prisma: { adminUser: { findUnique } } }))

import { refreshAdminToken, loginAllowed, recordLoginFailure } from "../admin-session"

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

describe("login failure budget (#266)", () => {
  it("blocks an account after 10 failures, whatever the IP and email case", async () => {
    const email = `Target-${Math.random()}@x.com`
    for (let i = 0; i < 10; i++) {
      expect(await loginAllowed(`10.0.0.${i}`, email)).toBe(true)
      await recordLoginFailure(`10.0.0.${i}`, email)
    }
    expect(await loginAllowed("10.0.1.1", email.toLowerCase())).toBe(false)
  })

  it("blocks an IP after 30 failures across accounts", async () => {
    const ip = `ip-${Math.random()}`
    for (let i = 0; i < 30; i++) await recordLoginFailure(ip, `user${i}-${Math.random()}@x.com`)
    expect(await loginAllowed(ip, "fresh@x.com")).toBe(false)
    expect(await loginAllowed(`other-${ip}`, "fresh@x.com")).toBe(true)
  })

  it("doesn't count successful logins (only failures are recorded)", async () => {
    const email = `ok-${Math.random()}@x.com`
    for (let i = 0; i < 50; i++) expect(await loginAllowed("10.9.9.9", email)).toBe(true)
  })
})
