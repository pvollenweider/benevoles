import { describe, it, expect, vi, beforeEach, afterAll } from "vitest"

/**
 * Notification outbox against a real Postgres (#319): the unit tests mock Prisma, which can't
 * prove that the conditional claim holds under real concurrency, that `claimedAt IS NULL`
 * matches, or that retry dates are stored as computed.
 */

const sent = vi.hoisted(() => vi.fn())
vi.mock("@/lib/notifications/index", () => ({ sendNotification: sent }))
vi.mock("next/server", () => ({ after: vi.fn() }))

import { prisma } from "@/lib/prisma"
import { backoffMs, deliverOutbox, enqueueNotifications } from "@/lib/notifications/outbox"

const url = process.env.DATABASE_URL
const tag = `int-${Date.now()}`
const payload = (i: number) => ({ kind: "registration_confirmation" as const, recipient: { email: `${tag}-${i}@x.ch` }, data: { i } })

describe.skipIf(!url)("outbox on Postgres (#319)", () => {
  const ids: string[] = []

  beforeEach(() => {
    sent.mockReset()
    // A slow SMTP makes the two deliveries overlap for real.
    sent.mockImplementation(async () => { await new Promise((r) => setTimeout(r, 20)); return { ok: true } })
  })

  afterAll(async () => {
    await prisma.notificationOutbox.deleteMany({ where: { id: { in: ids } } })
    await prisma.$disconnect()
  })

  it("two concurrent deliveries send each row exactly once", async () => {
    const rowIds = await enqueueNotifications(Array.from({ length: 10 }, (_, i) => payload(i)))
    ids.push(...rowIds)

    const [a, b] = await Promise.all([deliverOutbox({ ids: rowIds }), deliverOutbox({ ids: rowIds })])

    expect(a.sent + b.sent).toBe(10)
    expect(sent).toHaveBeenCalledTimes(10)
    const emails = sent.mock.calls.map((c) => c[0].recipient.email)
    expect(new Set(emails).size).toBe(10)
    const rows = await prisma.notificationOutbox.findMany({ where: { id: { in: rowIds } } })
    expect(rows.every((r) => r.status === "sent" && r.sentAt)).toBe(true)
  })

  it("a failure is stored for retry with the computed date, then sent once due", async () => {
    const [id] = await enqueueNotifications([payload(100)])
    ids.push(id)
    sent.mockResolvedValueOnce({ ok: false, reason: "smtp down" })
    const now = new Date()

    expect(await deliverOutbox({ ids: [id], now })).toEqual({ sent: 0, retried: 1, failed: 0 })
    const failed = await prisma.notificationOutbox.findUniqueOrThrow({ where: { id } })
    expect(failed.status).toBe("pending")
    expect(failed.attempts).toBe(1)
    expect(failed.claimedAt).toBeNull()
    expect(failed.nextAttemptAt.getTime()).toBe(now.getTime() + backoffMs(1))

    // Not due yet: nothing happens.
    expect(await deliverOutbox({ ids: [id], now })).toEqual({ sent: 0, retried: 0, failed: 0 })
    // Due: sent.
    expect(await deliverOutbox({ ids: [id], now: new Date(now.getTime() + backoffMs(1)) })).toEqual({ sent: 1, retried: 0, failed: 0 })
  })

  it("a claim abandoned by a crashed delivery is picked up again after 15 minutes", async () => {
    const [id] = await enqueueNotifications([payload(200)])
    ids.push(id)
    const crashedAt = new Date(Date.now() - 16 * 60 * 1000)
    await prisma.notificationOutbox.update({ where: { id }, data: { status: "sending", claimedAt: crashedAt } })

    expect(await deliverOutbox({ ids: [id] })).toEqual({ sent: 1, retried: 0, failed: 0 })

    // A fresh claim (another delivery in progress) is left alone.
    const [id2] = await enqueueNotifications([payload(201)])
    ids.push(id2)
    await prisma.notificationOutbox.update({ where: { id: id2 }, data: { status: "sending", claimedAt: new Date() } })
    expect(await deliverOutbox({ ids: [id2] })).toEqual({ sent: 0, retried: 0, failed: 0 })
  })

  it("stored with a transaction's client, rows commit or roll back with it (#352)", async () => {
    // Rolled back: the business change failed after its notifications were enqueued.
    const keyRolledBack = `${tag}-tx-rollback`
    await expect(prisma.$transaction(async (tx) => {
      await enqueueNotifications([{ ...payload(400), dedupeKey: keyRolledBack }], tx)
      throw new Error("business failure after enqueue")
    })).rejects.toThrow("business failure after enqueue")
    expect(await prisma.notificationOutbox.count({ where: { dedupeKey: keyRolledBack } })).toBe(0)

    // Committed: the rows exist only once the transaction is done, then deliver normally.
    const keyCommitted = `${tag}-tx-commit`
    const rowIds = await prisma.$transaction(async (tx) => {
      const ids = await enqueueNotifications([{ ...payload(401), dedupeKey: keyCommitted }], tx)
      // Not visible outside the transaction before it commits.
      expect(await prisma.notificationOutbox.count({ where: { dedupeKey: keyCommitted } })).toBe(0)
      return ids
    })
    ids.push(...rowIds)
    expect(rowIds).toHaveLength(1)
    expect(await deliverOutbox({ ids: rowIds })).toEqual({ sent: 1, retried: 0, failed: 0 })
  })

  it("a dedupe key is stored once even when enqueued concurrently", async () => {
    const key = `${tag}-dedupe`
    const results = await Promise.all([1, 2, 3].map(() => enqueueNotifications([{ ...payload(300), dedupeKey: key }])))
    const created = results.flat()
    ids.push(...created)
    expect(created).toHaveLength(1)
    expect(await prisma.notificationOutbox.count({ where: { dedupeKey: key } })).toBe(1)
  })
})
