import { describe, it, expect, vi, beforeEach } from "vitest"
import { hashToken } from "@/lib/token-hash"

const findFirst = vi.hoisted(() => vi.fn())
const upsert = vi.hoisted(() => vi.fn())
vi.mock("@/lib/prisma", () => ({
  prisma: { registration: { findFirst }, pushSubscription: { upsert } },
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
