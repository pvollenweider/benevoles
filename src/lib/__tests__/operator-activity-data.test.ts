// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { beforeEach, describe, expect, it, vi } from "vitest"

const db = vi.hoisted(() => ({
  eventFindMany: vi.fn(),
  eventCount: vi.fn(),
  shiftGroupBy: vi.fn(),
  registrationGroupBy: vi.fn(),
  outboxCount: vi.fn(),
  queryRaw: vi.fn(),
}))
vi.mock("@/lib/prisma", () => ({
  prisma: {
    event: { findMany: db.eventFindMany, count: db.eventCount },
    shift: { groupBy: db.shiftGroupBy },
    registration: { groupBy: db.registrationGroupBy },
    notificationOutbox: { count: db.outboxCount },
    $queryRaw: db.queryRaw,
  },
}))

import { loadOperatorActivity } from "../operator-activity-data"
import { APP_TIME_ZONE } from "../time-zone"

// The loader of the operator statistics (#1415): bounded event lists, one groupBy per relation and
// no per-event query. Unlisted events are published, so they are counted; drafts and archived
// events are filtered in the database (publicStatus).

const now = new Date("2026-07-10T09:00:00Z")
const day = (iso: string) => new Date(`${iso}T00:00:00Z`)

const event = (id: string, title: string, over: Record<string, unknown> = {}) => ({
  id,
  title,
  publicStatus: "published",
  isListed: true,
  startDate: day("2026-07-10"),
  endDate: day("2026-07-10"),
  organization: { name: "Fête", slug: "fete" },
  ...over,
})

beforeEach(() => {
  vi.clearAllMocks()
  db.eventFindMany.mockResolvedValue([
    event("today", "Fête du village"),
    event("unlisted", "Soirée privée", { isListed: false }),
    event("soon", "Festival du lac", { startDate: day("2026-07-13"), endDate: day("2026-07-13") }),
  ])
  db.eventCount.mockResolvedValueOnce(2).mockResolvedValueOnce(1)
  db.outboxCount.mockResolvedValue(3)
  db.shiftGroupBy.mockResolvedValue([
    { eventId: "today", roleName: "Bar", _count: { _all: 2 }, _sum: { capacity: 10 } },
    { eventId: "today", roleName: "Caisse", _count: { _all: 1 }, _sum: { capacity: 5 } },
    { eventId: "unlisted", roleName: "Bar", _count: { _all: 1 }, _sum: { capacity: 4 } },
    { eventId: "soon", roleName: "Accueil", _count: { _all: 3 }, _sum: { capacity: 6 } },
  ])
  db.registrationGroupBy.mockResolvedValue([
    { eventId: "today", _count: { _all: 5 } },
    { eventId: "unlisted", _count: { _all: 2 } },
    { eventId: "soon", _count: { _all: 40 } },
  ])
  db.queryRaw
    .mockResolvedValueOnce([{ lastHour: 1, previousHour: 2, last24h: 10, previous24h: 8, last7d: 50, previous7d: 40 }])
    .mockResolvedValueOnce([{ hour: "2026-07-09 18", count: 12 }])
})

describe("loadOperatorActivity", () => {
  it("reads bounded event lists and aggregates the postes and registrations once", async () => {
    const activity = await loadOperatorActivity(now)

    expect(db.eventFindMany).toHaveBeenCalledTimes(2)
    const windowQuery = db.eventFindMany.mock.calls[0][0]
    expect(windowQuery.where).toEqual({
      publicStatus: "published",
      endDate: { gte: day("2026-07-10") },
      startDate: { lte: day("2026-08-09") },
    })
    expect(windowQuery.where).not.toHaveProperty("isListed") // unlisted events are published
    expect(db.eventFindMany.mock.calls[1][0]).toMatchObject({ orderBy: [{ startDate: "asc" }, { id: "asc" }], take: 10 })

    expect(db.shiftGroupBy).toHaveBeenCalledTimes(1)
    expect(db.shiftGroupBy.mock.calls[0][0]).toMatchObject({
      by: ["eventId", "roleName"],
      where: { eventId: { in: ["today", "unlisted", "soon"] }, status: { not: "cancelled" } },
      _count: { _all: true },
      _sum: { capacity: true },
    })
    expect(db.registrationGroupBy).toHaveBeenCalledTimes(1)
    expect(db.registrationGroupBy.mock.calls[0][0]).toMatchObject({
      by: ["eventId"],
      where: { eventId: { in: ["today", "unlisted", "soon"] }, status: "active", shift: { status: { not: "cancelled" } } },
    })

    expect(activity.counts).toEqual({ now: 2, startingWithin7: 1, startingWithin30: 1, registrationsOpenNow: 2, registrationOpeningsNext7Days: 1 })
    expect(activity.nextEvents.find((row) => row.id === "today")).toMatchObject({
      organizationName: "Fête",
      organizationSlug: "fete",
      // An event whose days include today is « En cours » in the merged table.
      situation: "now",
      roles: 2,
      shifts: 3,
      registrations: 5,
      capacity: 15,
      fillPercent: 33,
    })
    expect(activity.nextEvents.find((row) => row.id === "soon")).toMatchObject({ situation: "soon7" })
    expect(activity.activity).toMatchObject({ outboxWaiting: 3, busiestHour: { hour: "2026-07-09T18", count: 12 } })
    expect(activity.activity.rows.map((row) => row.current)).toEqual([1, 10, 50])
  })

  it("reads createdAt as UTC before converting it to the Zurich hour", async () => {
    await loadOperatorActivity(now)

    // The second aggregate is the busiest-hour query. "createdAt" is a timestamp WITHOUT time
    // zone holding UTC: reading it directly with AT TIME ZONE APP_TIME_ZONE would interpret it as
    // Zurich local time (1 h late in winter, 2 h in summer). The double conversion is pinned here.
    const [strings, ...values] = db.queryRaw.mock.calls[1] as [TemplateStringsArray, ...unknown[]]
    const sql = strings.join("?")
    expect(sql).toContain(`("createdAt" AT TIME ZONE 'UTC') AT TIME ZONE ?`)
    expect(values[0]).toBe(APP_TIME_ZONE)
    expect(sql).not.toMatch(/"createdAt" AT TIME ZONE \?/)
  })
})
