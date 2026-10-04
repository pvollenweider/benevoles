import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { randomBytes } from "crypto"

const m = vi.hoisted(() => ({
  findMany: vi.fn(),
  updateMany: vi.fn(),
  findUniqueOrThrow: vi.fn(),
  update: vi.fn(),
  create: vi.fn(),
  createMany: vi.fn(),
  findUniqueOrThrowByKey: vi.fn(),
  count: vi.fn(),
  findFirst: vi.fn(),
  sendNotification: vi.fn(),
  after: vi.fn(),
  reported: vi.fn(),
}))
vi.mock("../prisma", () => ({
  prisma: {
    notificationOutbox: {
      findMany: m.findMany, updateMany: m.updateMany, update: m.update, create: m.create,
      createMany: m.createMany, count: m.count, findFirst: m.findFirst,
      // By id during delivery, by dedupeKey when enqueuing.
      findUniqueOrThrow: (args: { where: { id?: string; dedupeKey?: string } }) =>
        args.where.dedupeKey ? m.findUniqueOrThrowByKey(args) : m.findUniqueOrThrow(args),
    },
  },
}))
vi.mock("../notifications/index", () => ({ sendNotification: m.sendNotification }))
vi.mock("next/server", () => ({ after: m.after }))
vi.mock("../report-error", () => ({ reportError: (ctx: string) => (e: unknown) => m.reported(ctx, e) }))

import { backoffMs, collectNotifications, deliverAfterResponse, deliverOutbox, enqueueNotifications, MAX_ATTEMPTS, openPayload, outboxHealth, outboxMessageId, sealPayload } from "../notifications/outbox"

const payload = { kind: "registration_confirmation" as const, recipient: { email: "a@x.com" }, data: {} }
const now = new Date("2030-01-01T12:00:00Z")

beforeEach(() => {
  for (const fn of Object.values(m)) fn.mockReset()
  m.updateMany.mockResolvedValue({ count: 1 })
  m.findMany.mockResolvedValue([{ id: "n1", status: "pending", claimedAt: null }])
  m.findUniqueOrThrow.mockResolvedValue({ id: "n1", attempts: 0, payload })
})

describe("collectNotifications / enqueueNotifications / deliverAfterResponse", () => {
  it("collects payloads instead of sending them", async () => {
    const c = collectNotifications()
    expect(await c.send(payload)).toEqual({ ok: true })
    expect(c.payloads).toEqual([payload])
    expect(m.sendNotification).not.toHaveBeenCalled()
  })

  it("stores the notifications, then delivery is scheduled after the response", async () => {
    m.create.mockResolvedValueOnce({ id: "n1" }).mockResolvedValueOnce({ id: "n2" })
    const ids = await enqueueNotifications([payload, payload])
    expect(ids).toEqual(["n1", "n2"])
    expect(m.create).toHaveBeenCalledTimes(2)
    expect(m.after).not.toHaveBeenCalled() // storing doesn't deliver
    deliverAfterResponse(ids)
    expect(m.after).toHaveBeenCalledOnce()
    expect(m.sendNotification).not.toHaveBeenCalled() // not inline
  })

  it("stores through the client it is given (a transaction's), not the global one (#352)", async () => {
    const txCreate = vi.fn().mockResolvedValue({ id: "t1" })
    const tx = { notificationOutbox: { create: txCreate, createMany: vi.fn(), findUniqueOrThrow: vi.fn() } }
    expect(await enqueueNotifications([payload], tx)).toEqual(["t1"])
    expect(txCreate).toHaveBeenCalledOnce()
    expect(m.create).not.toHaveBeenCalled()
  })

  it("stores the organization on the row, from the payload or from the caller (#382)", async () => {
    m.create.mockResolvedValue({ id: "n1" })
    await enqueueNotifications([{ ...payload, organizationId: "org-p" }], undefined, { organizationId: "org-c" })
    expect(m.create).toHaveBeenLastCalledWith(expect.objectContaining({ data: expect.objectContaining({ organizationId: "org-p" }) }))
    await enqueueNotifications([payload], undefined, { organizationId: "org-c" })
    expect(m.create).toHaveBeenLastCalledWith(expect.objectContaining({ data: expect.objectContaining({ organizationId: "org-c" }) }))
    await enqueueNotifications([payload])
    expect(m.create).toHaveBeenLastCalledWith(expect.objectContaining({ data: expect.objectContaining({ organizationId: null }) }))
  })

  it("schedules nothing for an empty batch", () => {
    deliverAfterResponse([])
    expect(m.after).not.toHaveBeenCalled()
  })
})

