// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { NextResponse } from "next/server"
import { z } from "zod"
import { requireOrgSession } from "@/lib/auth-guard"
import { clockSchema } from "@/lib/shift-time"
import { adminActor, logEvent } from "@/lib/event-log"
import { validationError } from "@/lib/api-error"
import { generateShiftSeries, seriesProblem } from "@/lib/shift-series"
import { SHIFT_CONTACT_NAME_MAX, SHIFT_CONTACT_PHONE_MAX, SHIFT_INSTRUCTIONS_MAX } from "@/lib/shift-info"

const schema = z.object({
  eventId: z.string(),
  roleName: z.string().min(1),
  label: z.string().optional(),
  description: z.string().optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  startTime: clockSchema,
  endTime: clockSchema,
  slotMinutes: z.number().int(),
  breakMinutes: z.number().int().optional(),
  capacity: z.number().int().min(1),
  locationDetails: z.string().optional(),
  latitude: z.number().min(-90).max(90).nullable().optional(),
  longitude: z.number().min(-180).max(180).nullable().optional(),
  contactName: z.string().max(SHIFT_CONTACT_NAME_MAX).optional().nullable(),
  contactPhone: z.string().max(SHIFT_CONTACT_PHONE_MAX).optional().nullable(),
  instructions: z.string().max(SHIFT_INSTRUCTIONS_MAX).optional().nullable(),
  displayOrder: z.number().int().optional(),
  waitlistEnabled: z.boolean().optional(),
  minAge: z.number().int().min(0).max(120).nullable().optional(),
})

/** Creates a series of shifts (#393) in one transaction: all of them, or none. */
export async function POST(req: Request) {
  const guard = await requireOrgSession()
  if (guard instanceof NextResponse) return guard
  const { db } = guard

  const parsed = schema.safeParse(await req.json())
  if (!parsed.success) return validationError(parsed.error, { useIssueMessage: true })
  const { eventId, slotMinutes, breakMinutes, date, startTime, endTime, label, ...rest } = parsed.data

  const problem = seriesProblem({ date, startTime, endTime, slotMinutes, breakMinutes })
  if (problem) return NextResponse.json({ error: problem }, { status: 400 })

  const owned = await db.event.findFirst({ where: { id: eventId }, select: { id: true } })
  if (!owned) return NextResponse.json({ error: "Événement introuvable" }, { status: 404 })

  const slots = generateShiftSeries({ date, startTime, endTime, slotMinutes, breakMinutes })
  const shifts = await db.$transaction((tx) =>
    Promise.all(
      slots.map((slot) =>
        tx.shift.create({
          data: {
            ...rest,
            eventId,
            label: label?.trim() || rest.roleName,
            date: new Date(slot.date),
            startTime: slot.startTime,
            endTime: slot.endTime,
            status: "open",
          },
        }),
      ),
    ),
  )

  const actor = adminActor(guard.session)
  await Promise.all(
    shifts.map((shift) =>
      logEvent({
        eventId,
        actor,
        action: "shift.created",
        entityType: "Shift",
        entityId: shift.id,
        changes: {
          roleName: { from: null, to: shift.roleName },
          date: { from: null, to: shift.date.toISOString().slice(0, 10) },
          startTime: { from: null, to: shift.startTime },
          endTime: { from: null, to: shift.endTime },
          capacity: { from: null, to: shift.capacity },
        },
      }),
    ),
  )

  return NextResponse.json(shifts, { status: 201 })
}
