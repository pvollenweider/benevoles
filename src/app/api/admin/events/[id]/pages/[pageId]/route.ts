import { NextResponse } from "next/server"
import { requireOrgSession } from "@/lib/auth-guard"
import { prisma } from "@/lib/prisma"
import { adminActor, diffFields, logEvent } from "@/lib/event-log"
import { z } from "zod"

const patchSchema = z.object({
  title: z.string().min(1).max(120).optional(),
  content: z.string().max(20000).optional(),
})

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string; pageId: string }> }) {
  const guard = await requireOrgSession()
  if (guard instanceof NextResponse) return guard
  const { db } = guard

  const { id: eventId, pageId } = await params
  const body = await req.json()
  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const event = await db.event.findFirst({ where: { id: eventId }, select: { id: true } })
  if (!event) return NextResponse.json({ error: "Non trouvé" }, { status: 404 })

  const before = await prisma.eventPage.findFirst({ where: { id: pageId, eventId } })
  if (!before) return NextResponse.json({ error: "Non trouvé" }, { status: 404 })

  const after = await prisma.eventPage.update({ where: { id: pageId }, data: parsed.data })

  const changes = diffFields(before, after, ["title", "content"])
  if (changes) {
    await logEvent({
      eventId,
      actor: adminActor(guard.session),
      action: "eventpage.updated",
      entityType: "EventPage",
      entityId: pageId,
      // `content` can be large free text; record that it changed, not the text itself, same
      // spirit as the minimal-PII rule elsewhere in the log (nothing sensitive here, but a full
      // page of Markdown in a diff line isn't useful either).
      changes: Object.fromEntries(
        Object.entries(changes).map(([field, v]) => [field, field === "content" ? { from: "(modifié)", to: "(modifié)" } : v]),
      ),
    })
  }

  return NextResponse.json(after)
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string; pageId: string }> }) {
  const guard = await requireOrgSession()
  if (guard instanceof NextResponse) return guard
  const { db } = guard

  const { id: eventId, pageId } = await params
  const event = await db.event.findFirst({ where: { id: eventId }, select: { id: true } })
  if (!event) return NextResponse.json({ error: "Non trouvé" }, { status: 404 })

  const page = await prisma.eventPage.findFirst({ where: { id: pageId, eventId } })
  if (!page) return NextResponse.json({ error: "Non trouvé" }, { status: 404 })

  await prisma.eventPage.delete({ where: { id: pageId } })

  await logEvent({
    eventId,
    actor: adminActor(guard.session),
    action: "eventpage.deleted",
    entityType: "EventPage",
    entityId: pageId,
    changes: { title: { from: page.title, to: null } },
  })

  return NextResponse.json({ success: true })
}
