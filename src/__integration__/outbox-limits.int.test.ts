import { describe, it, expect, vi, afterAll, afterEach } from "vitest"

/**
 * Sending limits (#810) on the outbox, against a real Postgres: only SMTP is mocked. An email over
 * a limit is held, not failed: it stays pending, its attempts count does not move, and it is
 * tried again once its window ends.
 */

const smtp = vi.hoisted(() => vi.fn())
vi.mock("@/lib/notifications/channels/email", () => ({ emailChannel: { send: smtp } }))
vi.mock("next/server", () => ({ after: vi.fn() }))

import { prisma } from "@/lib/prisma"
import { deliverOutbox, enqueueNotifications } from "@/lib/notifications/outbox"
import { loadLimitHits } from "@/lib/limit-hits-data"

const url = process.env.DATABASE_URL
const tag = `int-limits-${Date.now()}`

describe.skipIf(!url)("outbox and sending limits on Postgres (#810)", () => {
  const rowIds: string[] = []
  let orgId = ""

  afterEach(() => {
    delete process.env.EMAIL_LIMIT_ORG_PER_MINUTE
  })

  afterAll(async () => {
    await prisma.notificationOutbox.deleteMany({ where: { id: { in: rowIds } } })
    if (orgId) await prisma.emailLimitHit.deleteMany({ where: { organizationId: orgId } })
    if (orgId) await prisma.organization.deleteMany({ where: { id: orgId } })
    await prisma.$disconnect()
  })

  it("holds the emails over the per-minute rate: pending, no attempt counted, retried after the window", async () => {
    smtp.mockReset().mockResolvedValue({ ok: true })
    orgId = (await prisma.organization.create({ data: { name: tag, slug: tag } })).id
    process.env.EMAIL_LIMIT_ORG_PER_MINUTE = "1"
    const ids = await enqueueNotifications([0, 1, 2].map((i) => ({ kind: "registration_confirmation" as const, recipient: { email: `${tag}-${i}@example.org` }, organizationId: orgId, data: { i } })))
    rowIds.push(...ids)

    const now = new Date()
    expect(await deliverOutbox({ ids, now })).toEqual({ sent: 1, retried: 0, failed: 0, cancelled: 0, held: 2 })
    expect(smtp).toHaveBeenCalledTimes(1)

    const held = await prisma.notificationOutbox.findMany({ where: { id: { in: ids }, status: "pending" } })
    expect(held).toHaveLength(2)
    expect(held.every((r) => r.attempts === 0 && r.claimedAt === null && r.nextAttemptAt.getTime() > now.getTime())).toBe(true)

    // Not due yet: nothing is sent, nothing is counted.
    expect(await deliverOutbox({ ids, now })).toEqual({ sent: 0, retried: 0, failed: 0, cancelled: 0, held: 0 })

    // #1100: the two held emails are recorded once, for the organisation, the limit and the hour;
    // the queue still holds them.
    expect(held.every((r) => r.lastHeldAt !== null)).toBe(true)
    const hits = await prisma.emailLimitHit.findMany({ where: { organizationId: orgId } })
    expect(hits).toMatchObject([{ limit: "org_per_minute", heldCount: 2, refusedCount: 0 }])
    let [view] = (await loadLimitHits({ organizationId: orgId, now })).groups
    expect(view).toMatchObject({ key: orgId, stillHeld: 2, queueStatus: "2 emails retenus encore en attente" })

    // Held again within the same hour (a retry still over the limit): not counted twice.
    const retryAt = new Date(now.getTime() + 61_000)
    // (The limiter's windows run on real time, in memory under test: the minute is still full.)
    expect((await deliverOutbox({ ids, now: retryAt })).held).toBe(2)
    expect((await prisma.emailLimitHit.findMany({ where: { organizationId: orgId } }))[0].heldCount).toBe(2)

    // Once there is room they leave, and the queue no longer holds any.
    process.env.EMAIL_LIMIT_ORG_PER_MINUTE = "10"
    const later = new Date(Date.now() + 10 * 60_000)
    expect((await deliverOutbox({ ids, now: later })).sent).toBe(2)
    ;[view] = (await loadLimitHits({ organizationId: orgId, now: later })).groups
    expect(view).toMatchObject({ stillHeld: 0, queueStatus: "Plus aucun email retenu en attente" })
  })
})
