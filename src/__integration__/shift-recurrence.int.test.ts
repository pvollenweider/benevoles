import { describe, it, expect, afterAll } from "vitest"

/**
 * #866 on a real Postgres: a recurring permanence and its shifts are written through the
 * organisation's scoped client, the rule is invisible to another organisation, and deleting the
 * rule keeps its shifts (and their registrations).
 */

import { prisma } from "@/lib/prisma"
import { getOrgClient, TenantAccessError } from "@/lib/prisma-org"
import { generateRecurrence } from "@/lib/shift-recurrence"

const url = process.env.DATABASE_URL
const tag = `int-recur-${Date.now()}`

describe.skipIf(!url)("recurring permanences on Postgres (#866)", () => {
  const ids: string[] = []

  afterAll(async () => {
    await prisma.organization.deleteMany({ where: { id: { in: ids } } })
    await prisma.$disconnect()
  })

  it("creates the rule and its shifts in the organisation, keeps the shifts when the rule goes", async () => {
    const orgA = await prisma.organization.create({ data: { name: `A ${tag}`, slug: `${tag}-a` } })
    const orgB = await prisma.organization.create({ data: { name: `B ${tag}`, slug: `${tag}-b` } })
    ids.push(orgA.id, orgB.id)
    const event = await prisma.event.create({ data: { organizationId: orgA.id, slug: "saison", title: "Saison", startDate: new Date("2026-09-01"), endDate: new Date("2027-06-30") } })

    const db = getOrgClient(orgA.id)
    const { shifts } = generateRecurrence({ from: "2026-09-01", until: "2026-12-31", weekdays: [3], everyWeeks: 1, startTime: "14:00", endTime: "17:00", slotMinutes: 180, holidays: "FR", closures: [] })
    const rule = await db.$transaction(async (tx) => {
      const rule = await tx.shiftRecurrence.create({
        data: { eventId: event.id, roleName: "Accueil", label: "Accueil", weekdays: [3], startTime: "14:00", endTime: "17:00", slotMinutes: 180, capacity: 2, fromDate: new Date("2026-09-01"), untilDate: new Date("2026-12-31"), holidays: "FR" },
      })
      await tx.shift.createMany({ data: shifts.map((s) => ({ eventId: event.id, roleName: "Accueil", label: "Accueil", capacity: 2, date: new Date(s.date), startTime: s.startTime, endTime: s.endTime, recurrenceId: rule.id })) })
      return rule
    })
    // Wednesdays from 2 September to 30 December 2026, 11 November being a Wednesday holiday.
    expect(await db.shift.count({ where: { recurrenceId: rule.id } })).toBe(18 - 1)

    // Another organisation sees nothing and can't touch it.
    const other = getOrgClient(orgB.id)
    expect(await other.shiftRecurrence.findUnique({ where: { id: rule.id } })).toBeNull()
    await expect(other.shiftRecurrence.delete({ where: { id: rule.id } })).rejects.toBeInstanceOf(TenantAccessError)

    await db.shiftRecurrence.delete({ where: { id: rule.id } })
    expect(await db.shift.count({ where: { eventId: event.id } })).toBe(17)
    expect(await db.shift.count({ where: { eventId: event.id, recurrenceId: null } })).toBe(17)
  })
})
