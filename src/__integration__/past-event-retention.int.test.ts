import { describe, it, expect, afterAll } from "vitest"

/**
 * #813 in observation mode against a real Postgres: what the 3-year rule would anonymise, counted
 * per organisation, and nothing changed. One member took part only in an old event, the other in
 * an old and a recent one.
 */

import { prisma } from "@/lib/prisma"
import { registrationToken } from "@/lib/token-vault"
import { observePastEvents } from "@/lib/past-event-retention-data"

const url = process.env.DATABASE_URL
const tag = `int-past-${Date.now()}`
const NOW = new Date("2026-10-09T12:00:00Z")

describe.skipIf(!url)("past events observation on Postgres (#813)", () => {
  let orgId = ""

  afterAll(async () => {
    if (orgId) {
      await prisma.registration.deleteMany({ where: { event: { organizationId: orgId } } })
      await prisma.organization.delete({ where: { id: orgId } }).catch(() => {})
    }
    await prisma.$disconnect()
  })

  it("counts the old event's registrations, members and answers, and changes nothing", async () => {
    orgId = (await prisma.organization.create({ data: { name: `Comité ${tag}`, slug: tag } })).id
    const event = (slug: string, day: string) => prisma.event.create({ data: { organizationId: orgId, slug, title: slug, startDate: new Date(day), endDate: new Date(day), publicStatus: "published" } })
    const old = await event("fete-2022", "2022-06-01")
    const recent = await event("fete-2026", "2026-06-01")
    const shift = (eventId: string, day: string) => prisma.shift.create({ data: { eventId, roleName: "Bar", label: "Bar", date: new Date(day), startTime: "18:00", endTime: "20:00", capacity: 5 } })
    const oldShift = await shift(old.id, "2022-06-01")
    const recentShift = await shift(recent.id, "2026-06-01")
    const onlyOld = await prisma.volunteer.create({ data: { organizationId: orgId, firstName: "Alice", lastName: "Martin", email: `${tag}-a@example.org` } })
    const both = await prisma.volunteer.create({ data: { organizationId: orgId, firstName: "Bruno", lastName: "Roux", email: `${tag}-b@example.org` } })
    const register = (eventId: string, shiftId: string, volunteerId: string, n: string) =>
      prisma.registration.create({ data: { eventId, shiftId, volunteerId, status: "active", comment: "Je viens avec ma fille", ...registrationToken.data(`${tag}-${n}`) } })
    await register(old.id, oldShift.id, onlyOld.id, "1")
    await register(old.id, oldShift.id, both.id, "2")
    await register(recent.id, recentShift.id, both.id, "3")

    const rows = await observePastEvents(NOW)
    const mine = rows.find((r) => r.organizationId === orgId)
    expect(mine).toMatchObject({ events: 1, registrations: 2, members: 2, membersOnlyOld: 1 })

    // Observation only: the old registrations keep their comment, the members their names.
    expect(await prisma.registration.count({ where: { eventId: old.id, comment: "Je viens avec ma fille" } })).toBe(2)
    expect((await prisma.volunteer.findUniqueOrThrow({ where: { id: onlyOld.id } })).firstName).toBe("Alice")
  })
})
