// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { PrismaPg } from "@prisma/adapter-pg"

/**
 * The startup option every pooled connection sends: its session reads and writes UTC (#1172).
 *
 * The columns are `TIMESTAMP(3)` without time zone and Prisma writes UTC clock time into them, while
 * raw SQL compares them with `now()` (a timestamptz), which Postgres reads in the session time zone.
 * On a server whose `timezone` is not UTC (a native `initdb` takes the host zone, e.g. Europe/Zurich)
 * the two disagree by the zone's offset: a proposal run was expired as « waiting too long » 6 ms
 * after it was created. Forcing the session to UTC makes raw `now()` agree with what Prisma writes,
 * whatever the server or database default (`options` is libpq's startup parameter, passed by `pg`).
 */
export const UTC_SESSION_OPTIONS = "-c TimeZone=UTC"

/**
 * The connection string with the UTC option appended to its own `options` parameter, if it has one:
 * `pg` lets the URL's parameters override the pool configuration, so an `options` in DATABASE_URL
 * would otherwise drop ours. The last `-c TimeZone` wins. Any other string is returned as is.
 */
export function withUtcSession(connectionString: string | undefined): string | undefined {
  if (!connectionString) return connectionString
  let url: URL
  try {
    url = new URL(connectionString)
  } catch {
    return connectionString
  }
  const own = url.searchParams.get("options")
  if (own === null) return connectionString
  url.searchParams.set("options", own.trim() ? `${own} ${UTC_SESSION_OPTIONS}` : UTC_SESSION_OPTIONS)
  return url.toString()
}

/** The Postgres adapter for a Prisma client: every connection of its pool in UTC. */
export function pgAdapter(connectionString: string | undefined): PrismaPg {
  return new PrismaPg({ connectionString: withUtcSession(connectionString), options: UTC_SESSION_OPTIONS })
}
