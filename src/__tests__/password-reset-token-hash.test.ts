import { describe, it, expect, vi, beforeEach } from "vitest"
import { hashToken } from "@/lib/token-hash"

// Password-reset tokens are stored hashed (#269): the plaintext only ever lives in the email.

const findUnique = vi.hoisted(() => vi.fn())
const update = vi.hoisted(() => vi.fn())
const sendNotification = vi.hoisted(() => vi.fn())
vi.mock("@/lib/prisma", () => ({ prisma: { adminUser: { findUnique, update }, async $transaction(fn: (tx: unknown) => unknown) { return fn(this) }, } }))
vi.mock("@/lib/notifications", () => ({ sendNotification }))
vi.mock("@/lib/notifications/outbox", () => ({
  // Stored with the transaction (#352); what matters is the payload queued.
  enqueueNotifications: async (payloads: unknown[]) => { payloads.forEach((p) => sendNotification(p)); return payloads.map((_, i) => `row-${i}`) },
  deliverAfterResponse: () => {},
}))

const json = (url: string, body: unknown) =>
  new Request(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-forwarded-for": `t-${Math.random()}` },
    body: JSON.stringify(body),
  })

describe("password reset tokens are stored hashed (#269)", () => {
  beforeEach(() => vi.clearAllMocks())

  it("forgot-password stores the hash and emails the plaintext", async () => {
    findUnique.mockResolvedValue({ id: "a1", email: "a@x.com", name: "A", isActive: true })
    sendNotification.mockResolvedValue({ ok: true })
    const { POST } = await import("@/app/api/public/forgot-password/route")
    await POST(json("http://localhost/api/public/forgot-password", { email: "a@x.com" }))

    const stored: string = update.mock.calls[0][0].data.passwordResetTokenHash
    const resetUrl: string = sendNotification.mock.calls[0][0].data.resetUrl
    const plaintext = new URL(resetUrl).searchParams.get("token")!
    expect(plaintext).toBeTruthy()
    expect(stored).not.toBe(plaintext)
    expect(stored).toBe(hashToken(plaintext))
  })

  it("reset-password looks the admin up by the hash of the token from the link", async () => {
    findUnique.mockResolvedValue(null)
    const { POST } = await import("@/app/api/public/reset-password/route")
    const res = await POST(json("http://localhost/api/public/reset-password", { token: "abc", password: "Correct-horse-battery-9" }))
    expect(res.status).toBe(400)
    expect(findUnique).toHaveBeenCalledWith({ where: { passwordResetTokenHash: hashToken("abc") } })
  })

  it("a reset signs out every session opened before it (#360)", async () => {
    findUnique.mockResolvedValue({ id: "a1", passwordResetExpiresAt: new Date(Date.now() + 60_000) })
    const { POST } = await import("@/app/api/public/reset-password/route")
    const res = await POST(json("http://localhost/api/public/reset-password", { token: "abc", password: "Correct-horse-battery-9" }))
    expect(res.status).toBe(200)
    expect(update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "a1" },
      data: expect.objectContaining({ sessionVersion: { increment: 1 }, passwordResetTokenHash: null }),
    }))
  })
})
