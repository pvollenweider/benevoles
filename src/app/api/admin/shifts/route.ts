// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { NextResponse } from "next/server"
import { civilDateSchema, isDayInPeriod, SHIFT_OUTSIDE_EVENT_ERROR } from "@/lib/civil-date"
import { COORDINATE_PAIR_ERROR, isCoordinatePair } from "@/lib/map-link"
import { requireOrgSession } from "@/lib/auth-guard"
import { z } from "zod"
import { clockSchema, SAME_TIME_ERROR } from "@/lib/shift-time"
import { adminActor, logEvent } from "@/lib/event-log"
import { validationError } from "@/lib/api-error"
import { SHIFT_CONTACT_NAME_MAX, SHIFT_CONTACT_PHONE_MAX, SHIFT_INSTRUCTIONS_MAX } from "@/lib/shift-info"
import { minVolunteersProblem } from "@/lib/staffing"
import { liveRoleShifts, ROLE_SETTINGS_SELECT, roleSettingsOf } from "@/lib/role-settings"
import { newShiftSectorDecision, posteSectorConflictError, posteSectorOf } from "@/lib/poste-sector"
import { eventPostes, posteKey } from "@/lib/poste-suggestions"
import { lockPosteDestination } from "@/lib/sector-adoption"

const schema = z.object({
  eventId: z.string(),
  roleName: z.string().min(1),
  label: z.string().min(1),
  description: z.string().optional(),
  date: civilDateSchema,
  startTime: clockSchema,
  endTime: clockSchema,
  capacity: z.number().int().min(1),
  // Minimum per shift (#949): 1 to capacity, null = none (the same as capacity).
  minVolunteers: z.number().nullable().optional(),
  locationDetails: z.string().optional(),
  latitude: z.number().min(-90).max(90).nullable().optional(),
  longitude: z.number().min(-180).max(180).nullable().optional(),
  contactName: z.string().max(SHIFT_CONTACT_NAME_MAX).optional().nullable(),
  contactPhone: z.string().max(SHIFT_CONTACT_PHONE_MAX).optional().nullable(),
  instructions: z.string().max(SHIFT_INSTRUCTIONS_MAX).optional().nullable(),
  displayOrder: z.number().int().optional(),
  internalNotes: z.string().optional(),
  waitlistEnabled: z.boolean().optional(),
  requiresApproval: z.boolean().optional(),
  minAge: z.number().int().min(0).max(120).nullable().optional(),
  /**
   * Sector chosen in the form (#1147), for an event that adopted sectors: an active sector of the
   * event, or null for « Autres postes ». A new poste is created in it; an existing poste keeps its
   * own sector, and a different one is refused (409). Absent: as before, the poste's sector or none.
   */
  sectorId: z.string().min(1).nullable().optional(),
}).refine((d) => d.startTime !== d.endTime, { message: SAME_TIME_ERROR, path: ["endTime"] }).refine(isCoordinatePair, { message: COORDINATE_PAIR_ERROR, path: ["longitude"] })
  .superRefine((d, ctx) => {
    const problem = minVolunteersProblem(d.minVolunteers, d.capacity)
    if (problem) ctx.addIssue({ code: "custom", message: problem, path: ["minVolunteers"] })
  })

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

  const owned = await db.event.findFirst({ where: { id: data.eventId }, select: { id: true, startDate: true, endDate: true } })
  if (!owned) return NextResponse.json({ error: "Événement introuvable" }, { status: 404 })
  if (!isDayInPeriod(data.date, owned.startDate, owned.endDate)) return NextResponse.json({ error: SHIFT_OUTSIDE_EVENT_ERROR }, { status: 400 })

  let shift: Awaited<ReturnType<typeof db.shift.create>>
  let sectorName: string | null = null
  if (data.sectorId === undefined) {
    // A shift added to an existing poste takes its settings (#986, #1002): colour, limit, access,
    // cumulable, order and sector belong to the poste. A new poste keeps the defaults and the form's order.
    const poste = roleSettingsOf(await db.shift.findMany({ where: liveRoleShifts(data.eventId, data.roleName), select: ROLE_SETTINGS_SELECT }), data.roleName)
    shift = await db.shift.create({
      data: { ...data, date: new Date(data.date), status: "open", ...poste },
    })
  } else {
    // Sector first (#1147): the sector is checked under the locks a sector write takes (never an
    // archived one or another event's), and the shift is written in the same transaction. The
    // poste is compared like the form does (case and spaces aside): an existing poste in another
    // sector is refused, never moved by a shift.
    const requested = data.sectorId
    const outcome = await db.$transaction(async (tx) => {
      const target = await lockPosteDestination(tx, guard.organizationId, data.eventId, requested)
      if (!target.ok) return target
      const live = await tx.shift.findMany({ where: { eventId: data.eventId, status: { not: "cancelled" } }, select: ROLE_SETTINGS_SELECT })
      const existing = eventPostes(live).find((p) => posteKey(p) === posteKey(data.roleName))
      const decision = newShiftSectorDecision(existing === undefined ? undefined : posteSectorOf(live, existing), requested)
      if (!decision.ok) {
        const other = decision.posteSectorId ? await tx.sector.findFirst({ where: { id: decision.posteSectorId, eventId: data.eventId }, select: { name: true } }) : null
        return { ok: false as const, status: 409 as const, error: posteSectorConflictError(existing!, other?.name ?? null) }
      }
      const poste = roleSettingsOf(live, data.roleName)
      const created = await tx.shift.create({
        data: { ...data, date: new Date(data.date), status: "open", ...poste, sectorId: poste ? poste.sectorId : decision.sectorId },
      })
      return { ok: true as const, value: { shift: created, name: target.value.name } }
    })
    if (!outcome.ok) return NextResponse.json({ error: outcome.error }, { status: outcome.status })
    shift = outcome.value.shift
    sectorName = shift.sectorId ? outcome.value.name : null
  }

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
      ...(data.minVolunteers != null ? { minVolunteers: { from: null, to: data.minVolunteers } } : {}),
      ...(sectorName ? { sector: { from: null, to: sectorName } } : {}),
    },
  })

  return NextResponse.json(shift, { status: 201 })
}
