import { NextResponse } from "next/server"
import { requireOrgSession } from "@/lib/auth-guard"
import { prisma } from "@/lib/prisma"
import { generateToken } from "@/lib/utils"
import { adminActor, logEvent } from "@/lib/event-log"
import { sendNotification } from "@/lib/notifications"
import { tagVolunteerAsResponsable } from "@/lib/sector-leaders"
import { z } from "zod"

const postSchema = z.object({
  roleName: z.string().min(1).max(100),
  name: z.string().min(1).max(100),
  email: z.string().email(),
})

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireOrgSession()
  if (guard instanceof NextResponse) return guard
  const { db } = guard

  const { id: eventId } = await params
  const event = await db.event.findFirst({ where: { id: eventId }, select: { id: true } })
  if (!event) return NextResponse.json({ error: "Non trouvé" }, { status: 404 })

  const leaders = await prisma.sectorLeader.findMany({
    where: { eventId },
    orderBy: [{ roleName: "asc" }, { createdAt: "asc" }],
  })
  return NextResponse.json(leaders)
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireOrgSession()
  if (guard instanceof NextResponse) return guard
  const { db } = guard

  const { id: eventId } = await params
  const body = await req.json()
  const parsed = postSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const event = await db.event.findFirst({
    where: { id: eventId },
    select: { title: true, organization: { select: { slug: true } } },
  })
  if (!event) return NextResponse.json({ error: "Non trouvé" }, { status: 404 })

  const { roleName, name, email } = parsed.data

  const existing = await prisma.sectorLeader.findFirst({ where: { eventId, roleName, email } })
  if (existing) return NextResponse.json({ error: "Cette personne est déjà responsable de ce poste" }, { status: 409 })

  const leader = await prisma.sectorLeader.create({
    data: { eventId, roleName, name, email, token: generateToken() },
  })

  await logEvent({
    eventId,
    actor: adminActor(guard.session),
    action: "sectorleader.added",
    entityType: "SectorLeader",
    entityId: leader.id,
    changes: { roleName: { from: null, to: leader.roleName } },
  })

  await tagVolunteerAsResponsable(guard.organizationId, leader.email).catch((e) => console.error("tagVolunteerAsResponsable error:", e))

  await sendNotification({
    kind: "sector_leader_invite",
    recipient: { email: leader.email, name: leader.name },
    data: {
      leaderName: leader.name,
      roleName: leader.roleName,
      eventTitle: event.title,
      orgSlug: event.organization.slug,
      token: leader.token,
    },
  }).catch((e) => console.error("sector_leader_invite email error:", e))

  return NextResponse.json(leader, { status: 201 })
}
