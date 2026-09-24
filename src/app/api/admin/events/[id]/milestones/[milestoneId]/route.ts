import { NextResponse } from "next/server"
import { requireOrgSession } from "@/lib/auth-guard"
import { prisma } from "@/lib/prisma"
import { adminActor, diffFields, logEvent } from "@/lib/event-log"
import { z } from "zod"

const patchSchema = z.object({
  title: z.string().min(1).max(140).optional(),
  dueDate: z.coerce.date().optional(),
  done: z.boolean().optional(),
})

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string; milestoneId: string }> }) {
  const guard = await requireOrgSession()
  if (guard instanceof NextResponse) return guard
  const { db } = guard

  const { id: eventId, milestoneId } = await params
  const body = await req.json()
  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const event = await db.event.findFirst({ where: { id: eventId }, select: { id: true } })
  if (!event) return NextResponse.json({ error: "Non trouvé" }, { status: 404 })

  const before = await prisma.eventMilestone.findFirst({ where: { id: milestoneId, eventId } })
  if (!before) return NextResponse.json({ error: "Non trouvé" }, { status: 404 })

  const after = await prisma.eventMilestone.update({ where: { id: milestoneId }, data: parsed.data })

  const changes = diffFields(before, after, ["title", "dueDate", "done"])
  if (changes) {
    await logEvent({
      eventId,
      actor: adminActor(guard.session),
      action: "eventmilestone.updated",
      entityType: "EventMilestone",
      entityId: milestoneId,
      changes,
    })
  }

  return NextResponse.json(after)
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string; milestoneId: string }> }) {
  const guard = await requireOrgSession()
  if (guard instanceof NextResponse) return guard
  const { db } = guard

  const { id: eventId, milestoneId } = await params
  const event = await db.event.findFirst({ where: { id: eventId }, select: { id: true } })
  if (!event) return NextResponse.json({ error: "Non trouvé" }, { status: 404 })

  const milestone = await prisma.eventMilestone.findFirst({ where: { id: milestoneId, eventId } })
  if (!milestone) return NextResponse.json({ error: "Non trouvé" }, { status: 404 })

  await prisma.eventMilestone.delete({ where: { id: milestoneId } })

  await logEvent({
    eventId,
    actor: adminActor(guard.session),
    action: "eventmilestone.deleted",
    entityType: "EventMilestone",
    entityId: milestoneId,
    changes: { title: { from: milestone.title, to: null } },
  })

  return NextResponse.json({ success: true })
}
