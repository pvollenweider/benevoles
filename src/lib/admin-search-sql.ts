// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { Prisma } from "@/generated/prisma/client"
import { likePattern, SEARCH_ID_LIMIT } from "./admin-search"

/**
 * Raw id matches of the admin global search (#390), server only: `Prisma.sql` pulls the
 * generated client, which can't be bundled for the browser. The organization filter is written
 * in every query; the scoped client re-applies it when reading the rows.
 */

/** `haystack` (a SQL expression) contains every term, accents and case aside. */
function matchesEveryTerm(haystack: Prisma.Sql, terms: string[]): Prisma.Sql {
  const conditions = terms.map((t) => Prisma.sql`unaccent(lower(${haystack})) LIKE unaccent(lower(${likePattern(t)})) ESCAPE '\\'`)
  return Prisma.join(conditions, " AND ")
}

const VOLUNTEER_TEXT = Prisma.sql`concat_ws(' ', v."firstName", v."lastName", v."email", v."phone")`
const EVENT_TEXT = Prisma.sql`concat_ws(' ', e."title", e."location", e."slug")`
const SHIFT_TEXT = Prisma.sql`concat_ws(' ', s."roleName", s."label", e."title")`

/** Ids of the organization's volunteers whose name, email or phone matches. */
export function volunteerIdsSql(organizationId: string, terms: string[]): Prisma.Sql {
  return Prisma.sql`SELECT v."id" FROM "Volunteer" v WHERE v."organizationId" = ${organizationId} AND ${matchesEveryTerm(VOLUNTEER_TEXT, terms)} LIMIT ${SEARCH_ID_LIMIT}`
}

/** Ids of the organization's events whose title, location or slug matches. */
export function eventIdsSql(organizationId: string, terms: string[]): Prisma.Sql {
  return Prisma.sql`SELECT e."id" FROM "Event" e WHERE e."organizationId" = ${organizationId} AND ${matchesEveryTerm(EVENT_TEXT, terms)} LIMIT ${SEARCH_ID_LIMIT}`
}

/** Ids of live shifts whose role, label or event title matches (« Fête bar »). */
export function shiftIdsSql(organizationId: string, terms: string[]): Prisma.Sql {
  return Prisma.sql`SELECT s."id" FROM "Shift" s JOIN "Event" e ON e."id" = s."eventId" WHERE e."organizationId" = ${organizationId} AND s."status" <> 'cancelled' AND ${matchesEveryTerm(SHIFT_TEXT, terms)} LIMIT ${SEARCH_ID_LIMIT}`
}
