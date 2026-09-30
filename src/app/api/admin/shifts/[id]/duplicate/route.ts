// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { NextResponse } from "next/server"
import { requireOrgSession } from "@/lib/auth-guard"
import { adminActor, logEvent } from "@/lib/event-log"
import { slotAfter } from "@/lib/shift-quick-edit"

/**
 * POST /api/admin/shifts/[id]/duplicate (#398): a copy of the shift right after it, same length,
 * open, without registrations. Every setting is copied (label, capacity, waitlist, minimum age,
 * practical info, notes, colour).
 */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireOrgSession()
  if (guard instanceof NextResponse) return guard
  const { db } = guard
  const { id } = await params

  const source = await db.shift.findFirst({ where: { id } })
  if (!source) return NextResponse.json({ error: "Créneau introuvable" }, { status: 404 })

  const slot = slotAfter({ date: source.date.toISOString().slice(0, 10), startTime: source.startTime, endTime: source.endTime })
  const shift = await db.shift.create({
    data: {
      eventId: source.eventId,
      roleName: source.roleName,
      label: source.label,
      description: source.description,
      date: new Date(slot.date),
      startTime: slot.startTime,
      endTime: slot.endTime,
      capacity: source.capacity,
      status: "open",
      locationDetails: source.locationDetails,
      latitude: source.latitude,
      longitude: source.longitude,
      contactName: source.contactName,
      contactPhone: source.contactPhone,
      instructions: source.instructions,
      displayOrder: source.displayOrder,
      internalNotes: source.internalNotes,
      waitlistEnabled: source.waitlistEnabled,
      minAge: source.minAge,
      colorKey: source.colorKey,
    },
  })

  await logEvent({
    eventId: source.eventId,
    actor: adminActor(guard.session),
    action: "shift.created",
    entityType: "Shift",
    entityId: shift.id,
    changes: {
      roleName: { from: null, to: shift.roleName },
      date: { from: null, to: slot.date },
      startTime: { from: null, to: shift.startTime },
      endTime: { from: null, to: shift.endTime },
      capacity: { from: null, to: shift.capacity },
      duplicatedFrom: { from: null, to: source.id },
    },
  })

  return NextResponse.json(shift, { status: 201 })
}
