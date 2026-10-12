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
})
