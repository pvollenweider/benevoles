// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Server-only queries behind the « Charge par jour » chart of the super-admin statistics page
 * (#1415). Pure selection, bucketing and axis logic lives in src/lib/operator-load.ts, which the
 * client component imports; this file is the only place that touches Prisma.
 *
 * Rules, the same as the event counts and the 10-next-events table: published and archived events
 * (drafts excluded, unlisted published ones included), non-cancelled shifts, active registrations.
 * Days are Zurich civil days. Five bounded aggregate queries, never one query per event: whole-event
 * shift and registration totals, per-(event, day) shift totals, the shift ids of the window (to
 * attach its registrations to a day) and the whole-event registrations.
 */

import { prisma } from "./prisma"
import { APP_TIME_ZONE } from "./time-zone"
import { addDays, civilDate, isoDay } from "./operator-activity"
import type { LoadDay, LoadEvent, OperatorLoadData } from "./operator-load"

/** Half-width of the loaded window: today − 364 … today + 364, enough for every range. */
export const LOAD_WINDOW_DAYS = 364

const dayKey = (eventId: string, day: string): string => `${eventId}|${day}`

/**
 * Everything the load chart needs: the events overlapping today ± 364 days and one row per
 * (day, event) with at least one non-cancelled shift. Dates are serialised as "YYYY-MM-DD", so no
 * Date, Prisma model or volunteer data crosses the server/client boundary.
 */
export async function loadOperatorLoad(now: Date = new Date()): Promise<OperatorLoadData> {
  const today = civilDate(now, APP_TIME_ZONE)
  const start = addDays(today, -LOAD_WINDOW_DAYS)
  const end = addDays(today, LOAD_WINDOW_DAYS)
  const startDate = new Date(`${start}T00:00:00.000Z`)
  const endDate = new Date(`${end}T00:00:00.000Z`)

  const events = await prisma.event.findMany({
    where: {
      publicStatus: { in: ["published", "archived"] },
      startDate: { lte: endDate },
      endDate: { gte: startDate },
    },
    select: {
      id: true,
      title: true,
      publicStatus: true,
      startDate: true,
      endDate: true,
      organization: { select: { name: true, slug: true } },
    },
    orderBy: [{ startDate: "asc" }, { id: "asc" }],
  })
  const ids = events.map((event) => event.id)
  if (ids.length === 0) return { today, events: [], days: [] }

  const [wholeShiftGroups, dayShiftGroups, windowShifts, wholeRegistrationGroups, dayRegistrationGroups] = await Promise.all([
    // Whole event, whatever the dates of its shifts: the detail panel says « sur tout l'événement ».
    prisma.shift.groupBy({
      by: ["eventId"],
      where: { eventId: { in: ids }, status: { not: "cancelled" } },
      _count: { _all: true },
      _sum: { capacity: true },
    }),
    // The rows plotted by the chart: one aggregate per (event, day), never one query per event.
    prisma.shift.groupBy({
      by: ["eventId", "date"],
      where: { eventId: { in: ids }, status: { not: "cancelled" }, date: { gte: startDate, lte: endDate } },
      _count: { _all: true },
      _sum: { capacity: true },
    }),
    // Light id → (event, day) map, used to attach the registrations of the window to their day.
    prisma.shift.findMany({
      where: { eventId: { in: ids }, status: { not: "cancelled" }, date: { gte: startDate, lte: endDate } },
      select: { id: true, eventId: true, date: true },
    }),
    prisma.registration.groupBy({
      by: ["eventId"],
      where: { eventId: { in: ids }, status: "active", shift: { status: { not: "cancelled" } } },
      _count: { _all: true },
    }),
    prisma.registration.groupBy({
      by: ["shiftId"],
      where: {
        status: "active",
        shift: { eventId: { in: ids }, status: { not: "cancelled" }, date: { gte: startDate, lte: endDate } },
      },
      _count: { _all: true },
    }),
  ])

  const dayRows = new Map<string, LoadDay>()
  for (const group of dayShiftGroups) {
    const day = isoDay(group.date)
    dayRows.set(dayKey(group.eventId, day), {
      day,
      eventId: group.eventId,
      shifts: group._count._all,
      capacity: group._sum.capacity ?? 0,
      registrations: 0,
    })
  }

  const shiftLocation = new Map(windowShifts.map((shift) => [shift.id, { eventId: shift.eventId, day: isoDay(shift.date) }]))
  for (const group of dayRegistrationGroups) {
    const location = shiftLocation.get(group.shiftId)
    if (!location) continue
    const row = dayRows.get(dayKey(location.eventId, location.day))
    if (row) row.registrations += group._count._all
  }

  const wholeShifts = new Map(wholeShiftGroups.map((group) => [group.eventId, { shifts: group._count._all, capacity: group._sum.capacity ?? 0 }]))
  const wholeRegistrations = new Map(wholeRegistrationGroups.map((group) => [group.eventId, group._count._all]))

  const loadEvents: LoadEvent[] = events.map((event) => {
    const shifts = wholeShifts.get(event.id)
    return {
      id: event.id,
      title: event.title,
      organizationName: event.organization.name,
      organizationSlug: event.organization.slug,
      startDate: isoDay(event.startDate),
      endDate: isoDay(event.endDate),
      archived: event.publicStatus === "archived",
      shifts: shifts?.shifts ?? 0,
      capacity: shifts?.capacity ?? 0,
      registrations: wholeRegistrations.get(event.id) ?? 0,
    }
  })

  const days = [...dayRows.values()].sort((a, b) => a.day.localeCompare(b.day) || a.eventId.localeCompare(b.eventId))

  return { today, events: loadEvents, days }
}
