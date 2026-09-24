import { NextResponse } from "next/server"
import { requireOrgSession } from "@/lib/auth-guard"
import { prisma } from "@/lib/prisma"
import { adminActor, logEvent } from "@/lib/event-log"
import { z } from "zod"

const postSchema = z.object({
  title: z.string().min(1).max(140),
  dueDate: z.coerce.date(),
})

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireOrgSession()
  if (guard instanceof NextResponse) return guard
  const { db } = guard

  const { id: eventId } = await params
  const event = await db.event.findFirst({ where: { id: eventId }, select: { id: true } })
  if (!event) return NextResponse.json({ error: "Non trouvé" }, { status: 404 })

  const milestones = await prisma.eventMilestone.findMany({
    where: { eventId },
    orderBy: [{ dueDate: "asc" }, { createdAt: "asc" }],
  })
  return NextResponse.json(milestones)
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireOrgSession()
  if (guard instanceof NextResponse) return guard
  const { db } = guard

  const { id: eventId } = await params
  const body = await req.json()
  const parsed = postSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const event = await db.event.findFirst({ where: { id: eventId }, select: { id: true } })
  if (!event) return NextResponse.json({ error: "Non trouvé" }, { status: 404 })

  const milestone = await prisma.eventMilestone.create({
    data: { eventId, title: parsed.data.title, dueDate: parsed.data.dueDate },
  })

  await logEvent({
    eventId,
    actor: adminActor(guard.session),
    action: "eventmilestone.created",
    entityType: "EventMilestone",
    entityId: milestone.id,
    changes: { title: { from: null, to: milestone.title }, dueDate: { from: null, to: milestone.dueDate.toISOString() } },
  })

  return NextResponse.json(milestone, { status: 201 })
}
