// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { NextResponse } from "next/server"
import { requireOrgSession } from "@/lib/auth-guard"
import { adminActor, logEvent } from "@/lib/event-log"
import { untagVolunteerIfNoLongerResponsable } from "@/lib/sector-leaders"
import { reportError } from "@/lib/report-error"

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string; leaderId: string }> }) {
  const guard = await requireOrgSession()
  if (guard instanceof NextResponse) return guard
  const { db } = guard

  const { id: eventId, leaderId } = await params
  const event = await db.event.findFirst({ where: { id: eventId }, select: { id: true } })
  if (!event) return NextResponse.json({ error: "Non trouvé" }, { status: 404 })

  const leader = await db.sectorLeader.findFirst({ where: { id: leaderId, eventId }, select: { roleName: true, sector: { select: { name: true } }, email: true } })
  if (!leader) return NextResponse.json({ error: "Non trouvé" }, { status: 404 })

  await db.sectorLeader.delete({ where: { id: leaderId } })

  await logEvent({
    eventId,
    actor: adminActor(guard.session),
    action: "sectorleader.removed",
    entityType: "SectorLeader",
    entityId: leaderId,
    changes: leader.roleName ? { roleName: { from: leader.roleName, to: null } } : { sector: { from: leader.sector?.name ?? null, to: null } },
  })

  await untagVolunteerIfNoLongerResponsable(guard.organizationId, leader.email).catch(reportError("sector_leader.untag"))

  return NextResponse.json({ success: true })
}
