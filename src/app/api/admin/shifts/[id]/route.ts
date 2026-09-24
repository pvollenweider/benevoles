import { NextResponse } from "next/server"
import { requireOrgSession } from "@/lib/auth-guard"
import { prisma } from "@/lib/prisma"
import { sendNotification } from "@/lib/notifications"
import { z } from "zod"
import { clockSchema, firstIssueMessage, SAME_TIME_ERROR } from "@/lib/shift-time"
import { adminActor, diffFields, logEvent } from "@/lib/event-log"

const schema = z.object({
  roleName: z.string().optional(),
  label: z.string().optional(),
  description: z.string().optional().nullable(),
  date: z.string().optional(),
  startTime: clockSchema.optional(),
  endTime: clockSchema.optional(),
  capacity: z.number().int().min(1).optional(),
  status: z.enum(["open", "full", "closed", "cancelled"]).optional(),
  locationDetails: z.string().optional().nullable(),
  displayOrder: z.number().int().optional(),
  internalNotes: z.string().optional().nullable(),
  waitlistEnabled: z.boolean().optional(),
  minAge: z.number().int().min(0).max(120).nullable().optional(),
  // Caller can opt out of notifying volunteers (default true).
  notifyVolunteers: z.boolean().optional(),
}).refine((d) => !(d.startTime && d.endTime) || d.startTime !== d.endTime, { message: SAME_TIME_ERROR, path: ["endTime"] })

function fmtDate(d: Date) {
  return d.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireOrgSession()
  if (guard instanceof NextResponse) return guard
  const { db } = guard

  const { id } = await params
  const body = await req.json()
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: firstIssueMessage(parsed.error), details: parsed.error.flatten() }, { status: 400 })
  }

  const before = await db.shift.findFirst({
    where: { id },
    include: {
      event: { select: { id: true, title: true, slug: true, organizationId: true, organization: { select: { slug: true } } } },
      registrations: {
        where: { status: "active" },
        include: { volunteer: true },
      },
    },
  })
  if (!before) return NextResponse.json({ error: "Non trouvé" }, { status: 404 })

  const { notifyVolunteers, ...rest } = parsed.data
  const updateData: Record<string, unknown> = { ...rest }
  if (rest.date) updateData.date = new Date(rest.date)

  const after = await prisma.shift.update({ where: { id }, data: updateData })

  const shiftChanges = diffFields(before, after, [
    "roleName",
    "label",
    "date",
    "startTime",
    "endTime",
    "capacity",
    "status",
    "waitlistEnabled",
    "minAge",
  ])
  if (shiftChanges) {
    await logEvent({
      eventId: before.event.id,
      actor: adminActor(guard.session),
      action: "shift.updated",
      entityType: "Shift",
      entityId: id,
      changes: shiftChanges,
    })
  }

  // Detect schedule changes worth notifying about (date / start / end).
  const scheduleChanged =
    (rest.date && before.date.toISOString() !== after.date.toISOString()) ||
    (rest.startTime && before.startTime !== after.startTime) ||
    (rest.endTime && before.endTime !== after.endTime)

  let notified = 0
  if (scheduleChanged && notifyVolunteers !== false && before.registrations.length > 0) {
    for (const reg of before.registrations) {
      const result = await sendNotification({
        kind: "shift_modified",
        recipient: { email: reg.volunteer.email, name: reg.volunteer.firstName },
        data: {
          volunteerName: reg.volunteer.firstName,
          eventTitle: before.event.title,
          orgSlug: before.event.organization.slug,
          shiftLabel: after.label,
          oldDate: fmtDate(before.date),
          newDate: fmtDate(after.date),
          oldStart: before.startTime,
          newStart: after.startTime,
          oldEnd: before.endTime,
          newEnd: after.endTime,
          editToken: reg.editToken,
        },
      })
      if (result.ok) notified++
    }
  }

  return NextResponse.json({ ...after, notified })
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireOrgSession()
  if (guard instanceof NextResponse) return guard
  const { db } = guard

  const { id } = await params

  const shift = await db.shift.findFirst({
    where: { id },
    include: {
      event: { select: { id: true, title: true, slug: true, organization: { select: { slug: true } } } },
      registrations: { where: { status: "active" }, include: { volunteer: true } },
    },
  })
  if (!shift) return NextResponse.json({ error: "Non trouvé" }, { status: 404 })

  await prisma.shift.update({ where: { id }, data: { status: "cancelled" } })

  const cancelLogId = await logEvent({
    eventId: shift.event.id,
    actor: adminActor(guard.session),
    action: "shift.cancelled",
    entityType: "Shift",
    entityId: id,
    changes: { status: { from: shift.status, to: "cancelled" } },
  })

  // Cascade-cancel active registrations and notify each volunteer.
  let notified = 0
  for (const reg of shift.registrations) {
    await prisma.registration.update({
      where: { id: reg.id },
      data: { status: "cancelled" },
    })
    await logEvent({
      eventId: shift.event.id,
      actor: adminActor(guard.session),
      action: "registration.cancelled",
      entityType: "Registration",
      entityId: reg.id,
      // shiftId unchanged (from === to): recorded so the narrative can still name the shift —
      // see describeChanges's shiftId filter in event-log-narrative.ts.
      changes: { status: { from: "active", to: "cancelled" }, shiftId: { from: id, to: id } },
      causedByLogId: cancelLogId ?? undefined,
    })
    const result = await sendNotification({
      kind: "shift_cancelled",
      recipient: { email: reg.volunteer.email, name: reg.volunteer.firstName },
      data: {
        volunteerName: reg.volunteer.firstName,
        eventTitle: shift.event.title,
        orgSlug: shift.event.organization.slug,
        eventSlug: shift.event.slug,
        shiftLabel: shift.label,
        shiftDate: fmtDate(shift.date),
      },
    })
    if (result.ok) notified++
  }

  return NextResponse.json({ success: true, cancelledRegistrations: shift.registrations.length, notified })
}
