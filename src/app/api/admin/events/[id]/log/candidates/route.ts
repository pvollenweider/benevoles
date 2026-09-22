import { NextResponse } from "next/server"
import { requireOrgSession } from "@/lib/auth-guard"
import { listReplayCandidates, listStoryCandidates } from "@/lib/event-log-read"

/**
 * Lets the Replay/Récit tabs be usable on their own, not just reachable via a row's button in
 * Explorer: ?kind=replay lists entities with more than one log entry (worth stepping through),
 * ?kind=story lists actual causal chains (an entry that caused at least one other) — a single
 * isolated entry is neither.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireOrgSession()
  if (guard instanceof NextResponse) return guard
  const { db } = guard

  const { id: eventId } = await params
  const event = await db.event.findFirst({ where: { id: eventId }, select: { id: true } })
  if (!event) return NextResponse.json({ error: "Non trouvé" }, { status: 404 })

  const kind = new URL(req.url).searchParams.get("kind")
  if (kind === "story") {
    return NextResponse.json({ candidates: await listStoryCandidates(eventId) })
  }
  return NextResponse.json({ candidates: await listReplayCandidates(eventId) })
}
