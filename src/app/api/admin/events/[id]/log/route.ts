import { NextResponse } from "next/server"
import { requireOrgSession } from "@/lib/auth-guard"
import { listEventLogs, getCausalChain } from "@/lib/event-log-read"

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
  const event = await db.event.findFirst({ where: { id: eventId }, select: { id: true } })
  if (!event) return NextResponse.json({ error: "Non trouvé" }, { status: 404 })

  const url = new URL(req.url)
  const chainOf = url.searchParams.get("chainOf")
  if (chainOf) {
    const { entries: chain, shiftLabels } = await getCausalChain(chainOf)
    // Ownership check on the chain root, not on every entry: a chain never crosses events.
    if (chain.length > 0 && chain[0].eventId !== eventId) {
      return NextResponse.json({ error: "Non trouvé" }, { status: 404 })
    }
    return NextResponse.json({ entries: chain, shiftLabels })
  }

  const since = url.searchParams.get("since")
  const until = url.searchParams.get("until")
  const limitParam = url.searchParams.get("limit")

  const { entries, nextCursor, shiftLabels } = await listEventLogs(eventId, {
    entityType: url.searchParams.get("entityType") ?? undefined,
    entityId: url.searchParams.get("entityId") ?? undefined,
    actorId: url.searchParams.get("actorId") ?? undefined,
    actorType: url.searchParams.get("actorType") ?? undefined,
    action: url.searchParams.get("action") ?? undefined,
    since: since ? new Date(since) : undefined,
    until: until ? new Date(until) : undefined,
    cursor: url.searchParams.get("cursor") ?? undefined,
    limit: limitParam ? Number(limitParam) : undefined,
  })

  return NextResponse.json({ entries, nextCursor, shiftLabels })
}
