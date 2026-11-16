import { describe, it, expect, afterAll, vi } from "vitest"

/** #869 on Postgres: withdrawals of one event to one person within the delay make one outbox row. */

vi.mock("@/lib/notifications", () => ({ sendNotification: vi.fn() }))
vi.mock("next/server", () => ({ after: vi.fn() }))

import { prisma } from "@/lib/prisma"
import { openPayload } from "@/lib/notifications/outbox"
import { queueDigestItem } from "@/lib/notifications/digest"

const url = process.env.DATABASE_URL
const tag = `int-wd-${Date.now()}`

describe.skipIf(!url)("withdrawal digest (#869)", () => {
  afterAll(async () => {
    await prisma.notificationOutbox.deleteMany({ where: { dedupeKey: { startsWith: tag } } })
    await prisma.$disconnect()
  })

  it("groups items, skips one repeated while pending, and starts a new row once the first is no longer pending", async () => {
    const t0 = new Date()
    const queue = (itemKey: string, at: Date) => queueDigestItem({
      kind: "registration_cancelled", groupKey: `${tag}:evt:a@x.org`, recipient: { email: "a@x.org" }, organizationId: null,
      base: { eventId: "evt", eventTitle: "Fête" }, item: { volunteerName: itemKey }, itemKey, now: at, delayMs: 300_000,
    })
    await queue("r1", t0)
    await queue("r2", new Date(t0.getTime() + 60_000))
    await queue("r2", new Date(t0.getTime() + 61_000))
    let rows = await prisma.notificationOutbox.findMany({ where: { dedupeKey: { startsWith: tag } } })
    expect(rows).toHaveLength(1)
    expect((openPayload(rows[0].payload).data as { items: unknown[] }).items).toHaveLength(2)
    // The repeated item is skipped: it does not push the email back.
    expect(rows[0].nextAttemptAt.getTime()).toBe(t0.getTime() + 60_000 + 300_000)

    await prisma.notificationOutbox.update({ where: { id: rows[0].id }, data: { status: "sent" } })
    await queue("r3", new Date(t0.getTime() + 600_000))
    rows = await prisma.notificationOutbox.findMany({ where: { dedupeKey: { startsWith: tag } } })
    expect(rows).toHaveLength(2)
  })

  it("never rewrites a row a delivery claimed after the read: the item starts a row of its own", async () => {
    const group = `${tag}:race:b@x.org`
    const queue = (itemKey: string) => queueDigestItem({
      kind: "registration_cancelled", groupKey: group, recipient: { email: "b@x.org" }, organizationId: null,
      base: { eventId: "evt", eventTitle: "Fête" }, item: { volunteerName: itemKey }, itemKey, now: new Date(), delayMs: 300_000,
    })
    await queue("r1")
    const [first] = await prisma.notificationOutbox.findMany({ where: { dedupeKey: { startsWith: `${group}:` } } })
    // A delivery claims the row right after the queue read it as pending (the cron takes no group lock).
    const realTransaction = prisma.$transaction.bind(prisma) as (fn: (tx: unknown) => Promise<unknown>) => Promise<unknown>
    const spy = vi.spyOn(prisma, "$transaction").mockImplementationOnce(((fn: (tx: unknown) => Promise<unknown>) => realTransaction(async (tx) => {
      const t = tx as { notificationOutbox: { findFirst: (a: unknown) => Promise<unknown> } }
      const outbox = new Proxy(t.notificationOutbox, {
        get(target, prop, receiver) {
          if (prop !== "findFirst") return Reflect.get(target, prop, receiver)
          return async (args: unknown) => {
            const found = await target.findFirst(args)
            await prisma.notificationOutbox.update({ where: { id: first.id }, data: { status: "sending", claimedAt: new Date() } })
            return found
          }
        },
      })
      return fn(new Proxy(tx as object, { get: (target, prop, receiver) => (prop === "notificationOutbox" ? outbox : Reflect.get(target, prop, receiver)) }))
    })) as never)
    await queue("r2")
    spy.mockRestore()

    const rows = await prisma.notificationOutbox.findMany({ where: { dedupeKey: { startsWith: `${group}:` } }, orderBy: { createdAt: "asc" } })
    expect(rows).toHaveLength(2)
    expect((openPayload(rows[0].payload).data as { items: { key: string }[] }).items.map((i) => i.key)).toEqual(["r1"])
    expect((openPayload(rows[1].payload).data as { items: { key: string }[] }).items.map((i) => i.key)).toEqual(["r2"])
  })
})
