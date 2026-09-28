import { describe, it, expect, vi, beforeEach } from "vitest"

const m = vi.hoisted(() => ({
  findMany: vi.fn(),
  updateMany: vi.fn(),
  findUniqueOrThrow: vi.fn(),
  update: vi.fn(),
  create: vi.fn(),
  sendNotification: vi.fn(),
  after: vi.fn(),
  reported: vi.fn(),
}))
vi.mock("../prisma", () => ({
  prisma: {
    notificationOutbox: {
      findMany: m.findMany, updateMany: m.updateMany, findUniqueOrThrow: m.findUniqueOrThrow, update: m.update, create: m.create,
    },
  },
}))
vi.mock("../notifications/index", () => ({ sendNotification: m.sendNotification }))
vi.mock("next/server", () => ({ after: m.after }))
vi.mock("../report-error", () => ({ reportError: (ctx: string) => (e: unknown) => m.reported(ctx, e) }))

import { backoffMs, collectNotifications, deliverOutbox, enqueueAndDeliver, MAX_ATTEMPTS } from "../notifications/outbox"

const payload = { kind: "registration_confirmation" as const, recipient: { email: "a@x.com" }, data: {} }
const now = new Date("2030-01-01T12:00:00Z")

beforeEach(() => {
  for (const fn of Object.values(m)) fn.mockReset()
  m.updateMany.mockResolvedValue({ count: 1 })
  m.findMany.mockResolvedValue([{ id: "n1", status: "pending", claimedAt: null }])
  m.findUniqueOrThrow.mockResolvedValue({ id: "n1", attempts: 0, payload })
})

describe("collectNotifications / enqueueAndDeliver", () => {
  it("collects payloads instead of sending them", async () => {
    const c = collectNotifications()
    expect(await c.send(payload)).toEqual({ ok: true })
    expect(c.payloads).toEqual([payload])
    expect(m.sendNotification).not.toHaveBeenCalled()
  })

  it("stores the notifications and schedules delivery after the response", async () => {
    m.create.mockResolvedValueOnce({ id: "n1" }).mockResolvedValueOnce({ id: "n2" })
    await enqueueAndDeliver([payload, payload])
    expect(m.create).toHaveBeenCalledTimes(2)
    expect(m.after).toHaveBeenCalledOnce()
    expect(m.sendNotification).not.toHaveBeenCalled() // not inline
  })

  it("does nothing for an empty batch", async () => {
    await enqueueAndDeliver([])
    expect(m.create).not.toHaveBeenCalled()
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
