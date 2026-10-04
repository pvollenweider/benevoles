import { describe, it, expect, vi, beforeEach } from "vitest"
import { NextResponse } from "next/server"

// PATCH /api/super-admin/release-banner (#612): dismisses the release banner for this super
// admin, for one version. Same guard pattern as the other super-admin routes (requireSuperAdmin
// returning either a NextResponse to pass through, or { session }).

const requireSuperAdminMock = vi.hoisted(() => vi.fn())
vi.mock("@/lib/auth-guard", () => ({ requireSuperAdmin: requireSuperAdminMock }))

const update = vi.hoisted(() => vi.fn())
vi.mock("@/lib/prisma", () => ({ prisma: { adminUser: { update } } }))

const patch = (body: unknown) => new Request("http://localhost/api/super-admin/release-banner", {
  method: "PATCH",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
})

describe("PATCH /api/super-admin/release-banner", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    update.mockResolvedValue({})
  })

  it("401 without a session", async () => {
    requireSuperAdminMock.mockResolvedValue(NextResponse.json({ error: "Unauthorized" }, { status: 401 }))
    const { PATCH } = await import("@/app/api/super-admin/release-banner/route")
    const res = await PATCH(patch({ version: "2.1.0" }))
    expect(res.status).toBe(401)
    expect(update).not.toHaveBeenCalled()
  })

  it("403 for a signed-in admin who isn't super admin", async () => {
    requireSuperAdminMock.mockResolvedValue(NextResponse.json({ error: "Forbidden" }, { status: 403 }))
    const { PATCH } = await import("@/app/api/super-admin/release-banner/route")
    const res = await PATCH(patch({ version: "2.1.0" }))
    expect(res.status).toBe(403)
    expect(update).not.toHaveBeenCalled()
  })

  it("stores the dismissed version for this super admin only", async () => {
    requireSuperAdminMock.mockResolvedValue({ session: { user: { id: "sa-1" } } })
    const { PATCH } = await import("@/app/api/super-admin/release-banner/route")
    const res = await PATCH(patch({ version: "2.1.0" }))
    expect(res.status).toBe(200)
    expect(update).toHaveBeenCalledWith({ where: { id: "sa-1" }, data: { releaseBannerDismissedVersion: "2.1.0" } })
  })

  it("400 on a missing version", async () => {
    requireSuperAdminMock.mockResolvedValue({ session: { user: { id: "sa-1" } } })
    const { PATCH } = await import("@/app/api/super-admin/release-banner/route")
    const res = await PATCH(patch({}))
    expect(res.status).toBe(400)
    expect(update).not.toHaveBeenCalled()
  })
})
