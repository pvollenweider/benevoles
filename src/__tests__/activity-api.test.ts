import { describe, it, expect, vi, beforeEach } from "vitest"

const requireOrgSessionMock = vi.hoisted(() => vi.fn())
vi.mock("@/lib/auth-guard", () => ({ requireOrgSession: requireOrgSessionMock }))

const findMany = vi.hoisted(() => vi.fn())
const adminFindMany = vi.hoisted(() => vi.fn())
vi.mock("@/lib/prisma", () => ({
  prisma: { orgLog: { findMany }, adminUser: { findMany: adminFindMany } },
}))

function get(query = "") {
  return new Request(`http://localhost/api/admin/settings/activity${query}`)
}

describe("GET /api/admin/settings/activity", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    requireOrgSessionMock.mockResolvedValue({ organizationId: "org-a", session: { user: { id: "admin-1" } } })
    adminFindMany.mockResolvedValue([])
  })

  it("scopes the query to the caller's organization", async () => {
    findMany.mockResolvedValue([])
    const { GET } = await import("@/app/api/admin/settings/activity/route")
    const res = await GET(get())
    expect(res.status).toBe(200)
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { organizationId: "org-a" } }))
  })

  it("passes entityType and action filters through from the query string", async () => {
    findMany.mockResolvedValue([])
    const { GET } = await import("@/app/api/admin/settings/activity/route")
    await GET(get("?entityType=Member&action=member"))
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { organizationId: "org-a", entityType: "Member", action: { startsWith: "member" } } }),
    )
  })
})