describe("deliverOutbox", () => {
  it("claims, sends and marks as sent", async () => {
    m.sendNotification.mockResolvedValue({ ok: true })
    expect(await deliverOutbox({ now })).toEqual({ sent: 1, retried: 0, failed: 0 })
    expect(m.updateMany).toHaveBeenCalledWith({
      where: { id: "n1", status: "pending", claimedAt: null },
      data: { status: "sending", claimedAt: now },
    })
    expect(m.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "sent" }) }))
  })

  it("skips a row another delivery claimed first (never sends twice)", async () => {
    m.updateMany.mockResolvedValue({ count: 0 })
    expect(await deliverOutbox({ now })).toEqual({ sent: 0, retried: 0, failed: 0 })
    expect(m.sendNotification).not.toHaveBeenCalled()
  })

  it("schedules a retry with backoff on failure", async () => {
    m.sendNotification.mockResolvedValue({ ok: false, reason: "smtp down" })
    expect(await deliverOutbox({ now })).toEqual({ sent: 0, retried: 1, failed: 0 })
    expect(m.update).toHaveBeenCalledWith({
      where: { id: "n1" },
      data: expect.objectContaining({
        status: "pending", attempts: 1, lastError: "smtp down", claimedAt: null,
        nextAttemptAt: new Date(now.getTime() + backoffMs(1)),
      }),
    })
  })

  // #598: a permanent SMTP rejection (5xx) can't be fixed by waiting — stop at once instead of
  // spending ~2.5h of backoff (MAX_ATTEMPTS) on a retry that can't succeed.
  it("stops retrying at once on a permanent rejection, even on the first attempt", async () => {
    m.sendNotification.mockResolvedValue({ ok: false, reason: "smtp:rejected_permanent:mailbox_unknown:550:5.1.1", permanent: true })
    expect(await deliverOutbox({ now })).toEqual({ sent: 0, retried: 0, failed: 1 })
    expect(m.update).toHaveBeenCalledWith({
      where: { id: "n1" },
      data: expect.objectContaining({ status: "failed", attempts: 1, lastError: "smtp:rejected_permanent:mailbox_unknown:550:5.1.1" }),
    })
  })

  it("treats a thrown error as a failed attempt", async () => {
    m.sendNotification.mockRejectedValue(new Error("boom"))
    expect(await deliverOutbox({ now })).toEqual({ sent: 0, retried: 1, failed: 0 })
  })

  it("gives up after MAX_ATTEMPTS and reports it", async () => {
    m.findUniqueOrThrow.mockResolvedValue({ id: "n1", attempts: MAX_ATTEMPTS - 1, payload })
    m.sendNotification.mockResolvedValue({ ok: false, reason: "smtp down" })
    expect(await deliverOutbox({ now })).toEqual({ sent: 0, retried: 0, failed: 1 })
    expect(m.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "failed" }) }))
    expect(m.reported).toHaveBeenCalledWith("outbox.gave_up.registration_confirmation", expect.any(Error))
  })

  it("only picks due rows, plus stale claims left by a crashed delivery", async () => {
    m.findMany.mockResolvedValue([])
    await deliverOutbox({ now, ids: ["n1"] })
    expect(m.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        id: { in: ["n1"] },
        OR: [
          { status: "pending", nextAttemptAt: { lte: now } },
          { status: "sending", claimedAt: { lt: new Date(now.getTime() - 15 * 60 * 1000) } },
        ],
      },
    }))
  })

  it("backoff doubles from 5 minutes", () => {
    expect([1, 2, 3].map(backoffMs)).toEqual([5, 10, 20].map((min) => min * 60 * 1000))
  })
})

