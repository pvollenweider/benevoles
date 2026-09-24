import { describe, it, expect, vi, beforeEach } from "vitest"

const requireOrgSessionMock = vi.hoisted(() => vi.fn())
vi.mock("@/lib/auth-guard", () => ({ requireOrgSession: requireOrgSessionMock }))

const adminUserFindUnique = vi.hoisted(() => vi.fn())
const adminUserCreate = vi.hoisted(() => vi.fn())
const adminUserDelete = vi.hoisted(() => vi.fn())
const orgLogCreate = vi.hoisted(() => vi.fn())
vi.mock("@/lib/prisma", () => ({
  prisma: {
    adminUser: { findUnique: adminUserFindUnique, create: adminUserCreate, delete: adminUserDelete },
    orgLog: { create: orgLogCreate },
  },
}))

const sendNotificationMock = vi.hoisted(() => vi.fn())
vi.mock("@/lib/notifications", () => ({ sendNotification: sendNotificationMock }))

vi.mock("bcryptjs", () => ({ default: { hash: vi.fn().mockResolvedValue("$hashed") }, hash: vi.fn().mockResolvedValue("$hashed") }))

describe("POST /api/admin/settings/admins — activity log", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    sendNotificationMock.mockResolvedValue({ ok: true })
  })

  it("logs adminuser.invited", async () => {
    requireOrgSessionMock.mockResolvedValue({
      db: { organization: { findUnique: vi.fn().mockResolvedValue({ name: "Org A" }) } },
      organizationId: "org-a",
      session: { user: { id: "admin-1" } },
    })
    adminUserFindUnique.mockResolvedValue(null)
    adminUserCreate.mockResolvedValue({ id: "adm-2", name: "Bob", email: "bob@x.com", role: "admin", isActive: false, createdAt: new Date(), setupTokenExpiresAt: new Date() })
    orgLogCreate.mockResolvedValue({ id: "log-1" })

    const { POST } = await import("@/app/api/admin/settings/admins/route")
    const res = await POST(new Request("http://localhost/api/admin/settings/admins", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "bob@x.com", name: "Bob" }),
    }))
    expect(res.status).toBe(201)
    expect(orgLogCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: "adminuser.invited", entityType: "AdminUser", entityId: "adm-2" }) }),
    )
  })
})

describe("DELETE /api/admin/settings/admins/[id] — activity log", () => {
  beforeEach(() => vi.clearAllMocks())

  it("logs adminuser.removed", async () => {
    requireOrgSessionMock.mockResolvedValue({
      db: {
        adminUser: {
          findFirst: vi.fn().mockResolvedValue({ id: "adm-2", email: "bob@x.com", isActive: true }),
          count: vi.fn().mockResolvedValue(2),
        },
      },
      organizationId: "org-a",
      session: { user: { id: "admin-1", email: "alice@x.com" } },
    })
    orgLogCreate.mockResolvedValue({ id: "log-1" })

    const { DELETE } = await import("@/app/api/admin/settings/admins/[id]/route")
    const res = await DELETE(new Request("http://localhost/api/admin/settings/admins/adm-2", { method: "DELETE" }), { params: Promise.resolve({ id: "adm-2" }) })
    expect(res.status).toBe(200)
    expect(orgLogCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: "adminuser.removed", entityType: "AdminUser", entityId: "adm-2" }) }),
    )
  })
})
