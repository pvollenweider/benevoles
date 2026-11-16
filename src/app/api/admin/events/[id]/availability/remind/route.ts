// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { NextResponse } from "next/server"
import { requireOrgSession } from "@/lib/auth-guard"
import { deliverAfterResponse } from "@/lib/notifications/outbox"
import { sendAvailabilityRequests } from "@/lib/event-availability-server"

/**
 * « Relancer les personnes sans réponse » (#1146): the request again to everyone asked who has not
 * answered, except anyone emailed less than 48 h ago (the invitations' cooldown, #1105).
 */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireOrgSession()
  if (guard instanceof NextResponse) return guard
  const { id } = await params
  const sent = await sendAvailabilityRequests(guard.db, id, { reminder: true, actorId: guard.session.user?.id ?? null })
  if (!sent.ok) return NextResponse.json({ error: sent.error }, { status: sent.status })
  deliverAfterResponse(sent.outboxIds)
  return NextResponse.json(sent.result)
}
