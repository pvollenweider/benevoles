// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { NextResponse } from "next/server"
import { COMMITTED_STATUSES } from "@/lib/registration-capacity"
import { civilDateSchema, isDayInPeriod, SHIFT_OUTSIDE_EVENT_ERROR } from "@/lib/civil-date"
import { COORDINATE_PAIR_ERROR, isCoordinatePair } from "@/lib/map-link"
import { requireOrgSession } from "@/lib/auth-guard"
import { z } from "zod"
import { clockSchema, SAME_TIME_ERROR } from "@/lib/shift-time"
import { adminActor, diffFields, logEvent } from "@/lib/event-log"
import { cancelShift } from "@/lib/shift-cancel"
import { registrationToken } from "@/lib/token-vault"
import { collectNotifications, deliverAfterResponse, enqueueNotifications } from "@/lib/notifications/outbox"
import { validationError } from "@/lib/api-error"
import { SHIFT_CONTACT_NAME_MAX, SHIFT_CONTACT_PHONE_MAX, SHIFT_INSTRUCTIONS_MAX } from "@/lib/shift-info"

const schema = z.object({
  roleName: z.string().optional(),
  label: z.string().optional(),
  description: z.string().optional().nullable(),
  date: civilDateSchema.optional(),
  startTime: clockSchema.optional(),
  endTime: clockSchema.optional(),
  capacity: z.number().int().min(1).optional(),
  status: z.enum(["open", "full", "closed", "cancelled"]).optional(),
  locationDetails: z.string().optional().nullable(),
  latitude: z.number().min(-90).max(90).nullable().optional(),
  longitude: z.number().min(-180).max(180).nullable().optional(),
  contactName: z.string().max(SHIFT_CONTACT_NAME_MAX).optional().nullable(),
  contactPhone: z.string().max(SHIFT_CONTACT_PHONE_MAX).optional().nullable(),
  instructions: z.string().max(SHIFT_INSTRUCTIONS_MAX).optional().nullable(),
  displayOrder: z.number().int().optional(),
  internalNotes: z.string().optional().nullable(),
  waitlistEnabled: z.boolean().optional(),
  requiresApproval: z.boolean().optional(),
  minAge: z.number().int().min(0).max(120).nullable().optional(),
  // Caller can opt out of notifying volunteers (default true).
  notifyVolunteers: z.boolean().optional(),
}).refine((d) => !(d.startTime && d.endTime) || d.startTime !== d.endTime, { message: SAME_TIME_ERROR, path: ["endTime"] }).refine(isCoordinatePair, { message: COORDINATE_PAIR_ERROR, path: ["longitude"] })

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
    return validationError(parsed.error, { useIssueMessage: true })
  }

  const before = await db.shift.findFirst({
    where: { id },
    include: {
      event: { select: { id: true, title: true, slug: true, organizationId: true, startDate: true, endDate: true, organization: { select: { slug: true } } } },
      registrations: {
        where: { status: "active" },
        include: { volunteer: true },
      },
    },
  })
  if (!before) return NextResponse.json({ error: "Non trouvé" }, { status: 404 })
  if (parsed.data.date && !isDayInPeriod(parsed.data.date, before.event?.startDate, before.event?.endDate)) {
    return NextResponse.json({ error: SHIFT_OUTSIDE_EVENT_ERROR }, { status: 400 })
  }

  const { notifyVolunteers, ...rest } = parsed.data
  const updateData: Record<string, unknown> = { ...rest }
  if (rest.date) updateData.date = new Date(rest.date)

  // The update and its notifications commit together (#352): volunteers are never left
  // unaware of a schedule change that was saved.
  const { after, outboxIds, notified } = await db.$transaction(async (tx) => {
    const after = await tx.shift.update({ where: { id }, data: updateData })

    // Detect schedule changes worth notifying about (date / start / end).
    const scheduleChanged =
      (rest.date && before.date.toISOString() !== after.date.toISOString()) ||
      (rest.startTime && before.startTime !== after.startTime) ||
      (rest.endTime && before.endTime !== after.endTime)

    // Through the outbox (#311): `notified` counts notifications queued, retried if SMTP fails.
    const outbox = collectNotifications()
    if (scheduleChanged && notifyVolunteers !== false && before.registrations.length > 0) {
      for (const reg of before.registrations) {
        await outbox.send({
          kind: "shift_modified",
          dedupeKey: `shift_modified:${reg.id}:${after.updatedAt.toISOString()}`,
          recipient: { email: reg.volunteer.email, name: reg.volunteer.firstName },
          volunteerId: reg.volunteerId,
          organizationId: before.event.organizationId,
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
            editToken: registrationToken.reveal(reg),
          },
        })
      }
    }
    return { after, outboxIds: await enqueueNotifications(outbox.payloads, tx, { organizationId: before.event.organizationId }), notified: outbox.payloads.length }
  })

  const shiftChanges = diffFields(before, after, [
    "roleName",
    "label",
    "date",
    "startTime",
    "endTime",
    "capacity",
    "status",
    "waitlistEnabled",
    "requiresApproval",
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
  deliverAfterResponse(outboxIds)

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
      event: { select: { id: true, title: true, slug: true, organizationId: true, organization: { select: { slug: true } } } },
      // Pending requests (#484) are cancelled and told too: they held a spot on this shift.
      registrations: { where: { status: { in: [...COMMITTED_STATUSES] } }, include: { volunteer: true } },
    },
  })
  if (!shift) return NextResponse.json({ error: "Non trouvé" }, { status: 404 })

  const result = await cancelShift(shift, adminActor(guard.session))

  return NextResponse.json({ success: true, ...result })
}
