// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { NextResponse } from "next/server"
import { requireOrgSession } from "@/lib/auth-guard"
import { listEventLogs, getCausalChain } from "@/lib/event-log-read"
import { orgTimeZone } from "@/lib/time-zone"

/**
 * Query/explore an event's log. Filters, not a flat feed — see issue #187:
 *   ?entityType=Shift&entityId=...   history for one entity
 *   ?actorId=...&actorType=admin     everything one actor did
 *   ?action=shift                    prefix match (shift.created, shift.updated, ...)
 *   ?since=ISO&until=ISO             time range, for the replay/scrub UI
 *   ?chainOf=<logId>                 the causal chain a specific entry belongs to, for narrative mode
 *   ?cursor=<logId>&limit=50         pagination
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireOrgSession()
  if (guard instanceof NextResponse) return guard
  const { db } = guard

  const { id: eventId } = await params
  const event = await db.event.findFirst({ where: { id: eventId }, select: { id: true, organization: { select: { timeZone: true } } } })
  if (!event) return NextResponse.json({ error: "Non trouvé" }, { status: 404 })

  const url = new URL(req.url)
  const chainOf = url.searchParams.get("chainOf")
  if (chainOf) {
    // Read within this event only; the root check below stays as a second guard.
    const { entries: chain, shiftLabels } = await getCausalChain(eventId, chainOf)
    if (chain.length > 0 && chain[0].eventId !== eventId) {
      return NextResponse.json({ error: "Non trouvé" }, { status: 404 })
    }
    // The narrative is written in the browser: it needs the organization's zone, not its own (#344).
    return NextResponse.json({ entries: chain, shiftLabels, timeZone: orgTimeZone(event.organization) })
  }

  const since = url.searchParams.get("since")
  const until = url.searchParams.get("until")
  const limitParam = url.searchParams.get("limit")
  // Malformed paging or dates are the caller's mistake: a 400, never a failed query.
  if (limitParam !== null && !/^\d{1,6}$/.test(limitParam)) return NextResponse.json({ error: "Paramètre limit invalide." }, { status: 400 })
  const sinceDate = since ? new Date(since) : undefined
  const untilDate = until ? new Date(until) : undefined
  if ((sinceDate && Number.isNaN(sinceDate.getTime())) || (untilDate && Number.isNaN(untilDate.getTime()))) {
    return NextResponse.json({ error: "Date invalide." }, { status: 400 })
  }

  const { entries, nextCursor, shiftLabels } = await listEventLogs(eventId, {
    entityType: url.searchParams.get("entityType") ?? undefined,
    entityId: url.searchParams.get("entityId") ?? undefined,
    actorId: url.searchParams.get("actorId") ?? undefined,
    actorType: url.searchParams.get("actorType") ?? undefined,
    action: url.searchParams.get("action") ?? undefined,
    since: sinceDate,
    until: untilDate,
    cursor: url.searchParams.get("cursor") ?? undefined,
    limit: limitParam ? Number(limitParam) : undefined,
  })

  return NextResponse.json({ entries, nextCursor, shiftLabels })
}
