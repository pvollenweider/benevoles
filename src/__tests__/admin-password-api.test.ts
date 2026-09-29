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

const post = (body: unknown) => new Request("http://localhost/api/admin/settings/password", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
})

describe("POST /api/admin/settings/password", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    requireOrgSessionMock.mockResolvedValue({ session: { user: { id: "admin-1" } }, organizationId: "org-a" })
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
    expect(update).toHaveBeenCalledWith({ where: { id: "admin-1" }, data: { passwordHash: "$new" } })
  })
})
