// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { prisma } from "@/lib/prisma"
import { APP_TIME_ZONE } from "@/lib/time-zone"
import { daysAgo, RETENTION_DAYS } from "@/lib/retention"
import { ADMIN_EMAIL_KINDS, groupAdminEmailCounts, type AdminEmailsView } from "@/lib/admin-emails-view"

/**
 * The emails this organisation's administrators received, over the DeliveryOutcome retention
 * window. One bounded aggregate: PostgreSQL groups by civil day (in APP_TIME_ZONE), kind and
 * outcome, so the page never loads thousands of rows to count them. The organisation filter is
 * always applied, and only the kinds addressed to administrators are read.
 */
export async function loadAdminEmails(opts: { organizationId: string; now?: Date }): Promise<AdminEmailsView> {
  const since = daysAgo(opts.now ?? new Date(), RETENTION_DAYS.deliveryOutcome)
  // Prisma stores createdAt as a timestamp WITHOUT time zone holding UTC (prisma/migrations):
  // read it as UTC first, then convert it to APP_TIME_ZONE, or every day is shifted by the
  // winter/summer offset.
  const rows = await prisma.$queryRaw<{ day: string; kind: string; outcome: string; count: number }[]>`
    SELECT to_char(date_trunc('day', ("createdAt" AT TIME ZONE 'UTC') AT TIME ZONE ${APP_TIME_ZONE}), 'YYYY-MM-DD') AS day,
           "kind" AS kind,
           "outcome" AS outcome,
           COUNT(*)::int AS count
    FROM "DeliveryOutcome"
    WHERE "organizationId" = ${opts.organizationId}
      AND "createdAt" >= ${since}
      AND "kind" = ANY(${[...ADMIN_EMAIL_KINDS]}::text[])
    GROUP BY 1, 2, 3
  `
  return groupAdminEmailCounts(rows)
}
