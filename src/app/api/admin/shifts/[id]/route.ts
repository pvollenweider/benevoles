// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { NextResponse } from "next/server"
import { placeChoiceProblem } from "@/lib/places"
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
import { cappedText } from "@/lib/text-limits-schema"
import { SHIFT_DESCRIPTION_MAX, SHIFT_INTERNAL_NOTES_MAX, SHIFT_LABEL_MAX, SHIFT_LOCATION_DETAILS_MAX, SHIFT_ROLE_NAME_MAX } from "@/lib/text-limits"
import { SHIFT_CONTACT_NAME_MAX, SHIFT_CONTACT_PHONE_MAX, SHIFT_INSTRUCTIONS_MAX } from "@/lib/shift-info"
import { minVolunteersProblem } from "@/lib/staffing"
import { liveRoleShifts, ROLE_SETTINGS_SELECT, roleSettingsOf } from "@/lib/role-settings"
import { endSwapsIn } from "@/lib/shift-swap-server"
import { shiftMateriallyChanged } from "@/lib/shift-swaps"
import { checkScheduleEdit, scheduleEditRefusalBody, ScheduleEditRefusalError } from "@/lib/workload-guard"

const schema = z.object({
  roleName: cappedText(SHIFT_ROLE_NAME_MAX, "Le nom du poste").optional(),
  label: cappedText(SHIFT_LABEL_MAX, "Le libellé du créneau").optional(),
  description: cappedText(SHIFT_DESCRIPTION_MAX, "La description du créneau").optional().nullable(),
  date: civilDateSchema.optional(),
  startTime: clockSchema.optional(),
  endTime: clockSchema.optional(),
  capacity: z.number().int().min(1).optional(),
  // Minimum per shift (#949): null removes it; checked below against the places it will have.
  minVolunteers: z.number().nullable().optional(),
  status: z.enum(["open", "full", "closed", "cancelled"]).optional(),
  locationDetails: cappedText(SHIFT_LOCATION_DETAILS_MAX, "Le lieu de rendez-vous").optional().nullable(),
  latitude: z.number().min(-90).max(90).nullable().optional(),
  longitude: z.number().min(-180).max(180).nullable().optional(),
  contactName: z.string().max(SHIFT_CONTACT_NAME_MAX).optional().nullable(),
  contactPhone: z.string().max(SHIFT_CONTACT_PHONE_MAX).optional().nullable(),
  instructions: z.string().max(SHIFT_INSTRUCTIONS_MAX).optional().nullable(),
  displayOrder: z.number().int().optional(),
  internalNotes: cappedText(SHIFT_INTERNAL_NOTES_MAX, "Les notes internes").optional().nullable(),
  waitlistEnabled: z.boolean().optional(),
  requiresApproval: z.boolean().optional(),
  minAge: z.number().int().min(0).max(120).nullable().optional(),
  /** « Repas sur le pouce possible » (#1171, lot 2); removing it is judged like new hours. */
  mealOnTheGo: z.boolean().optional(),
  /** Place of the mission (#1171, lot 2); a new place is judged like new hours. */
  placeId: z.string().min(1).nullable().optional(),
  // Caller can opt out of notifying volunteers (default true): of new hours, and of a cancellation
  // (AUTHZ-15, « Ne pas prévenir les inscrits »).
  notifyVolunteers: z.boolean().optional(),
}).refine((d) => !(d.startTime && d.endTime) || d.startTime !== d.endTime, { message: SAME_TIME_ERROR, path: ["endTime"] }).refine(isCoordinatePair, { message: COORDINATE_PAIR_ERROR, path: ["longitude"] })

