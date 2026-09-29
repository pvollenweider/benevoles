// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import type { OrgScopedPrisma } from "./prisma-org"
import {
  capped, eventIdsSql, registrationWhere, shiftIdsSql, volunteerIdsSql, SEARCH_GROUP_LIMIT,
} from "./admin-search"

const take = SEARCH_GROUP_LIMIT + 1

/**
 * Results of the admin global search (#377). Two steps per group: an accent-insensitive raw
 * match that selects ids within the organization (#390), then the organization-scoped read of
 * those rows, ordered and capped.
 */
export async function loadSearch(db: OrgScopedPrisma, organizationId: string, terms: string[]) {
  const ids = async (sql: ReturnType<typeof volunteerIdsSql>) =>
    (await db.$queryRaw<{ id: string }[]>(sql)).map((r) => r.id)
  const [volunteerIds, eventIds, shiftIds] = await Promise.all([
    ids(volunteerIdsSql(organizationId, terms)),
    ids(eventIdsSql(organizationId, terms)),
    ids(shiftIdsSql(organizationId, terms)),
  ])

  const [volunteers, registrations, events, shifts] = await Promise.all([
    db.volunteer.findMany({
      where: { id: { in: volunteerIds } },
      select: { id: true, firstName: true, lastName: true, email: true, phone: true, active: true },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      take,
    }),
    db.registration.findMany({
      where: registrationWhere(volunteerIds),
      select: {
        id: true, status: true,
        volunteer: { select: { firstName: true, lastName: true, email: true } },
        shift: { select: { roleName: true, label: true, date: true, startTime: true, endTime: true } },
        event: { select: { id: true, title: true } },
      },
      orderBy: [{ event: { startDate: "desc" } }, { shift: { date: "asc" } }, { shift: { startTime: "asc" } }],
      take,
    }),
    db.event.findMany({
      where: { id: { in: eventIds } },
      select: { id: true, title: true, startDate: true, publicStatus: true },
      orderBy: { startDate: "desc" },
      take,
    }),
    db.shift.findMany({
      where: { id: { in: shiftIds } },
      select: { id: true, roleName: true, label: true, date: true, startTime: true, endTime: true, event: { select: { id: true, title: true } } },
      orderBy: [{ event: { startDate: "desc" } }, { date: "asc" }, { startTime: "asc" }],
      take,
    }),
  ])
  return {
    volunteers: capped(volunteers),
    registrations: capped(registrations),
    events: capped(events),
    shifts: capped(shifts),
  }
}

export type SearchResults = Awaited<ReturnType<typeof loadSearch>>
