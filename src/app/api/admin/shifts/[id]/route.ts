import { NextResponse } from "next/server"
import { requireOrgSession } from "@/lib/auth-guard"
import { prisma } from "@/lib/prisma"
import { sendNotification } from "@/lib/notifications"
import { z } from "zod"

const schema = z.object({
  roleName: z.string().optional(),
  label: z.string().optional(),
  description: z.string().optional().nullable(),
  date: z.string().optional(),
  startTime: z.string().optional(),
  endTime: z.string().optional(),
  capacity: z.number().int().min(1).optional(),
  status: z.enum(["open", "full", "closed", "cancelled"]).optional(),
  locationDetails: z.string().optional().nullable(),
  displayOrder: z.number().int().optional(),
  internalNotes: z.string().optional().nullable(),
  // Caller can opt out of notifying volunteers (default true).
  notifyVolunteers: z.boolean().optional(),
})

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
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const before = await db.shift.findFirst({
    where: { id },
    include: {
      event: { select: { id: true, title: true, slug: true, organizationId: true } },
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
      event: { select: { title: true, slug: true } },
      registrations: { where: { status: "active" }, include: { volunteer: true } },
    },
  })
  if (!shift) return NextResponse.json({ error: "Non trouvé" }, { status: 404 })

  await prisma.shift.update({ where: { id }, data: { status: "cancelled" } })

  // Cascade-cancel active registrations and notify each volunteer.
  let notified = 0
  for (const reg of shift.registrations) {
    await prisma.registration.update({
      where: { id: reg.id },
      data: { status: "cancelled" },
    })
    const result = await sendNotification({
      kind: "shift_cancelled",
      recipient: { email: reg.volunteer.email, name: reg.volunteer.firstName },
      data: {
        volunteerName: reg.volunteer.firstName,
        eventTitle: shift.event.title,
        eventSlug: shift.event.slug,
        shiftLabel: shift.label,
        shiftDate: fmtDate(shift.date),
      },
    })
    if (result.ok) notified++
  }

  return NextResponse.json({ success: true, cancelledRegistrations: shift.registrations.length, notified })
}
