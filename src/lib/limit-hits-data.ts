// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { prisma } from "@/lib/prisma"
import { APP_TIME_ZONE } from "@/lib/time-zone"
import { daysAgo } from "@/lib/retention"
import { groupLimitHits, LIMIT_HITS_DAYS, type OrgLimitHits } from "@/lib/limit-hits-view"

/**
 * The sending limits reached in the last LIMIT_HITS_DAYS days (#1100), for the super admin:
 * every organisation, or one. With, per organisation, the emails a limit held back that the
 * queue still holds (pending or being sent, `lastHeldAt` set).
 */
/** At most this many hourly rows are read: past it the page says only the latest are shown. */
export const LIMIT_HITS_MAX_ROWS = 500

export async function loadLimitHits(opts: { organizationId?: string; now?: Date } = {}): Promise<{ groups: OrgLimitHits[]; truncated: boolean }> {
  const since = daysAgo(opts.now ?? new Date(), LIMIT_HITS_DAYS)
  const org = opts.organizationId ? { organizationId: opts.organizationId } : {}
  const rows = await prisma.emailLimitHit.findMany({
    where: { lastAt: { gte: since }, ...org },
    orderBy: { lastAt: "desc" },
    take: LIMIT_HITS_MAX_ROWS + 1,
    select: { id: true, organizationId: true, organization: { select: { name: true, slug: true } }, limit: true, heldCount: true, refusedCount: true, firstAt: true, lastAt: true },
  })
  if (rows.length === 0) return { groups: [], truncated: false }
  const truncated = rows.length > LIMIT_HITS_MAX_ROWS
  if (truncated) rows.length = LIMIT_HITS_MAX_ROWS
  const waiting = await prisma.notificationOutbox.groupBy({
    by: ["organizationId"],
    where: { status: { in: ["pending", "sending"] }, lastHeldAt: { not: null }, ...org },
    _count: { _all: true },
  })
  const stillHeld: Record<string, number> = {}
  for (const w of waiting) stillHeld[w.organizationId ?? "platform"] = w._count._all
  return { groups: groupLimitHits(rows, stillHeld, APP_TIME_ZONE), truncated }
}

