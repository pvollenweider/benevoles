import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("@/lib/env", () => ({ env: { AUTH_SECRET: "test-secret-at-least-32-characters-long" } }))

const requireSuperAdminMock = vi.hoisted(() => vi.fn())
vi.mock("@/lib/auth-guard", () => ({ requireSuperAdmin: requireSuperAdminMock }))

const adminUserFindUnique = vi.hoisted(() => vi.fn())
const sendNotificationMock = vi.hoisted(() => vi.fn())
vi.mock("@/lib/notifications", () => ({ sendNotification: sendNotificationMock }))

function post(body: unknown) {
  return new Request("http://localhost/api/super-admin/product-updates/test", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

describe("POST /api/super-admin/product-updates/test", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    requireSuperAdminMock.mockResolvedValue({
      session: { user: { id: "super-1" } },
      db: { adminUser: { findUnique: adminUserFindUnique } },
    })
  })

  it("sends only to the calling super admin's own email", async () => {
    adminUserFindUnique.mockResolvedValue({ id: "super-1", email: "me@x.com", name: "Me" })
    sendNotificationMock.mockResolvedValue({ ok: true })

    const { POST } = await import("@/app/api/super-admin/product-updates/test/route")
    const res = await POST(post({ subject: "Hello", content: "Body" }))
    expect(res.status).toBe(200)
    expect(sendNotificationMock).toHaveBeenCalledTimes(1)
    expect(sendNotificationMock).toHaveBeenCalledWith(
      expect.objectContaining({ recipient: { email: "me@x.com", name: "Me" } }),
    )
  })

  it("prefixes the subject with [Test]", async () => {
    adminUserFindUnique.mockResolvedValue({ id: "super-1", email: "me@x.com", name: "Me" })
    sendNotificationMock.mockResolvedValue({ ok: true })

    const { POST } = await import("@/app/api/super-admin/product-updates/test/route")
    await POST(post({ subject: "Hello", content: "Body" }))
    expect(sendNotificationMock.mock.calls[0][0].data.subject).toBe("[Test] Hello")
  })

  it("returns 502 when the send fails", async () => {
    adminUserFindUnique.mockResolvedValue({ id: "super-1", email: "me@x.com", name: "Me" })
    sendNotificationMock.mockResolvedValue({ ok: false, reason: "smtp down" })

    const { POST } = await import("@/app/api/super-admin/product-updates/test/route")
    const res = await POST(post({ subject: "Hello", content: "Body" }))
    expect(res.status).toBe(502)
  })
})
