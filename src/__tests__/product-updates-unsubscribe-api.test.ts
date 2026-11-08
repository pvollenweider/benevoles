import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("@/lib/env", () => ({ env: { AUTH_SECRET: "test-secret-at-least-32-characters-long" } }))

const adminUserUpdate = vi.hoisted(() => vi.fn())
vi.mock("@/lib/prisma", () => ({ prisma: { adminUser: { update: adminUserUpdate } } }))

const PATH = "http://localhost/api/public/product-updates/unsubscribe"

function get(query: string) {
  return new Request(`${PATH}${query}`)
}

function post(fields: Record<string, string>, headers: Record<string, string> = {}) {
  return new Request(PATH, {
    method: "POST",
    headers: { host: "localhost", "content-type": "application/x-www-form-urlencoded", origin: "http://localhost", ...headers },
    body: new URLSearchParams(fields).toString(),
  })
}

describe("GET /api/public/product-updates/unsubscribe", () => {
  beforeEach(() => vi.clearAllMocks())

  it("opens the confirmation page without writing for a valid token", async () => {
    const { unsubscribeToken } = await import("@/lib/product-updates")
    const token = unsubscribeToken("adm-1")

    const { GET } = await import("@/app/api/public/product-updates/unsubscribe/route")
    const res = await GET(get(`?admin=adm-1&token=${token}`))
    expect(res.status).toBe(307)
    expect(res.headers.get("location")).toContain("/product-updates/unsubscribe?admin=adm-1&token=")
    expect(adminUserUpdate).not.toHaveBeenCalled()
  })

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
    expect(adminUserUpdate).not.toHaveBeenCalled()
  })
})

describe("POST /api/public/product-updates/unsubscribe", () => {
  beforeEach(() => vi.clearAllMocks())

  it("unsubscribes and redirects to ok=1 for a valid token", async () => {
    const { unsubscribeToken } = await import("@/lib/product-updates")
    const token = unsubscribeToken("adm-1")
    adminUserUpdate.mockResolvedValue({ id: "adm-1" })

    const { POST } = await import("@/app/api/public/product-updates/unsubscribe/route")
    const res = await POST(post({ admin: "adm-1", token }))
    expect(res.status).toBe(303)
    expect(res.headers.get("location")).toContain("ok=1")
    expect(adminUserUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "adm-1" },
        data: expect.objectContaining({ receiveProductUpdates: false }),
      }),
    )
  })

  it("redirects to ok=0 and writes nothing when the token is wrong", async () => {
    const { POST } = await import("@/app/api/public/product-updates/unsubscribe/route")
    const res = await POST(post({ admin: "adm-1", token: "wrong" }))
    expect(res.status).toBe(303)
    expect(res.headers.get("location")).toContain("ok=0")
    expect(adminUserUpdate).not.toHaveBeenCalled()
  })

  it("redirects to ok=0 and writes nothing when a field is missing", async () => {
    const { POST } = await import("@/app/api/public/product-updates/unsubscribe/route")
    const res = await POST(post({ admin: "adm-1" }))
    expect(res.headers.get("location")).toContain("ok=0")
    expect(adminUserUpdate).not.toHaveBeenCalled()
  })

  it("refuses a cross-site form and writes nothing", async () => {
    const { POST } = await import("@/app/api/public/product-updates/unsubscribe/route")
    const res = await POST(post({ admin: "adm-1", token: "whatever" }, { origin: "https://evil.example" }))
    expect(res.status).toBe(403)
    expect(adminUserUpdate).not.toHaveBeenCalled()
  })
})
