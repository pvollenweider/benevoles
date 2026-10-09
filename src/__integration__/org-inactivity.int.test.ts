import { describe, it, expect, afterAll } from "vitest"

/**
 * #811 report mode against a real Postgres: the organisation's own writes record its activity (at
 * most hourly), a scheduled-job write through the raw client does not, and the report lists an
 * organisation idle for 18 months with no upcoming event, nothing sent or changed.
 */

import { prisma } from "@/lib/prisma"
import { getOrgClient } from "@/lib/prisma-org"
import { touchOrgActivity } from "@/lib/org-activity"
import { loadInactivityReport } from "@/lib/org-inactivity-data"

const url = process.env.DATABASE_URL
const tag = `int-inact-${Date.now()}`

describe.skipIf(!url)("periodic check of inactive organisations on Postgres (#811)", () => {
  const ids: string[] = []

  afterAll(async () => {
    await prisma.organization.deleteMany({ where: { id: { in: ids } } })
    await prisma.$disconnect()
  })

  it("records the organisation's writes, at most hourly, not the raw client's", async () => {
    const org = await prisma.organization.create({ data: { name: `Actif ${tag}`, slug: `${tag}-a`, lastMeaningfulActivityAt: new Date("2024-01-01T00:00:00Z") } })
    ids.push(org.id)
    // A scheduled job writes through the raw client: no activity.
    await prisma.event.create({ data: { organizationId: org.id, slug: "job", title: "Job", startDate: new Date("2024-02-01"), endDate: new Date("2024-02-01") } })
    expect((await prisma.organization.findUniqueOrThrow({ where: { id: org.id } })).lastMeaningfulActivityAt).toEqual(new Date("2024-01-01T00:00:00Z"))

    // The organisation's own write records it.
    await getOrgClient(org.id).event.create({ data: { organizationId: org.id, slug: "fete", title: "Fête", startDate: new Date("2024-03-01"), endDate: new Date("2024-03-01") } })
    await new Promise((r) => setTimeout(r, 200))
    const touched = (await prisma.organization.findUniqueOrThrow({ where: { id: org.id } })).lastMeaningfulActivityAt!
    expect(Date.now() - touched.getTime()).toBeLessThan(60_000)

    // Within the hour, no second write.
    await touchOrgActivity(org.id, new Date(touched.getTime() + 10 * 60_000))
    expect((await prisma.organization.findUniqueOrThrow({ where: { id: org.id } })).lastMeaningfulActivityAt).toEqual(touched)
  })

  it("lists an organisation idle for 18 months with no upcoming event, and changes nothing", async () => {
    // First email due on 1 September 2026: on 9 October, the second reminder is the current step.
    const idle = await prisma.organization.create({ data: { name: `Inactive ${tag}`, slug: `${tag}-i`, lastMeaningfulActivityAt: new Date("2025-03-01T00:00:00Z") } })
    const planned = await prisma.organization.create({ data: { name: `Prévue ${tag}`, slug: `${tag}-p`, lastMeaningfulActivityAt: new Date("2024-01-01T00:00:00Z") } })
    ids.push(idle.id, planned.id)
    await prisma.event.create({ data: { organizationId: planned.id, slug: "avenir", title: "À venir", startDate: new Date("2027-06-01"), endDate: new Date("2027-06-01") } })

    const now = new Date("2026-10-09T12:00:00Z")
    const rows = await loadInactivityReport(now)
    expect(rows.find((r) => r.id === idle.id)?.assessment).toMatchObject({ state: "due", step: "second" })
    expect(rows.find((r) => r.id === planned.id)).toBeUndefined()
    expect((await prisma.organization.findUniqueOrThrow({ where: { id: idle.id } })).active).toBe(true)
  })
})
