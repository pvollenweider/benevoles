import { describe, it, expect, vi, beforeEach } from "vitest"

const requireSuperAdminMock = vi.hoisted(() => vi.fn())
vi.mock("@/lib/auth-guard", () => ({ requireSuperAdmin: requireSuperAdminMock }))

describe("GET /api/super-admin/product-updates", () => {
  beforeEach(() => vi.clearAllMocks())

  it("returns past sends and the current opted-in recipient count", async () => {
    requireSuperAdminMock.mockResolvedValue({
      db: {
        productUpdateSend: { findMany: vi.fn().mockResolvedValue([{ id: "send-1" }]) },
        adminUser: { count: vi.fn().mockResolvedValue(3) },
      },
    })
    const { GET } = await import("@/app/api/super-admin/product-updates/route")
    const res = await GET()
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.sends).toEqual([{ id: "send-1" }])
    expect(body.recipientCount).toBe(3)
  })
})
