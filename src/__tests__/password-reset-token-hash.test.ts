import { describe, it, expect, vi, beforeEach } from "vitest"
import { hashToken } from "@/lib/token-hash"

// Password-reset tokens are stored hashed (#269): the plaintext only ever lives in the email.

const findUnique = vi.hoisted(() => vi.fn())
const update = vi.hoisted(() => vi.fn())
const updateMany = vi.hoisted(() => vi.fn())
const sendNotification = vi.hoisted(() => vi.fn())
const queryRaw = vi.hoisted(() => vi.fn())
vi.mock("@/lib/prisma", () => ({ prisma: { adminUser: { findUnique, update, updateMany }, $queryRaw: queryRaw, async $transaction(fn: (tx: unknown) => unknown) { return fn(this) }, } }))
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
    findUnique.mockResolvedValue({ id: "a1", email: "a@x.com", name: "A", isActive: true, sessionVersion: 0, organizationId: null })
    // The account row read again under its lock, then the per-recipient budget taken.
    queryRaw.mockResolvedValueOnce([{ email: "a@x.com", sessionVersion: 0, isActive: true }]).mockResolvedValueOnce([{ count: 1 }])
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
    updateMany.mockResolvedValue({ count: 1 })
    const { POST } = await import("@/app/api/public/reset-password/route")
    const res = await POST(json("http://localhost/api/public/reset-password", { token: "abc", password: "Correct-horse-battery-9" }))
    expect(res.status).toBe(200)
    expect(updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ sessionVersion: { increment: 1 }, passwordResetTokenHash: null, passwordResetExpiresAt: null }),
    }))
  })
})

describe("reset-password consumes the link once, atomically", () => {
  beforeEach(() => vi.clearAllMocks())
  const reset = async () => {
    const { POST } = await import("@/app/api/public/reset-password/route")
    return POST(json("http://localhost/api/public/reset-password", { token: "abc", password: "Correct-horse-battery-9" }))
  }

  it("only matches while the account still carries this token, unexpired", async () => {
    findUnique.mockResolvedValue({ id: "a1", passwordResetExpiresAt: new Date(Date.now() + 60_000) })
    updateMany.mockResolvedValue({ count: 1 })
    expect((await reset()).status).toBe(200)
    expect(updateMany.mock.calls[0][0].where).toEqual({
      id: "a1",
      passwordResetTokenHash: hashToken("abc"),
      passwordResetExpiresAt: { gt: expect.any(Date) },
    })
    expect(update).not.toHaveBeenCalled()
  })

  it("a request that lost the race, or whose link expired or was replaced meanwhile, is refused", async () => {
    findUnique.mockResolvedValue({ id: "a1", passwordResetExpiresAt: new Date(Date.now() + 60_000) })
    updateMany.mockResolvedValue({ count: 0 })
    const res = await reset()
    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/invalide ou expiré/)
  })

  it("an expired link is refused before the password is hashed or anything is written", async () => {
    findUnique.mockResolvedValue({ id: "a1", passwordResetExpiresAt: new Date(Date.now() - 1) })
    expect((await reset()).status).toBe(400)
    expect(updateMany).not.toHaveBeenCalled()
  })
})
