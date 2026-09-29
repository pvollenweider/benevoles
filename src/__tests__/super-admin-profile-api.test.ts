import { describe, it, expect, vi, beforeEach } from "vitest"

// Super-admin profile (email / password change): the current-password check has the same
// failure budget as the admin password change (#358).

const requireSuperAdminMock = vi.hoisted(() => vi.fn())
vi.mock("@/lib/auth-guard", () => ({ requireSuperAdmin: requireSuperAdminMock }))

const findUnique = vi.hoisted(() => vi.fn())
const update = vi.hoisted(() => vi.fn())
vi.mock("@/lib/prisma", () => ({ prisma: { adminUser: { findUnique, update } } }))

const compare = vi.hoisted(() => vi.fn())
vi.mock("bcryptjs", () => ({ default: { compare, hash: vi.fn().mockResolvedValue("$new") }, compare, hash: vi.fn().mockResolvedValue("$new") }))

const patch = (body: unknown) => new Request("http://localhost/api/super-admin/profile", {
  method: "PATCH",
  headers: { "Content-Type": "application/json", "x-forwarded-for": "203.0.113.50" },
  body: JSON.stringify(body),
})

describe("PATCH /api/super-admin/profile", () => {
  let id = ""
  beforeEach(() => {
    vi.clearAllMocks()
    id = `sa-${Math.random()}`
    requireSuperAdminMock.mockResolvedValue({ session: { user: { id } } })
    findUnique.mockImplementation(({ where }) => Promise.resolve(where.id ? { id, email: "sa@x.ch", passwordHash: "$old" } : null))
  })

  it("blocks after 5 wrong current passwords, without running bcrypt (#358)", async () => {
    compare.mockResolvedValue(false)
    const { PATCH } = await import("@/app/api/super-admin/profile/route")
    for (let i = 0; i < 5; i++) {
      expect((await PATCH(patch({ currentPassword: "guess", email: "new@x.ch" }))).status).toBe(400)
    }
    compare.mockClear()
    const res = await PATCH(patch({ currentPassword: "right", email: "new@x.ch" }))
    expect(res.status).toBe(429)
    expect(compare).not.toHaveBeenCalled()
    expect(update).not.toHaveBeenCalled()
  })

  it("still updates with the right current password", async () => {
    compare.mockResolvedValue(true)
    const { PATCH } = await import("@/app/api/super-admin/profile/route")
    expect((await PATCH(patch({ currentPassword: "right", email: "new@x.ch" }))).status).toBe(200)
    expect(update).toHaveBeenCalledOnce()
  })

  it("a new password ends the other sessions; an email change alone doesn't (#360)", async () => {
    compare.mockResolvedValue(true)
    const { PATCH } = await import("@/app/api/super-admin/profile/route")
    await PATCH(patch({ currentPassword: "right", newPassword: "Nouveau-mot2passe" }))
    expect(update.mock.calls.at(-1)![0].data).toMatchObject({ sessionVersion: { increment: 1 } })
    await PATCH(patch({ currentPassword: "right", email: "other@x.ch" }))
    expect(update.mock.calls.at(-1)![0].data).not.toHaveProperty("sessionVersion")
  })
})
