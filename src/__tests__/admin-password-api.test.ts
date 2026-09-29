import { describe, it, expect, vi, beforeEach } from "vitest"

// Changing one's own admin password (Mon compte): errors come back in French, displayable as is
// (CONTRIBUTING, API errors), and the new password is only stored once the current one matches.

const requireOrgSessionMock = vi.hoisted(() => vi.fn())
vi.mock("@/lib/auth-guard", () => ({ requireOrgSession: requireOrgSessionMock }))

const findUnique = vi.hoisted(() => vi.fn())
const update = vi.hoisted(() => vi.fn())
vi.mock("@/lib/prisma", () => ({ prisma: { adminUser: { findUnique, update } } }))

const compare = vi.hoisted(() => vi.fn())
vi.mock("bcryptjs", () => ({ default: { compare, hash: vi.fn().mockResolvedValue("$new") }, compare, hash: vi.fn().mockResolvedValue("$new") }))

const post = (body: unknown, ip = "203.0.113.1") => new Request("http://localhost/api/admin/settings/password", {
  method: "POST",
  headers: { "Content-Type": "application/json", "x-forwarded-for": ip },
  body: JSON.stringify(body),
})
// The rate limiter's in-memory test store persists across tests: one admin per test.
let adminId = "admin-1"
const asAdmin = (id: string) => {
  adminId = id
  requireOrgSessionMock.mockResolvedValue({ session: { user: { id } }, organizationId: "org-a" })
}

describe("POST /api/admin/settings/password", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    asAdmin(`admin-${Math.random()}`)
    findUnique.mockResolvedValue({ passwordHash: "$old" })
  })

  it("rejects a wrong current password, in French, without changing anything", async () => {
    compare.mockResolvedValue(false)
    const { POST } = await import("@/app/api/admin/settings/password/route")
    const res = await POST(post({ currentPassword: "nope", newPassword: "Nouveau-mot2passe" }))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe("Le mot de passe actuel est incorrect.")
    expect(update).not.toHaveBeenCalled()
  })

  it("lists the unmet rules in French, with the details for the form", async () => {
    const { POST } = await import("@/app/api/admin/settings/password/route")
    const res = await POST(post({ currentPassword: "ok", newPassword: "court" }))
    expect(res.status).toBe(400)
    const data = await res.json()
    expect(data.error).toMatch(/^Le nouveau mot de passe ne respecte pas les règles : .*10 caractères minimum/)
    expect(data.details.errors).toContain("10 caractères minimum")
    expect(update).not.toHaveBeenCalled()
  })

  it("stores the new password once the current one matches", async () => {
    compare.mockResolvedValue(true)
    const { POST } = await import("@/app/api/admin/settings/password/route")
    const res = await POST(post({ currentPassword: "ok", newPassword: "Nouveau-mot2passe" }))
    expect(res.status).toBe(200)
    // Signs out every session opened before the change (#360).
    expect(update).toHaveBeenCalledWith({ where: { id: adminId }, data: { passwordHash: "$new", sessionVersion: { increment: 1 } } })
  })

  it("blocks after 5 wrong current passwords on one account, without running bcrypt (#358)", async () => {
    compare.mockResolvedValue(false)
    const { POST } = await import("@/app/api/admin/settings/password/route")
    for (let i = 0; i < 5; i++) {
      expect((await POST(post({ currentPassword: "guess", newPassword: "Nouveau-mot2passe" }, `198.51.100.${i}`))).status).toBe(400)
    }
    compare.mockClear()
    const res = await POST(post({ currentPassword: "right", newPassword: "Nouveau-mot2passe" }, "198.51.100.99"))
    expect(res.status).toBe(429)
    expect((await res.json()).error).toContain("Trop de tentatives")
    expect(compare).not.toHaveBeenCalled()
    expect(update).not.toHaveBeenCalled()
  })

  it("blocks an IP after 20 failures across accounts (#358)", async () => {
    compare.mockResolvedValue(false)
    const { POST } = await import("@/app/api/admin/settings/password/route")
    const ip = `192.0.2.${Math.floor(Math.random() * 200)}`
    for (let i = 0; i < 20; i++) {
      asAdmin(`spray-${i}-${Math.random()}`)
      await POST(post({ currentPassword: "guess", newPassword: "Nouveau-mot2passe" }, ip))
    }
    asAdmin(`fresh-${Math.random()}`)
    expect((await POST(post({ currentPassword: "guess", newPassword: "Nouveau-mot2passe" }, ip))).status).toBe(429)
  })

  it("doesn't count successful checks", async () => {
    compare.mockResolvedValue(true)
    const { POST } = await import("@/app/api/admin/settings/password/route")
    for (let i = 0; i < 8; i++) {
      expect((await POST(post({ currentPassword: "right", newPassword: "Nouveau-mot2passe" }))).status).toBe(200)
    }
  })
})
