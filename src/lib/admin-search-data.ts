// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import type { OrgScopedPrisma } from "./prisma-org"
import {
  capped, eventWhere, registrationWhere, shiftWhere, volunteerWhere, SEARCH_GROUP_LIMIT,
} from "./admin-search"

const take = SEARCH_GROUP_LIMIT + 1

/** Results of the admin global search (#377), read with the organization-scoped client. */
export async function loadSearch(db: OrgScopedPrisma, terms: string[]) {
  const [volunteers, registrations, events, shifts] = await Promise.all([
    db.volunteer.findMany({
      where: volunteerWhere(terms),
      select: { id: true, firstName: true, lastName: true, email: true, phone: true, active: true },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      take,
    }),
    db.registration.findMany({
      where: registrationWhere(terms),
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
      where: eventWhere(terms),
      select: { id: true, title: true, startDate: true, publicStatus: true },
      orderBy: { startDate: "desc" },
      take,
    }),
    db.shift.findMany({
      where: shiftWhere(terms),
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
