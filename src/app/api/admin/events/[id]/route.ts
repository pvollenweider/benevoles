import { NextResponse } from "next/server"
import { requireOrgSession } from "@/lib/auth-guard"
import { prisma } from "@/lib/prisma"
import { titlesMatch } from "@/lib/confirm-title"
import { adminActor, diffFields, logEvent } from "@/lib/event-log"
import { z } from "zod"

const showSchema = z.object({
  name: z.string(),
  date: z.string(),
  startTime: z.string(),
  endTime: z.string(),
})

const schema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().optional().nullable(),
  location: z.string().optional().nullable(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  publicInstructions: z.string().optional().nullable(),
  confirmationMessage: z.string().optional().nullable(),
  publicStatus: z.enum(["draft", "published", "archived"]).optional(),
  showSchedule: z.array(showSchema).optional(),
  reminderMessage: z.string().max(2000).optional().nullable(),
  remindersEnabled: z.boolean().optional(),
})

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireOrgSession()
  if (guard instanceof NextResponse) return guard
  const { db } = guard

  const { id } = await params

  const event = await db.event.findFirst({
    where: { id },
    include: {
      shifts: {
        include: { registrations: { where: { status: "active" }, include: { volunteer: true } } },
        orderBy: [{ date: "asc" }, { displayOrder: "asc" }, { startTime: "asc" }],
      },
    },
  })

  if (!event) return NextResponse.json({ error: "Non trouvé" }, { status: 404 })

  return NextResponse.json(event)
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireOrgSession()
  if (guard instanceof NextResponse) return guard
  const { db } = guard

  const { id } = await params
  const body = await req.json()
  const parsed = schema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const owned = await db.event.findFirst({
    where: { id },
    select: { id: true, title: true, publicStatus: true, startDate: true, endDate: true, publicInstructions: true, remindersEnabled: true },
  })
  if (!owned) return NextResponse.json({ error: "Non trouvé" }, { status: 404 })

  const data = parsed.data
  const updateData: Record<string, unknown> = { ...data }
  if (data.startDate) updateData.startDate = new Date(data.startDate)
  if (data.endDate) updateData.endDate = new Date(data.endDate)

  try {
    const event = await prisma.event.update({ where: { id }, data: updateData })

    const eventChanges = diffFields(owned, event, [
      "title",
      "publicStatus",
      "startDate",
      "endDate",
      "publicInstructions",
      "remindersEnabled",
    ])
    if (eventChanges) {
      const statusChangedTo = eventChanges.publicStatus?.to
      await logEvent({
        eventId: id,
        actor: adminActor(guard.session),
        action: statusChangedTo === "published" ? "event.published" : statusChangedTo === "archived" ? "event.archived" : "event.updated",
        entityType: "Event",
        entityId: id,
        changes: eventChanges,
      })
    }

    return NextResponse.json(event)
  } catch (err) {
    console.error("Event PATCH error:", err)
    return NextResponse.json({ error: "Erreur serveur", detail: String(err) }, { status: 500 })
  }
}

const deleteSchema = z.object({ confirmTitle: z.string() })

/**
 * Permanently deletes an event. Only an archived event can be deleted, and the
 * caller must send the exact event title as confirmation. Shifts, registrations
 * and invitations are removed by cascade; volunteers stay in the org roster.
 * Archiving goes through PATCH { publicStatus: "archived" }.
 */
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireOrgSession()
  if (guard instanceof NextResponse) return guard
  const { db } = guard

  const { id } = await params

  const owned = await db.event.findFirst({ where: { id }, select: { id: true, title: true, publicStatus: true } })
  if (!owned) return NextResponse.json({ error: "Non trouvé" }, { status: 404 })

  if (owned.publicStatus !== "archived") {
    return NextResponse.json({ error: "Archivez l'événement avant de le supprimer." }, { status: 409 })
  }

  const body = deleteSchema.safeParse(await req.json().catch(() => null))
  if (!body.success || !titlesMatch(body.data.confirmTitle, owned.title)) {
    return NextResponse.json({ error: "Le titre saisi ne correspond pas à celui de l'événement." }, { status: 400 })
  }

  try {
    await prisma.event.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (err) {
    console.error("Event DELETE error:", err)
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 })
  }
}
