// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { beforeEach, describe, expect, it, vi } from "vitest"

const db = vi.hoisted(() => ({
  eventFindMany: vi.fn(),
  shiftGroupBy: vi.fn(),
  shiftFindMany: vi.fn(),
  registrationGroupBy: vi.fn(),
}))
vi.mock("@/lib/prisma", () => ({
  prisma: {
    event: { findMany: db.eventFindMany },
    shift: { groupBy: db.shiftGroupBy, findMany: db.shiftFindMany },
    registration: { groupBy: db.registrationGroupBy },
  },
}))

import { loadOperatorLoad } from "../operator-load-data"

// The server loader of « Charge par jour » (#1415): published and archived events overlapping
// today ± 364 days, whole-event totals and one row per (day, event). Five bounded queries, no
// loop over events, no volunteer data, and only plain days cross the client boundary.

const now = new Date("2026-07-10T09:00:00Z")
const day = (iso: string) => new Date(`${iso}T00:00:00Z`)

beforeEach(() => {
  vi.clearAllMocks()
  db.eventFindMany.mockResolvedValue([
    { id: "e1", title: "Fête du village", publicStatus: "published", startDate: day("2026-07-10"), endDate: day("2026-07-10"), organization: { name: "Fête", slug: "fete" } },
    { id: "e2", title: "Vieille fête", publicStatus: "archived", startDate: day("2026-07-11"), endDate: day("2026-07-11"), organization: { name: "Vieux", slug: "vieux" } },
  ])
  db.shiftGroupBy
    .mockResolvedValueOnce([
      { eventId: "e1", _count: { _all: 2 }, _sum: { capacity: 10 } },
      { eventId: "e2", _count: { _all: 1 }, _sum: { capacity: 2 } },
    ])
    .mockResolvedValueOnce([
      { eventId: "e1", date: day("2026-07-10"), _count: { _all: 2 }, _sum: { capacity: 10 } },
      { eventId: "e2", date: day("2026-07-11"), _count: { _all: 1 }, _sum: { capacity: 2 } },
    ])
  db.shiftFindMany.mockResolvedValue([
    { id: "s1", eventId: "e1", date: day("2026-07-10") },
    { id: "s2", eventId: "e1", date: day("2026-07-10") },
    { id: "s3", eventId: "e2", date: day("2026-07-11") },
  ])
  db.registrationGroupBy
    .mockResolvedValueOnce([
      { eventId: "e1", _count: { _all: 3 } },
      { eventId: "e2", _count: { _all: 1 } },
    ])
    .mockResolvedValueOnce([
      { shiftId: "s1", _count: { _all: 2 } },
      { shiftId: "s2", _count: { _all: 1 } },
      { shiftId: "s3", _count: { _all: 1 } },
    ])
})

describe("loadOperatorLoad", () => {
  it("reads overlapping published and archived events, then aggregates in bounded queries", async () => {
    const data = await loadOperatorLoad(now)

    expect(db.eventFindMany).toHaveBeenCalledTimes(1)
    expect(db.eventFindMany.mock.calls[0][0]).toMatchObject({
      where: {
        publicStatus: { in: ["published", "archived"] },
        startDate: { lte: day("2027-07-09") },
        endDate: { gte: day("2025-07-11") },
      },
    })
    expect(db.eventFindMany.mock.calls[0][0].where).not.toHaveProperty("isListed") // unlisted published events count

    expect(db.shiftGroupBy).toHaveBeenCalledTimes(2)
    expect(db.shiftGroupBy.mock.calls[0][0]).toMatchObject({
      by: ["eventId"],
      where: { eventId: { in: ["e1", "e2"] }, status: { not: "cancelled" } },
    })
    expect(db.shiftGroupBy.mock.calls[1][0]).toMatchObject({
      by: ["eventId", "date"],
      where: { eventId: { in: ["e1", "e2"] }, status: { not: "cancelled" }, date: { gte: day("2025-07-11"), lte: day("2027-07-09") } },
    })
    expect(db.registrationGroupBy).toHaveBeenCalledTimes(2)
    expect(db.registrationGroupBy.mock.calls[0][0]).toMatchObject({
      by: ["eventId"],
      where: { eventId: { in: ["e1", "e2"] }, status: "active", shift: { status: { not: "cancelled" } } },
    })
    expect(db.registrationGroupBy.mock.calls[1][0]).toMatchObject({
      by: ["shiftId"],
      where: { status: "active", shift: { eventId: { in: ["e1", "e2"] }, status: { not: "cancelled" }, date: { gte: day("2025-07-11"), lte: day("2027-07-09") } } },
    })

    expect(data.today).toBe("2026-07-10")
    expect(data.events.map((event) => [event.id, event.archived, event.shifts, event.capacity, event.registrations])).toEqual([
      ["e1", false, 2, 10, 3],
      ["e2", true, 1, 2, 1],
    ])
    expect(data.days).toEqual([
      { day: "2026-07-10", eventId: "e1", shifts: 2, capacity: 10, registrations: 3 },
      { day: "2026-07-11", eventId: "e2", shifts: 1, capacity: 2, registrations: 1 },
    ])
    // Only plain values cross the client boundary.
    expect(data.days[0].day).toBe("2026-07-10")
    expect(Object.keys(data.days[0]).sort()).toEqual(["capacity", "day", "eventId", "registrations", "shifts"])
  })

  it("returns no day row and no query when no event overlaps the window", async () => {
    db.eventFindMany.mockResolvedValueOnce([])
    const data = await loadOperatorLoad(now)
    expect(data).toEqual({ today: "2026-07-10", events: [], days: [] })
    expect(db.shiftGroupBy).not.toHaveBeenCalled()
    expect(db.registrationGroupBy).not.toHaveBeenCalled()
  })
})
