import { describe, it, expect, vi, beforeEach } from "vitest"

// #1067: an organization created by the super admin gets its first administrator's address as
// reply-to, while keeping both grants (#810) set at once as before.

const requireSuperAdminMock = vi.hoisted(() => vi.fn())
vi.mock("@/lib/auth-guard", () => ({ requireSuperAdmin: requireSuperAdminMock }))

const orgFindUnique = vi.hoisted(() => vi.fn())
const orgCreate = vi.hoisted(() => vi.fn())
const adminFindUnique = vi.hoisted(() => vi.fn())
const db = { organization: { findUnique: orgFindUnique, create: orgCreate }, adminUser: { findUnique: adminFindUnique } }

function post(body: unknown) {
  return new Request("http://localhost/api/super-admin/organizations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
}

describe("POST /api/super-admin/organizations", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    requireSuperAdminMock.mockResolvedValue({ db })
    orgFindUnique.mockResolvedValue(null)
    adminFindUnique.mockResolvedValue(null)
    orgCreate.mockResolvedValue({ id: "org-1", name: "Fête", slug: "fete", active: true, createdAt: new Date() })
  })

  it("sets the reply-to address to the first administrator's email", async () => {
    const { POST } = await import("@/app/api/super-admin/organizations/route")
    const res = await POST(post({ name: "Fête", adminEmail: " Owner@Fete.CH ", adminName: "Camille" }))
    expect(res.status).toBe(201)
    const data = orgCreate.mock.calls[0][0].data
    expect(data.replyToEmail).toBe("owner@fete.ch")
    expect(data.admins.create.email).toBe("owner@fete.ch")
    expect(data.publicationApprovedAt).toBeInstanceOf(Date)
    expect(data.outboundEmailApprovedAt).toBeInstanceOf(Date)
  })

  it("creates nothing when the administrator's address is taken", async () => {
    adminFindUnique.mockResolvedValue({ id: "adm-1" })
    const { POST } = await import("@/app/api/super-admin/organizations/route")
    const res = await POST(post({ name: "Fête", adminEmail: "owner@fete.ch", adminName: "Camille" }))
    expect(res.status).toBe(409)
    expect(orgCreate).not.toHaveBeenCalled()
  })
})
