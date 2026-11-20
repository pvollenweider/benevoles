// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Queries behind the operator activity and event-size sections of the super-admin statistics page
 * (#1415). Server only: the pure rules, formatting and chart data are in
 * src/lib/operator-activity.ts, never imported with Prisma by a client component.
 *
 * Aggregate queries only: two bounded event lists (the 30-day event window and the 10 next
 * events), one groupBy on postes and one on registrations for their ids, plus counts and two SQL
 * aggregates over the registration table. No loop over every event and no volunteer data.
 */

import type { Prisma } from "@/generated/prisma/client"
import { prisma } from "./prisma"
import { APP_TIME_ZONE } from "./time-zone"
import {
  activityRows,
  addDays,
  civilDate,
  eventWindowCounts,
  fillRate,
  busiestHour,
  upcomingSituation,
  type ActivityCounts,
  type ActivityRow,
  type EventWindowCounts,
  type HourBucket,
  type UpcomingSituation,
} from "./operator-activity"

const DAY_MS = 86_400_000

export type NextEventRow = {
  id: string
  organizationName: string
  /** Super-admin page of the organisation, linked under the event title. */
  organizationSlug: string
  title: string
  startDate: Date
  endDate: Date
  /** Window category of the event (now / 7 days / 30 days / plus tard). */
  situation: UpcomingSituation
  roles: number
  shifts: number
  registrations: number
  capacity: number
  fillPercent: number | null
}

export type OperatorActivity = {
  generatedAt: Date
  counts: EventWindowCounts & {
    registrationsOpenNow: number
    registrationOpeningsNext7Days: number
  }
  activity: {
    counts: ActivityCounts
    rows: ActivityRow[]
    busiestHour: HourBucket | null
    outboxWaiting: number
  }
  nextEvents: NextEventRow[]
}

const EVENT_SELECT = {
  id: true,
  title: true,
  publicStatus: true,
  isListed: true,
  startDate: true,
  endDate: true,
  organization: { select: { name: true, slug: true } },
} as const

type ShiftStats = { shifts: number; roles: number; capacity: number }
const NO_SHIFTS: ShiftStats = { shifts: 0, roles: 0, capacity: 0 }

/** Published events accepting registrations now (the rule of src/lib/registration-window.ts). */
function registrationOpenNowWhere(now: Date): Prisma.EventWhereInput {
  return {
    publicStatus: "published",
    registrationsOpen: true,
    AND: [
      { OR: [{ registrationOpensAt: null }, { registrationOpensAt: { lte: now } }] },
      { OR: [{ registrationClosesAt: null }, { registrationClosesAt: { gt: now } }] },
    ],
  }
}

/** Published events whose registrations are already enabled and open in the next 7 days. */
function registrationOpeningSoonWhere(now: Date, until: Date): Prisma.EventWhereInput {
  return { publicStatus: "published", registrationsOpen: true, registrationOpensAt: { gt: now, lte: until } }
}

type RegistrationActivityRow = {
  lastHour: number
  previousHour: number
  last24h: number
  previous24h: number
  last7d: number
  previous7d: number
}

/**
 * All six period counts in one scan of the last 14 days: each period starts where the previous one
 * ends, so no registration is counted twice between a period and its comparison. Every registration
 * row counts, whatever its later status: this is the rhythm at which they are recorded.
 *
 * Two bounded aggregates, no per-row query. Registration has no createdAt index today: the
 * operator page is not a hot path, but add one if the table grows. "createdAt" is a timestamp
 * WITHOUT time zone holding UTC (prisma/migrations/0001_init): it must be read as UTC first, then
 * converted to APP_TIME_ZONE for the bucket; `"createdAt" AT TIME ZONE APP_TIME_ZONE` alone would
 * read it as local time and shift every bucket by 1 h in winter and 2 h in summer.
 */
async function loadRegistrationActivity(now: Date): Promise<{ counts: ActivityCounts; busiestHour: HourBucket | null }> {
  const sinceHour = new Date(now.getTime() - 3_600_000)
  const sinceTwoHours = new Date(now.getTime() - 2 * 3_600_000)
  const sinceDay = new Date(now.getTime() - DAY_MS)
  const sinceTwoDays = new Date(now.getTime() - 2 * DAY_MS)
  const sinceWeek = new Date(now.getTime() - 7 * DAY_MS)
  const sinceTwoWeeks = new Date(now.getTime() - 14 * DAY_MS)

  const [activity] = await prisma.$queryRaw<RegistrationActivityRow[]>`
    SELECT
      (COUNT(*) FILTER (WHERE "createdAt" >= ${sinceHour}))::int AS "lastHour",
      (COUNT(*) FILTER (WHERE "createdAt" >= ${sinceTwoHours} AND "createdAt" < ${sinceHour}))::int AS "previousHour",
      (COUNT(*) FILTER (WHERE "createdAt" >= ${sinceDay}))::int AS "last24h",
      (COUNT(*) FILTER (WHERE "createdAt" >= ${sinceTwoDays} AND "createdAt" < ${sinceDay}))::int AS "previous24h",
      (COUNT(*) FILTER (WHERE "createdAt" >= ${sinceWeek}))::int AS "last7d",
      (COUNT(*) FILTER (WHERE "createdAt" >= ${sinceTwoWeeks} AND "createdAt" < ${sinceWeek}))::int AS "previous7d"
    FROM "Registration"
    WHERE "createdAt" >= ${sinceTwoWeeks}
  `

  const hours = await prisma.$queryRaw<{ hour: string; count: number }[]>`
    SELECT to_char(date_trunc('hour', ("createdAt" AT TIME ZONE 'UTC') AT TIME ZONE ${APP_TIME_ZONE}), 'YYYY-MM-DD HH24') AS hour,
           COUNT(*)::int AS count
    FROM "Registration"
    WHERE "createdAt" >= ${sinceWeek}
    GROUP BY 1
    ORDER BY 2 DESC, 1 ASC
  `

  const counts: ActivityCounts = {
    lastHour: activity?.lastHour ?? 0,
    previousHour: activity?.previousHour ?? 0,
    last24h: activity?.last24h ?? 0,
    previous24h: activity?.previous24h ?? 0,
    last7d: activity?.last7d ?? 0,
    previous7d: activity?.previous7d ?? 0,
  }
  return { counts, busiestHour: busiestHour(hours.map((row) => ({ hour: row.hour.replace(" ", "T"), count: row.count }))) }
}

function shiftStatsById(groups: readonly { eventId: string; roleName: string; _count: { _all: number }; _sum: { capacity: number | null } }[]): Map<string, ShiftStats> {
  const stats = new Map<string, ShiftStats>()
  for (const group of groups) {
    const current = stats.get(group.eventId) ?? { shifts: 0, roles: 0, capacity: 0 }
    current.shifts += group._count._all
    current.roles += 1
    current.capacity += group._sum.capacity ?? 0
    stats.set(group.eventId, current)
  }
  return stats
}

/** Everything the statistics page shows about events and registrations, computed on page load. */
export async function loadOperatorActivity(now: Date = new Date()): Promise<OperatorActivity> {
  const today = civilDate(now, APP_TIME_ZONE)
  const todayStart = new Date(`${today}T00:00:00.000Z`)
  const horizon30 = new Date(`${addDays(today, 30)}T00:00:00.000Z`)
  const in7Days = new Date(now.getTime() + 7 * DAY_MS)

  const [windowEvents, nextEvents, registrationsOpenNow, registrationOpeningsNext7Days, outboxWaiting, rhythm] = await Promise.all([
    // Happening now or starting within 30 days. A published event that started earlier is included
    // when its last day is today or later (startDate <= horizon30 is then always true).
    prisma.event.findMany({
      where: { publicStatus: "published", endDate: { gte: todayStart }, startDate: { lte: horizon30 } },
      select: EVENT_SELECT,
    }),
    prisma.event.findMany({
      where: { publicStatus: "published", endDate: { gte: todayStart } },
      orderBy: [{ startDate: "asc" }, { id: "asc" }],
      take: 10,
      select: EVENT_SELECT,
    }),
    prisma.event.count({ where: registrationOpenNowWhere(now) }),
    prisma.event.count({ where: registrationOpeningSoonWhere(now, in7Days) }),
    prisma.notificationOutbox.count({ where: { status: { in: ["pending", "sending"] } } }),
    loadRegistrationActivity(now),
  ])

  const ids = nextEvents.map((event) => event.id)
  const [shiftGroups, registrationGroups] = await Promise.all([
    prisma.shift.groupBy({
      by: ["eventId", "roleName"],
      where: { eventId: { in: ids }, status: { not: "cancelled" } },
      _count: { _all: true },
      _sum: { capacity: true },
    }),
    prisma.registration.groupBy({
      by: ["eventId"],
      where: { eventId: { in: ids }, status: "active", shift: { status: { not: "cancelled" } } },
      _count: { _all: true },
    }),
  ])

  const shiftsByEvent = shiftStatsById(shiftGroups)
  const registrationsByEvent = new Map(registrationGroups.map((group) => [group.eventId, group._count._all]))

  const counts = eventWindowCounts(windowEvents, now, APP_TIME_ZONE)

  const nextRows: NextEventRow[] = nextEvents.map((event) => {
    const shifts = shiftsByEvent.get(event.id) ?? NO_SHIFTS
    const registrations = registrationsByEvent.get(event.id) ?? 0
    return {
      id: event.id,
      organizationName: event.organization.name,
      organizationSlug: event.organization.slug,
      title: event.title,
      startDate: event.startDate,
      endDate: event.endDate,
      situation: upcomingSituation(event, now, APP_TIME_ZONE),
      roles: shifts.roles,
      shifts: shifts.shifts,
      registrations,
      capacity: shifts.capacity,
      fillPercent: fillRate(registrations, shifts.capacity),
    }
  })

  return {
    generatedAt: now,
    counts: { ...counts, registrationsOpenNow, registrationOpeningsNext7Days },
    activity: {
      counts: rhythm.counts,
      rows: activityRows(rhythm.counts),
      busiestHour: rhythm.busiestHour,
      outboxWaiting,
    },
    nextEvents: nextRows,
  }
}
