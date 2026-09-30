import { describe, it, expect, vi, beforeEach } from "vitest"

// Admin levels (#469): invite with a level, change it, never lose the last owner.
const m = vi.hoisted(() => ({
  guard: vi.fn(),
  findUnique: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  del: vi.fn(),
  orgLog: vi.fn().mockResolvedValue({ id: "log" }),
}))
vi.mock("@/lib/auth-guard", () => ({ requireOrgSession: m.guard }))
vi.mock("@/lib/prisma", () => ({
  prisma: {
    adminUser: { findUnique: m.findUnique, create: m.create, update: m.update, delete: m.del },
    orgLog: { create: m.orgLog },
    async $transaction(fn: (tx: unknown) => unknown) { return fn(this) },
  },
}))
vi.mock("@/lib/notifications/outbox", () => ({ enqueueNotifications: async () => ["row-1"], deliverAfterResponse: () => {} }))
vi.mock("bcryptjs", () => ({ default: { hash: vi.fn().mockResolvedValue("$h") }, hash: vi.fn().mockResolvedValue("$h") }))

const session = { user: { id: "owner-1", email: "owner@x.ch", role: "admin" } }
const withDb = (target: object | null, owners: number, active = 3) => {
  const db = {
    adminUser: {
      findFirst: vi.fn().mockResolvedValue(target),
      count: vi.fn(async ({ where }: { where: { role?: string } }) => (where.role ? owners : active)),
    },
    organization: { findUnique: vi.fn().mockResolvedValue({ name: "Org" }) },
  }
  m.guard.mockResolvedValue({ db, organizationId: "org-a", session })
  return db
}
const json = (method: string, body: unknown) => new Request("http://localhost/x", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
const params = { params: Promise.resolve({ id: "adm-2" }) }

describe("admin levels", () => {
  beforeEach(() => vi.clearAllMocks())

  it("routes that change the team ask for the owner level", async () => {
    withDb({ id: "adm-2", role: "organizer", isActive: true }, 2)
    const { PATCH, DELETE } = await import("@/app/api/admin/settings/admins/[id]/route")
    await PATCH(json("PATCH", { role: "admin" }), params)
    await DELETE(new Request("http://localhost/x", { method: "DELETE" }), params)
    const { POST } = await import("@/app/api/admin/settings/admins/route")
    m.findUnique.mockResolvedValue(null)
    m.create.mockResolvedValue({ id: "adm-3", email: "n@x.ch", name: "N", role: "organizer", isActive: false })
    await POST(json("POST", { email: "n@x.ch", name: "N" }))
    expect(m.guard.mock.calls.map((c) => c[0])).toEqual(["owner", "owner", "owner"])
  })

  it("invites an organiser unless an owner is chosen", async () => {
    withDb(null, 1)
    m.findUnique.mockResolvedValue(null)
    m.create.mockImplementation(async ({ data }: { data: { role: string } }) => ({ id: "adm-3", email: "n@x.ch", name: "N", role: data.role, isActive: false }))
    const { POST } = await import("@/app/api/admin/settings/admins/route")
    await POST(json("POST", { email: "n@x.ch", name: "N" }))
    expect(m.create.mock.calls[0][0].data.role).toBe("organizer")
    await POST(json("POST", { email: "p@x.ch", name: "P", role: "admin" }))
    expect(m.create.mock.calls[1][0].data.role).toBe("admin")
    expect((await POST(json("POST", { email: "q@x.ch", name: "Q", role: "super_admin" }))).status).toBe(400)
  })

  it("changes a level and logs it", async () => {
    withDb({ id: "adm-2", role: "organizer", isActive: true }, 1)
    const { PATCH } = await import("@/app/api/admin/settings/admins/[id]/route")
    const res = await PATCH(json("PATCH", { role: "admin" }), params)
    expect(res.status).toBe(200)
    expect(m.update).toHaveBeenCalledWith({ where: { id: "adm-2" }, data: { role: "admin" } })
    expect(m.orgLog.mock.calls[0][0].data).toMatchObject({ action: "adminuser.role_changed", changes: { role: { from: "organizer", to: "admin" } } })
  })

  it("refuses to demote or remove the last active owner", async () => {
    withDb({ id: "adm-2", role: "admin", isActive: true, email: "last@x.ch" }, 1)
    const { PATCH, DELETE } = await import("@/app/api/admin/settings/admins/[id]/route")
    const demote = await PATCH(json("PATCH", { role: "organizer" }), params)
    expect(demote.status).toBe(400)
    expect((await demote.json()).error).toMatch(/au moins un propriétaire/)
    const remove = await DELETE(new Request("http://localhost/x", { method: "DELETE" }), params)
    expect(remove.status).toBe(400)
    expect(m.update).not.toHaveBeenCalled()
    expect(m.del).not.toHaveBeenCalled()
  })

  it("allows demoting an owner when another remains", async () => {
    withDb({ id: "adm-2", role: "admin", isActive: true }, 2)
    const { PATCH } = await import("@/app/api/admin/settings/admins/[id]/route")
    expect((await PATCH(json("PATCH", { role: "organizer" }), params)).status).toBe(200)
  })

  it("answers 404 for an admin of another organisation", async () => {
    withDb(null, 2)
    const { PATCH } = await import("@/app/api/admin/settings/admins/[id]/route")
    expect((await PATCH(json("PATCH", { role: "admin" }), params)).status).toBe(404)
    expect(m.update).not.toHaveBeenCalled()
  })
})
