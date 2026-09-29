import { describe, it, expect, vi, beforeAll, afterAll } from "vitest"

/**
 * Admin flows now run their writes and their notifications in `db.$transaction` on the
 * org-scoped client (#352). This checks against a real Postgres that the tenant scoping of
 * getOrgClient (#268) still applies to the transaction's `tx`, and that the outbox rows written
 * through it commit and roll back with the business change.
 */

vi.mock("next/server", () => ({ after: vi.fn() }))

import { prisma } from "@/lib/prisma"
import { getOrgClient } from "@/lib/prisma-org"
import { enqueueNotifications } from "@/lib/notifications/outbox"

const url = process.env.DATABASE_URL
const tag = `int-orgtx-${Date.now()}`

describe.skipIf(!url)("org-scoped transactions (#352)", () => {
  let orgA = ""
  let shiftA = ""
  let shiftB = ""

  beforeAll(async () => {
    const mk = async (suffix: string) => {
      const org = await prisma.organization.create({ data: { name: `Org ${suffix}`, slug: `${tag}-${suffix}` } })
      const event = await prisma.event.create({
        data: { organizationId: org.id, slug: "fete", title: "Fête", startDate: new Date("2030-06-01"), endDate: new Date("2030-06-01") },
      })
      const shift = await prisma.shift.create({
        data: { eventId: event.id, roleName: "Bar", label: "Bar", date: new Date("2030-06-01"), startTime: "10:00", endTime: "12:00", capacity: 5 },
      })
      return { org, shift }
    }
    const a = await mk("a")
    const b = await mk("b")
    orgA = a.org.id
    shiftA = a.shift.id
    shiftB = b.shift.id
  })

  afterAll(async () => {
    await prisma.notificationOutbox.deleteMany({ where: { dedupeKey: { startsWith: tag } } })
    await prisma.organization.deleteMany({ where: { slug: { startsWith: tag } } })
    await prisma.$disconnect()
  })

  it("a transaction's tx can't touch another organization's rows", async () => {
    const db = getOrgClient(orgA)
    await expect(db.$transaction(async (tx) => {
      await tx.shift.update({ where: { id: shiftB }, data: { label: "pwned" } })
    })).rejects.toMatchObject({ code: "P2025" })
    expect((await prisma.shift.findUniqueOrThrow({ where: { id: shiftB } })).label).toBe("Bar")
  })

  it("the business change and its outbox rows commit together, or not at all", async () => {
    const db = getOrgClient(orgA)
    const payload = (k: string) => ({ kind: "shift_modified" as const, dedupeKey: `${tag}-${k}`, recipient: { email: "v@x.ch" }, data: {} })

    await expect(db.$transaction(async (tx) => {
      await tx.shift.update({ where: { id: shiftA }, data: { label: "Rolled back" } })
      await enqueueNotifications([payload("rollback")], tx)
      throw new Error("failure after enqueue")
    })).rejects.toThrow("failure after enqueue")
    expect((await prisma.shift.findUniqueOrThrow({ where: { id: shiftA } })).label).toBe("Bar")
    expect(await prisma.notificationOutbox.count({ where: { dedupeKey: `${tag}-rollback` } })).toBe(0)

    const ids = await db.$transaction(async (tx) => {
      await tx.shift.update({ where: { id: shiftA }, data: { label: "Committed" } })
      return enqueueNotifications([payload("commit")], tx)
    })
    expect(ids).toHaveLength(1)
    expect((await prisma.shift.findUniqueOrThrow({ where: { id: shiftA } })).label).toBe("Committed")
    expect(await prisma.notificationOutbox.count({ where: { dedupeKey: `${tag}-commit` } })).toBe(1)
  })
})
