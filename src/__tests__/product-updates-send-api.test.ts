import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("@/lib/env", () => ({ env: { AUTH_SECRET: "test-secret-at-least-32-characters-long" } }))

const requireSuperAdminMock = vi.hoisted(() => vi.fn())
vi.mock("@/lib/auth-guard", () => ({ requireSuperAdmin: requireSuperAdminMock }))

const adminUserFindMany = vi.hoisted(() => vi.fn())
const sendCreate = vi.hoisted(() => vi.fn())
const sendNotificationMock = vi.hoisted(() => vi.fn())
vi.mock("@/lib/notifications", () => ({ sendNotification: sendNotificationMock }))

function setupGuard(recipients: { id: string; email: string; name: string }[]) {
  requireSuperAdminMock.mockResolvedValue({
    session: { user: { id: "super-1" } },
    db: { adminUser: { findMany: adminUserFindMany.mockResolvedValue(recipients) }, productUpdateSend: { create: sendCreate } },
  })
}

function post(body: unknown) {
  return new Request("http://localhost/api/super-admin/product-updates/send", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

describe("POST /api/super-admin/product-updates/send", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    sendNotificationMock.mockResolvedValue({ ok: true })
  })

  it("rejects a missing subject or content", async () => {
    setupGuard([])
    const { POST } = await import("@/app/api/super-admin/product-updates/send/route")
    const res = await POST(post({ subject: "", content: "" }))
    expect(res.status).toBe(400)
    expect(sendCreate).not.toHaveBeenCalled()
  })

  it("sends only to active, opted-in admins and records the send", async () => {
    setupGuard([
      { id: "adm-1", email: "a@x.com", name: "Alice" },
      { id: "adm-2", email: "b@x.com", name: "Bob" },
    ])
    sendCreate.mockResolvedValue({ id: "send-1", subject: "Hello", content: "Body", recipientCount: 2, successCount: 2 })

    const { POST } = await import("@/app/api/super-admin/product-updates/send/route")
    const res = await POST(post({ subject: "Hello", content: "Body" }))
    expect(res.status).toBe(201)

    expect(adminUserFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { isActive: true, receiveProductUpdates: true } }),
    )
    expect(sendNotificationMock).toHaveBeenCalledTimes(2)
    expect(sendNotificationMock).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "product_update",
        recipient: { email: "a@x.com", name: "Alice" },
        data: expect.objectContaining({ subject: "Hello", content: "Body" }),
      }),
    )
    expect(sendCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ subject: "Hello", content: "Body", recipientCount: 2, successCount: 2, sentByAdminId: "super-1" }) }),
    )
  })

  it("includes a per-admin unsubscribe link unique to each recipient", async () => {
    setupGuard([{ id: "adm-1", email: "a@x.com", name: "Alice" }])
    sendCreate.mockResolvedValue({ id: "send-1", subject: "Hi", content: "Body", recipientCount: 1, successCount: 1 })

    const { POST } = await import("@/app/api/super-admin/product-updates/send/route")
    await POST(post({ subject: "Hi", content: "Body" }))

    const data = sendNotificationMock.mock.calls[0][0].data
    expect(data.unsubscribeUrl).toContain("admin=adm-1")
    expect(data.unsubscribeUrl).toContain("token=")
  })

  it("counts a failed send without failing the whole request", async () => {
    setupGuard([
      { id: "adm-1", email: "a@x.com", name: "Alice" },
      { id: "adm-2", email: "b@x.com", name: "Bob" },
    ])
    sendNotificationMock
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({ ok: false, reason: "smtp down" })
    sendCreate.mockResolvedValue({ id: "send-1", subject: "Hi", content: "Body", recipientCount: 2, successCount: 1 })

    const { POST } = await import("@/app/api/super-admin/product-updates/send/route")
    const res = await POST(post({ subject: "Hi", content: "Body" }))
    expect(res.status).toBe(201)
    expect(sendCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ recipientCount: 2, successCount: 1 }) }),
    )
  })
})
