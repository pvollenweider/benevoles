import { NextResponse } from "next/server"
import { requireOrgSession } from "@/lib/auth-guard"
import { prisma } from "@/lib/prisma"
import { promoteNextInWaitlist } from "@/lib/waitlist"
import { z } from "zod"
import { adminActor, logEvent } from "@/lib/event-log"

const schema = z.object({
  status: z.enum(["active", "cancelled", "deleted"]).optional(),
  comment: z.string().optional().nullable(),
})

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireOrgSession()
  if (guard instanceof NextResponse) return guard
  const { db } = guard

  const { id } = await params
  const body = await req.json()
  const parsed = schema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const owned = await db.registration.findFirst({ where: { id }, select: { id: true, status: true, comment: true } })
  if (!owned) return NextResponse.json({ error: "Non trouvé" }, { status: 404 })

  const registration = await prisma.registration.update({
    where: { id },
    data: parsed.data,
    include: { shift: true },
  })

  const activeCount = await prisma.registration.count({
    where: { shiftId: registration.shiftId, status: "active" },
  })

  let shiftStatus = "open"
  if (registration.shift.status === "closed" || registration.shift.status === "cancelled") {
    shiftStatus = registration.shift.status
  } else if (activeCount >= registration.shift.capacity) {
    shiftStatus = "full"
  }

  await prisma.shift.update({ where: { id: registration.shiftId }, data: { status: shiftStatus } })

  const regChanges = {
    ...(parsed.data.status && parsed.data.status !== owned.status ? { status: { from: owned.status, to: parsed.data.status } } : {}),
    ...(parsed.data.comment !== undefined && parsed.data.comment !== owned.comment
      ? { comment: { from: owned.comment ? "(rempli)" : "(vide)", to: parsed.data.comment ? "(rempli)" : "(vide)" } }
      : {}),
  }
  let cancelLogId: string | null = null
  if (Object.keys(regChanges).length > 0) {
    cancelLogId = await logEvent({
      eventId: registration.eventId,
      actor: adminActor(guard.session),
      action: parsed.data.status === "cancelled" ? "registration.cancelled" : "registration.updated",
      entityType: "Registration",
      entityId: id,
      // shiftId unchanged (from === to): recorded so the narrative can still name the shift —
      // see describeChanges's shiftId filter in event-log-narrative.ts. Added after the
      // "anything real changed" check above, so it never triggers a log entry on its own.
      changes: { ...regChanges, shiftId: { from: registration.shiftId, to: registration.shiftId } },
    })
  }

  if (parsed.data.status === "cancelled") {
    await promoteNextInWaitlist(registration.shiftId, cancelLogId ?? undefined).catch(() => {})
  }

  return NextResponse.json(registration)
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireOrgSession()
  if (guard instanceof NextResponse) return guard
  const { db } = guard

  const { id } = await params

  const owned = await db.registration.findFirst({ where: { id }, select: { id: true, status: true } })
  if (!owned) return NextResponse.json({ error: "Non trouvé" }, { status: 404 })

  const registration = await prisma.registration.update({
    where: { id },
    data: { status: "cancelled" },
    include: { shift: true },
  })

  const activeCount = await prisma.registration.count({
    where: { shiftId: registration.shiftId, status: "active" },
  })

  if (activeCount < registration.shift.capacity && registration.shift.status === "full") {
    await prisma.shift.update({ where: { id: registration.shiftId }, data: { status: "open" } })
  }

  const cancelLogId = await logEvent({
    eventId: registration.eventId,
    actor: adminActor(guard.session),
    action: "registration.cancelled",
    entityType: "Registration",
    entityId: id,
    // shiftId unchanged: recorded so the narrative can still name the shift — see
    // describeChanges's shiftId filter in event-log-narrative.ts.
    changes: { status: { from: owned.status, to: "cancelled" }, shiftId: { from: registration.shiftId, to: registration.shiftId } },
  })

  await promoteNextInWaitlist(registration.shiftId, cancelLogId ?? undefined).catch(() => {})

  return NextResponse.json({ success: true })
}
