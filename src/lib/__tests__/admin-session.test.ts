import { describe, it, expect, vi, beforeEach } from "vitest"

const findUnique = vi.hoisted(() => vi.fn())
vi.mock("../prisma", () => ({ prisma: { adminUser: { findUnique } } }))

import { refreshAdminToken, loginAllowed, recordLoginFailure } from "../admin-session"

const token = () => ({ sub: "admin-1", role: "admin", organizationId: "org-A" })

describe("refreshAdminToken (#266)", () => {
  beforeEach(() => findUnique.mockReset())

  it("keeps the session of an active admin", async () => {
    findUnique.mockResolvedValue({ isActive: true, role: "admin", organizationId: "org-A", organization: { active: true } })
    expect(await refreshAdminToken(token())).toMatchObject({ sub: "admin-1", role: "admin", organizationId: "org-A" })
  })

  it("ends the session of an admin deactivated after login", async () => {
    findUnique.mockResolvedValue({ isActive: false, role: "admin", organizationId: "org-A", organization: { active: true } })
    expect(await refreshAdminToken(token())).toBeNull()
  })

  it("ends the session of an admin removed after login", async () => {
    findUnique.mockResolvedValue(null)
    expect(await refreshAdminToken(token())).toBeNull()
  })

  it("ends the session of an org admin whose organization was disabled", async () => {
    findUnique.mockResolvedValue({ isActive: true, role: "admin", organizationId: "org-A", organization: { active: false } })
    expect(await refreshAdminToken(token())).toBeNull()
  })

  it("applies a role or organization change without re-login", async () => {
    findUnique.mockResolvedValue({ isActive: true, role: "super_admin", organizationId: null, organization: null })
    expect(await refreshAdminToken(token())).toMatchObject({ role: "super_admin", organizationId: null })
  })

  it("rejects a token without a subject", async () => {
    expect(await refreshAdminToken({})).toBeNull()
    expect(findUnique).not.toHaveBeenCalled()
  })
})

describe("login failure budget (#266)", () => {
  it("blocks an account after 10 failures, whatever the IP and email case", () => {
    const email = `Target-${Math.random()}@x.com`
    for (let i = 0; i < 10; i++) {
      expect(loginAllowed(`10.0.0.${i}`, email)).toBe(true)
      recordLoginFailure(`10.0.0.${i}`, email)
    }
    expect(loginAllowed("10.0.1.1", email.toLowerCase())).toBe(false)
  })

  it("blocks an IP after 30 failures across accounts", () => {
    const ip = `ip-${Math.random()}`
    for (let i = 0; i < 30; i++) recordLoginFailure(ip, `user${i}-${Math.random()}@x.com`)
    expect(loginAllowed(ip, "fresh@x.com")).toBe(false)
    expect(loginAllowed(`other-${ip}`, "fresh@x.com")).toBe(true)
  })

  it("doesn't count successful logins (only failures are recorded)", () => {
    const email = `ok-${Math.random()}@x.com`
    for (let i = 0; i < 50; i++) expect(loginAllowed("10.9.9.9", email)).toBe(true)
  })
})
