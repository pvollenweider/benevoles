// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { NextResponse } from "next/server"
import { requireOrgSession } from "@/lib/auth-guard"
import { adminActor, logEvent } from "@/lib/event-log"
import { deliverAfterResponse } from "@/lib/notifications/outbox"
import { retryFailedOfMessage } from "@/lib/message-history-data"

/**
 * Re-queues the failed emails of one targeted message (#467), and only those: rows already sent
 * or pending are left alone, and a second click finds nothing left to resend.
 */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string; messageId: string }> }) {
  const guard = await requireOrgSession()
  if (guard instanceof NextResponse) return guard
  const { db, organizationId } = guard
  const { id, messageId } = await params

  const message = await db.targetedMessage.findFirst({ where: { id: messageId, eventId: id }, select: { id: true } })
  if (!message) return NextResponse.json({ error: "Message introuvable" }, { status: 404 })

  const ids = await retryFailedOfMessage(message.id, organizationId)
  if (ids.length > 0) {
    await logEvent({
      eventId: id, actor: adminActor(guard.session), action: "message.resent", entityType: "Event", entityId: id,
      changes: { resent: { from: null, to: ids.length } },
    })
    deliverAfterResponse(ids)
  }
  return NextResponse.json({ resent: ids.length })
}