describe("outbox payload at rest (#290)", () => {
  afterEach(() => vi.unstubAllEnvs())

  it("is stored as is without a key", () => {
    vi.stubEnv("TOKEN_ENCRYPTION_KEY", "")
    expect(sealPayload(payload)).toEqual(payload)
    expect(openPayload(payload)).toEqual(payload)
  })

  it("is stored encrypted with a key (no link or address in clear) and opened back", () => {
    vi.stubEnv("TOKEN_ENCRYPTION_KEY", randomBytes(32).toString("base64"))
    const withLink = { ...payload, data: { editToken: "secret-link-token" } }
    const sealed = sealPayload(withLink)
    expect(JSON.stringify(sealed)).not.toContain("secret-link-token")
    expect(JSON.stringify(sealed)).not.toContain("a@x.com")
    expect(openPayload(sealed)).toEqual(withLink)
  })

  it("delivery decrypts before sending", async () => {
    vi.stubEnv("TOKEN_ENCRYPTION_KEY", randomBytes(32).toString("base64"))
    m.findUniqueOrThrow.mockResolvedValue({ id: "n1", attempts: 0, payload: sealPayload(payload) })
    m.sendNotification.mockResolvedValue({ ok: true })
    await deliverOutbox({ now })
    expect(m.sendNotification).toHaveBeenCalledWith({ ...payload, messageId: outboxMessageId("n1"), outboxId: "n1" })
  })
})

describe("idempotency (#315)", () => {
  it("a payload with a dedupeKey is stored once; an already-known key isn't delivered again", async () => {
    m.createMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 })
    m.findUniqueOrThrowByKey.mockResolvedValue({ id: "n-key" })
    const ids = await enqueueNotifications([
      { ...payload, dedupeKey: "registration_confirmation:r1:a@x.com" },
      { ...payload, dedupeKey: "registration_confirmation:r1:a@x.com" },
    ])
    expect(ids).toEqual(["n-key"])
    expect(m.createMany).toHaveBeenCalledWith(expect.objectContaining({ skipDuplicates: true }))
    // The key isn't part of the stored payload.
    expect(JSON.stringify(m.createMany.mock.calls[0][0].data[0].payload)).not.toContain("dedupeKey")
  })

  it("payloads without a key are always stored", async () => {
    m.create.mockResolvedValue({ id: "n-plain" })
    expect(await enqueueNotifications([payload, payload])).toEqual(["n-plain", "n-plain"])
    expect(m.createMany).not.toHaveBeenCalled()
  })

  it("each row is sent with a stable Message-ID", async () => {
    m.sendNotification.mockResolvedValue({ ok: true })
    await deliverOutbox({ now })
    expect(m.sendNotification).toHaveBeenCalledWith(expect.objectContaining({ messageId: outboxMessageId("n1") }))
    expect(outboxMessageId("n1")).toMatch(/^<outbox-n1@[^>]+>$/)
  })
})

describe("outboxHealth (#316)", () => {
  it("healthy when nothing failed, nothing stuck", async () => {
    m.count.mockResolvedValue(0)
    m.findFirst.mockResolvedValue({ createdAt: new Date(now.getTime() - 5 * 60000) })
    expect(await outboxHealth(now)).toEqual({ failedLastDay: 0, oldestPendingMinutes: 5, staleClaims: 0, healthy: true })
  })

  it("unhealthy on a failure, a stale claim, or a pending row older than 2 h", async () => {
    m.count.mockResolvedValueOnce(1).mockResolvedValueOnce(0)
    m.findFirst.mockResolvedValue(null)
    expect((await outboxHealth(now)).healthy).toBe(false)

    m.count.mockResolvedValueOnce(0).mockResolvedValueOnce(0)
    m.findFirst.mockResolvedValue({ createdAt: new Date(now.getTime() - 3 * 60 * 60000) })
    expect(await outboxHealth(now)).toMatchObject({ oldestPendingMinutes: 180, healthy: false })
  })
})
