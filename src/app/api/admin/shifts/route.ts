// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { NextResponse } from "next/server"
import { requireOrgSession } from "@/lib/auth-guard"
import { z } from "zod"
import { clockSchema, SAME_TIME_ERROR } from "@/lib/shift-time"
import { adminActor, logEvent } from "@/lib/event-log"
import { validationError } from "@/lib/api-error"
import { SHIFT_CONTACT_NAME_MAX, SHIFT_CONTACT_PHONE_MAX, SHIFT_INSTRUCTIONS_MAX } from "@/lib/shift-info"

const schema = z.object({
  eventId: z.string(),
  roleName: z.string().min(1),
  label: z.string().min(1),
  description: z.string().optional(),
  date: z.string(),
  startTime: clockSchema,
  endTime: clockSchema,
  capacity: z.number().int().min(1),
  locationDetails: z.string().optional(),
  latitude: z.number().min(-90).max(90).nullable().optional(),
  longitude: z.number().min(-180).max(180).nullable().optional(),
  contactName: z.string().max(SHIFT_CONTACT_NAME_MAX).optional().nullable(),
  contactPhone: z.string().max(SHIFT_CONTACT_PHONE_MAX).optional().nullable(),
  instructions: z.string().max(SHIFT_INSTRUCTIONS_MAX).optional().nullable(),
  displayOrder: z.number().int().optional(),
  internalNotes: z.string().optional(),
  waitlistEnabled: z.boolean().optional(),
  minAge: z.number().int().min(0).max(120).nullable().optional(),
}).refine((d) => d.startTime !== d.endTime, { message: SAME_TIME_ERROR, path: ["endTime"] })

export async function POST(req: Request) {
  const guard = await requireOrgSession()
  if (guard instanceof NextResponse) return guard
  const { db } = guard

  const body = await req.json()
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return validationError(parsed.error, { useIssueMessage: true })
  }

  const data = parsed.data

  const owned = await db.event.findFirst({ where: { id: data.eventId }, select: { id: true } })
  if (!owned) return NextResponse.json({ error: "Événement introuvable" }, { status: 404 })

  const shift = await db.shift.create({
    data: { ...data, date: new Date(data.date), status: "open" },
  })

  await logEvent({
    eventId: data.eventId,
    actor: adminActor(guard.session),
    action: "shift.created",
    entityType: "Shift",
    entityId: shift.id,
    changes: {
      roleName: { from: null, to: data.roleName },
      date: { from: null, to: data.date },
      startTime: { from: null, to: data.startTime },
      endTime: { from: null, to: data.endTime },
      capacity: { from: null, to: data.capacity },
    },
  })

  return NextResponse.json(shift, { status: 201 })
}
