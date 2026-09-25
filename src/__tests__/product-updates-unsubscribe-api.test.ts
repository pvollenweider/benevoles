import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("@/lib/env", () => ({ env: { AUTH_SECRET: "test-secret-at-least-32-characters-long" } }))

const adminUserUpdate = vi.hoisted(() => vi.fn())
vi.mock("@/lib/prisma", () => ({ prisma: { adminUser: { update: adminUserUpdate } } }))

function get(query: string) {
  return new Request(`http://localhost/api/public/product-updates/unsubscribe${query}`)
}

describe("GET /api/public/product-updates/unsubscribe", () => {
  beforeEach(() => vi.clearAllMocks())

  it("redirects to ok=0 when the token doesn't match the admin id", async () => {
    const { GET } = await import("@/app/api/public/product-updates/unsubscribe/route")
    const res = await GET(get("?admin=adm-1&token=wrong"))
    expect(res.status).toBe(307)
    expect(res.headers.get("location")).toContain("ok=0")
    expect(adminUserUpdate).not.toHaveBeenCalled()
  })

  it("redirects to ok=0 when admin or token param is missing", async () => {
    const { GET } = await import("@/app/api/public/product-updates/unsubscribe/route")
    const res = await GET(get("?admin=adm-1"))
    expect(res.headers.get("location")).toContain("ok=0")
  })

  it("updates the admin and redirects to ok=1 for a valid token", async () => {
    const { unsubscribeToken } = await import("@/lib/product-updates")
    const token = unsubscribeToken("adm-1")
    adminUserUpdate.mockResolvedValue({ id: "adm-1" })

    const { GET } = await import("@/app/api/public/product-updates/unsubscribe/route")
    const res = await GET(get(`?admin=adm-1&token=${token}`))
    expect(res.headers.get("location")).toContain("ok=1")
    expect(adminUserUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "adm-1" },
        data: expect.objectContaining({ receiveProductUpdates: false }),
      }),
    )
  })
})
