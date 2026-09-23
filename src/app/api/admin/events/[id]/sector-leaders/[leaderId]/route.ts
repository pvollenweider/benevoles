import { NextResponse } from "next/server"
import { requireOrgSession } from "@/lib/auth-guard"
import { prisma } from "@/lib/prisma"
import { adminActor, logEvent } from "@/lib/event-log"
import { untagVolunteerIfNoLongerResponsable } from "@/lib/sector-leaders"

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string; leaderId: string }> }) {
  const guard = await requireOrgSession()
  if (guard instanceof NextResponse) return guard
  const { db } = guard

  const { id: eventId, leaderId } = await params
  const event = await db.event.findFirst({ where: { id: eventId }, select: { id: true } })
  if (!event) return NextResponse.json({ error: "Non trouvé" }, { status: 404 })

  const leader = await prisma.sectorLeader.findFirst({ where: { id: leaderId, eventId } })
  if (!leader) return NextResponse.json({ error: "Non trouvé" }, { status: 404 })

  await prisma.sectorLeader.delete({ where: { id: leaderId } })

  await logEvent({
    eventId,
    actor: adminActor(guard.session),
    action: "sectorleader.removed",
    entityType: "SectorLeader",
    entityId: leaderId,
    changes: { roleName: { from: leader.roleName, to: null } },
  })

  await untagVolunteerIfNoLongerResponsable(guard.organizationId, leader.email).catch((e) => console.error("untagVolunteerIfNoLongerResponsable error:", e))

  return NextResponse.json({ success: true })
}