/** A field sent unchanged (the timeline sends the label with every edit). */
function sameValue(next: unknown, stored: unknown): boolean {
  if (stored instanceof Date) return typeof next === "string" && stored.toISOString().slice(0, 10) === next
  return (next ?? null) === (stored ?? null)
}

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
  // Start and end as they will be (#1024): a start moved alone keeps the stored end, so it is
  // refused when it lands on that end rather than saved as a shift of no length.
  if ((parsed.data.startTime ?? before.startTime) === (parsed.data.endTime ?? before.endTime)) {
    return NextResponse.json({ error: SAME_TIME_ERROR }, { status: 400 })
  }
  // The minimum and the places as they will be (#949): lowering the places under the minimum is
  // refused until the minimum is lowered too.
  const minProblem = minVolunteersProblem(
    parsed.data.minVolunteers !== undefined ? parsed.data.minVolunteers : before.minVolunteers,
    parsed.data.capacity ?? before.capacity,
  )
  if (minProblem) return NextResponse.json({ error: minProblem }, { status: 400 })
  if (parsed.data.placeId !== undefined && parsed.data.placeId !== before.placeId) {
    const placeProblem = placeChoiceProblem(await db.eventPlace.findMany({ where: { eventId: before.eventId }, select: { id: true, name: true, archivedAt: true } }), parsed.data.placeId, before.placeId)
    if (placeProblem) return NextResponse.json({ error: placeProblem, field: "placeId" }, { status: 400 })
  }

  const { notifyVolunteers, ...rest } = parsed.data

  // Cancelling by the status (AUTHZ-15): the same cancellation as « Supprimer » (registrations and
  // pending requests cancelled, swaps ended, a published event left with no shift back to draft),
  // the people registered emailed unless the organiser chose not to. Alone: a cancellation is
  // never mixed with other changes. Reopening later gives no place back (« Rétablir » does).
  if (rest.status === "cancelled" && before.status !== "cancelled") {
    const others = (Object.keys(rest) as (keyof typeof rest)[]).filter((k) => k !== "status" && rest[k] !== undefined && !sameValue(rest[k], before[k as keyof typeof before]))
    if (others.length > 0) return NextResponse.json({ error: "Annulez le créneau sans autre modification en même temps." }, { status: 400 })
    const shift = await db.shift.findFirst({
      where: { id },
      include: {
        event: { select: { id: true, title: true, slug: true, organizationId: true, organization: { select: { slug: true } } } },
        registrations: { where: { status: { in: [...COMMITTED_STATUSES] } }, include: { volunteer: true } },
      },
    })
    if (!shift) return NextResponse.json({ error: "Non trouvé" }, { status: 404 })
    const result = await cancelShift(shift, adminActor(guard.session), { notify: notifyVolunteers !== false })
    return NextResponse.json({ ...shift, registrations: undefined, event: undefined, status: "cancelled", ...result })
  }
  const updateData: Record<string, unknown> = { ...rest }
  // A shift moved to an existing poste takes its settings (#986, #1002): colour, limit, access,
  // cumulable and order, over the order the form sends. A poste new to the event keeps the shift's
  // own, so renaming a lone shift's poste drops none of them.
  if (rest.roleName !== undefined && rest.roleName !== before.roleName) {
    const poste = roleSettingsOf(await db.shift.findMany({ where: liveRoleShifts(before.eventId, rest.roleName), select: ROLE_SETTINGS_SELECT }), rest.roleName)
    if (poste) Object.assign(updateData, poste)
  }
  if (rest.date) updateData.date = new Date(rest.date)

  // The update and its notifications commit together (#352): volunteers are never left
  // unaware of a schedule change that was saved.
  const timesMove = (rest.date !== undefined && rest.date !== before.date.toISOString().slice(0, 10))
    || (rest.startTime !== undefined && rest.startTime !== before.startTime)
    || (rest.endTime !== undefined && rest.endTime !== before.endTime)
  // Removing « repas sur le pouce possible » can take the meal away from people holding the shift
  // (Codex, lot 2): judged like new hours. Setting it can only help, judged all the same (cheap).
  const mealMoves = rest.mealOnTheGo !== undefined && rest.mealOnTheGo !== before.mealOnTheGo
  // A new place is judged too (travel margin): a mission elsewhere may be too close now.
  const placeMoves = rest.placeId !== undefined && (rest.placeId ?? null) !== before.placeId
  let saved
  try {
    saved = await db.$transaction(async (tx) => {
      // Workload protection (#1171): new hours are judged for every person holding the shift, before
      // anything is written; one refusal refuses the edit.
      if (timesMove || mealMoves || placeMoves) {
        const refusals = await checkScheduleEdit(tx, before.eventId, [{
          id,
          date: rest.date ?? before.date,
          startTime: rest.startTime ?? before.startTime,
          endTime: rest.endTime ?? before.endTime,
          mealOnTheGo: rest.mealOnTheGo ?? before.mealOnTheGo,
          placeId: rest.placeId !== undefined ? rest.placeId : before.placeId,
          placeName: null,
        }])
        if (refusals.length > 0) throw new ScheduleEditRefusalError(refusals, timesMove ? undefined : placeMoves ? "avec ce lieu" : "sans repas sur le pouce sur ce créneau")
      }
      const after = await tx.shift.update({ where: { id }, data: updateData })
      // A new time, day, place, poste or requirement ends the swap requests agreed on the old one
      // (#1174 E13): never applied to terms nobody agreed to.
      if (shiftMateriallyChanged(before, after)) await endSwapsIn(tx, { shiftIds: [id] }, "shift_changed", adminActor(guard.session))

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
  } catch (e) {
    if (e instanceof ScheduleEditRefusalError) return NextResponse.json(scheduleEditRefusalBody(e.refusals, e.cause), { status: 409 })
    throw e
  }
  const { after, outboxIds, notified } = saved

  const shiftChanges = diffFields(before, after, [
    "roleName",
    "label",
    "date",
    "startTime",
    "endTime",
    "capacity",
    "minVolunteers",
    "status",
    "waitlistEnabled",
    "requiresApproval",
    "minAge",
    "mealOnTheGo",
    "placeId",
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
