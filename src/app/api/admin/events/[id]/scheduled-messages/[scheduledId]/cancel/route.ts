// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { NextResponse } from "next/server"
import { requireOrgSession } from "@/lib/auth-guard"
import { adminActor, logEvent } from "@/lib/event-log"
import { formatScheduledFor } from "@/lib/scheduled-message"
import { orgTimeZone } from "@/lib/time-zone"

/**
 * POST /api/admin/events/[id]/scheduled-messages/[scheduledId]/cancel (#1019): cancels a scheduled
 * message that has not gone yet. The status condition is in the update itself: a message the cron
 * has just claimed is not cancelled (409), and two clicks cancel it once.
 */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string; scheduledId: string }> }) {
  const guard = await requireOrgSession()
  if (guard instanceof NextResponse) return guard
  const { db } = guard
  const { id, scheduledId } = await params

  const scheduled = await db.scheduledMessage.findFirst({ where: { id: scheduledId, eventId: id }, select: { id: true, subject: true, scheduledFor: true, event: { select: { organization: { select: { timeZone: true } } } } } })
  if (!scheduled) return NextResponse.json({ error: "Message programmé introuvable" }, { status: 404 })

  const { count } = await db.scheduledMessage.updateMany({
    where: { id: scheduled.id, eventId: id, status: "scheduled" },
    data: {
      status: "cancelled",
      cancelledAt: new Date(),
      cancelledByName: guard.session.user?.name || guard.session.user?.email || "Administrateur",
    },
  })
  if (count === 0) return NextResponse.json({ error: "Trop tard : ce message est déjà parti ou a déjà été annulé." }, { status: 409 })

  const timeZone = orgTimeZone(scheduled.event.organization)

  await logEvent({
    eventId: id,
    actor: adminActor(guard.session),
    action: "message.schedule_cancelled",
    entityType: "Event",
    entityId: id,
    changes: {
      subject: { from: scheduled.subject, to: null },
      scheduledFor: { from: `${formatScheduledFor(scheduled.scheduledFor, timeZone, new Date())} (${timeZone})`, to: null },
    },
  })
  return NextResponse.json({ cancelled: true })
}
