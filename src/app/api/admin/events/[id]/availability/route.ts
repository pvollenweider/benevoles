// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { NextResponse } from "next/server"
import { z } from "zod"
import { requireOrgSession } from "@/lib/auth-guard"
import { adminActor, logEvent } from "@/lib/event-log"
import { deliverAfterResponse } from "@/lib/notifications/outbox"
import { loadAvailabilityOverview, sendAvailabilityRequests } from "@/lib/event-availability-server"

/**
 * The dated availability of an event (#1146), for its organisers: GET who was asked and where each
 * answer stands (no ranges here); POST asks members, by email through the outbox, each with their
 * own link. Scoped to the organisation (the org client): another organisation's event is a 404.
 */
const sendSchema = z.object({ volunteerIds: z.array(z.string().min(1)).min(1).max(500) })

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireOrgSession()
  if (guard instanceof NextResponse) return guard
  const { id } = await params
  const overview = await loadAvailabilityOverview(guard.db, id)
  if (!overview) return NextResponse.json({ error: "Non trouvé" }, { status: 404 })
  return NextResponse.json(overview, { headers: { "Cache-Control": "private, no-store" } })
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireOrgSession()
  if (guard instanceof NextResponse) return guard
  const { id } = await params
  const parsed = sendSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: "Choisissez au moins une personne." }, { status: 400 })
  const actor = adminActor(guard.session)
  const sent = await sendAvailabilityRequests(guard.db, id, { volunteerIds: parsed.data.volunteerIds, actorId: guard.session.user?.id ?? null })
  if (!sent.ok) return NextResponse.json({ error: sent.error }, { status: sent.status })
  deliverAfterResponse(sent.outboxIds)
  for (const requestId of sent.createdIds) {
    await logEvent({ eventId: id, actor, action: "availability.requested", entityType: "Availability", entityId: requestId })
  }
  return NextResponse.json(sent.result)
}
