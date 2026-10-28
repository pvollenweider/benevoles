// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { NextResponse } from "next/server"
import { requireOrgSession } from "@/lib/auth-guard"
import { adminActor, logEvent } from "@/lib/event-log"
import { slotAfter } from "@/lib/shift-quick-edit"
import { liveRoleShifts, ROLE_SETTINGS_SELECT, roleSettingsOf } from "@/lib/role-settings"

/**
 * POST /api/admin/shifts/[id]/duplicate (#398): a copy of the shift right after it, same length,
 * open, without registrations. Every setting is copied (label, capacity, minimum of people,
 * waitlist, minimum age, practical info, notes); the settings of the poste (colour, limit, access,
 * cumulable, order) are the poste's (#1002), or the source's when it is its poste's only shift.
 */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireOrgSession()
  if (guard instanceof NextResponse) return guard
  const { db } = guard
  const { id } = await params

  const source = await db.shift.findFirst({ where: { id } })
  if (!source) return NextResponse.json({ error: "Créneau introuvable" }, { status: 404 })

  const poste = roleSettingsOf(await db.shift.findMany({ where: liveRoleShifts(source.eventId, source.roleName), select: ROLE_SETTINGS_SELECT }), source.roleName)
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
      minVolunteers: source.minVolunteers,
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
      requiresApproval: source.requiresApproval,
      minAge: source.minAge,
      mealOnTheGo: source.mealOnTheGo,
      colorKey: source.colorKey,
      maxPerVolunteer: source.maxPerVolunteer,
      reservedTags: source.reservedTags,
      overlapAllowed: source.overlapAllowed,
      assignedOnly: source.assignedOnly,
      sectorId: source.sectorId,
      ...poste,
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
