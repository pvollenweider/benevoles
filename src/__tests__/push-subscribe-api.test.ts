import { describe, it, expect, vi, beforeEach } from "vitest"
import { hashToken } from "@/lib/token-hash"

const findFirst = vi.hoisted(() => vi.fn())
const upsert = vi.hoisted(() => vi.fn())
const deleteMany = vi.hoisted(() => vi.fn())
vi.mock("@/lib/prisma", () => ({
  prisma: { registration: { findFirst }, pushSubscription: { upsert, deleteMany } },
}))
vi.mock("@/lib/env", () => ({ env: {} }))
vi.mock("@/lib/rate-limit", () => ({
  rateLimit: () => ({ ok: true, remaining: 1, retryAfter: 0 }),
  getClientIp: () => "127.0.0.1",
}))

const sub = { endpoint: "https://push.example.com/abc", auth: "a", p256dh: "p" }

function post(body: unknown) {
  return new Request("http://localhost/api/public/push", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

describe("POST /api/public/push", () => {
  beforeEach(() => vi.clearAllMocks())

  // Regression: subscribing used to take a bare email, so anyone could subscribe their own
  // browser to another volunteer's reminders and receive the /my/<editToken> link they carry.
  it("rejects an email-only payload (no editToken)", async () => {
    const { POST } = await import("@/app/api/public/push/route")
    const res = await POST(post({ email: "victim@example.com", ...sub }))
    expect(res.status).toBe(400)
    expect(findFirst).not.toHaveBeenCalled()
    expect(upsert).not.toHaveBeenCalled()
  })

  it("404s for an unknown or non-active editToken", async () => {
    findFirst.mockResolvedValue(null)
    const { POST } = await import("@/app/api/public/push/route")
    const res = await POST(post({ editToken: "nope", ...sub }))
    expect(res.status).toBe(404)
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { editTokenHash: hashToken("nope"), status: "active" } }),
    )
    expect(upsert).not.toHaveBeenCalled()
  })

  it("binds the subscription to the token's volunteer", async () => {
    findFirst.mockResolvedValue({ volunteerId: "vol-1" })
    const { POST } = await import("@/app/api/public/push/route")
    const res = await POST(post({ editToken: "tok", ...sub }))
    expect(res.status).toBe(200)
    expect(upsert).toHaveBeenCalledWith({
      where: { endpoint_volunteerId: { endpoint: sub.endpoint, volunteerId: "vol-1" } },
      update: { auth: "a", p256dh: "p" },
      create: { endpoint: sub.endpoint, auth: "a", p256dh: "p", volunteerId: "vol-1" },
    })
  })

  it("ignores a client-supplied volunteerId", async () => {
    findFirst.mockResolvedValue({ volunteerId: "vol-1" })
    const { POST } = await import("@/app/api/public/push/route")
    await POST(post({ editToken: "tok", volunteerId: "vol-other", ...sub }))
    expect(upsert.mock.calls[0][0].create.volunteerId).toBe("vol-1")
  })
})

describe("DELETE /api/public/push", () => {
  beforeEach(() => { vi.clearAllMocks(); deleteMany.mockResolvedValue({ count: 1 }) })
  const del = (body: unknown) =>
    new Request("http://localhost/api/public/push", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })

  // Regression (audit): an endpoint alone used to delete every subscription on it.
  it("refuses an endpoint without the personal link, and deletes nothing", async () => {
    const { DELETE } = await import("@/app/api/public/push/route")
    expect((await DELETE(del({ endpoint: sub.endpoint }))).status).toBe(400)
    expect(deleteMany).not.toHaveBeenCalled()
  })

  it("404s for an unknown link", async () => {
    findFirst.mockResolvedValue(null)
    const { DELETE } = await import("@/app/api/public/push/route")
    expect((await DELETE(del({ editToken: "nope", endpoint: sub.endpoint }))).status).toBe(404)
    expect(deleteMany).not.toHaveBeenCalled()
  })

  it("removes only the link's volunteer's subscription on that endpoint, also after a cancellation", async () => {
    findFirst.mockResolvedValue({ volunteerId: "vol-1" })
    const { DELETE } = await import("@/app/api/public/push/route")
    expect((await DELETE(del({ editToken: "tok", endpoint: sub.endpoint }))).status).toBe(200)
    expect(findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { editTokenHash: hashToken("tok") } }))
    expect(deleteMany).toHaveBeenCalledWith({ where: { endpoint: sub.endpoint, volunteerId: "vol-1" } })
  })
})
