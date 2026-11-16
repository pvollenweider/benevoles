// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { NextResponse } from "next/server"
import { z } from "zod"
import { civilDateSchema } from "@/lib/civil-date"
import { requireOrgSession } from "@/lib/auth-guard"
import { clockSchema } from "@/lib/shift-time"
import { adminActor, logEvent } from "@/lib/event-log"
import { validationError } from "@/lib/api-error"
import { registrationToken } from "@/lib/token-vault"
import { collectNotifications, deliverAfterResponse, enqueueNotifications } from "@/lib/notifications/outbox"
import { planChange } from "@/lib/shift-recurrence"
import { toMin, toMinEnd } from "@/lib/gantt-utils"
import { loadRuleShifts } from "@/lib/shift-recurrence-data"
import { endSwapsIn } from "@/lib/shift-swap-server"
import { checkScheduleEdit, scheduleEditRefusalBody, ScheduleEditRefusalError } from "@/lib/workload-guard"

const schema = z.object({
  from: civilDateSchema,
  startTime: clockSchema.optional(),
  endTime: clockSchema.optional(),
  capacity: z.number().int().optional(),
  notifyVolunteers: z.boolean().optional(),
})

const fmtDate = (d: Date) => d.toLocaleDateString("fr-FR", { timeZone: "UTC", weekday: "long", day: "numeric", month: "long" })

/**
 * Changes a recurring permanence from a date on (#866): capacity, or hours when each day has a
 * single shift. Earlier dates and cancelled shifts are left as they are; volunteers registered on a
 * moved shift are told, as for a single shift (#352: change and notifications commit together).
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireOrgSession()
  if (guard instanceof NextResponse) return guard
  const { db } = guard
  const { id } = await params

  const parsed = schema.safeParse(await req.json())
  if (!parsed.success) return validationError(parsed.error, { useIssueMessage: true })
  const { from, notifyVolunteers, ...change } = parsed.data

  const loaded = await loadRuleShifts(db, id)
  if (!loaded) return NextResponse.json({ error: "Permanence introuvable" }, { status: 404 })
  const { rule, shifts } = loaded

  const plan = planChange(rule, shifts, from, change)
  if (plan.problem) {
    return NextResponse.json({ error: plan.problem, tooSmall: plan.tooSmall.map((s) => ({ date: s.date, startTime: s.startTime, committed: s.committed })) }, { status: 400 })
  }

  const data: Record<string, unknown> = {}
  if (change.startTime) data.startTime = change.startTime
  if (change.endTime) data.endTime = change.endTime
  if (change.capacity !== undefined) data.capacity = change.capacity
  const timeChanged = Boolean(change.startTime || change.endTime)
  // A moved permanence keeps one shift per day (planChange refused otherwise): its new length.
  const ruleData: Record<string, unknown> = { ...data }
  if (timeChanged) {
    const start = change.startTime ?? rule.startTime
    const end = change.endTime ?? rule.endTime
    ruleData.slotMinutes = toMinEnd(end, start) - toMin(start)
  }

  let saved
  try {
    saved = await db.$transaction(async (tx) => {
      // Workload protection (#1171): the new hours of every moved shift, for every person holding one,
      // judged together before anything is written; one refusal refuses the whole series change.
      if (timeChanged) {
        const current = await tx.shift.findMany({ where: { id: { in: plan.update } }, select: { id: true, date: true, startTime: true, endTime: true } })
        const refusals = await checkScheduleEdit(tx, rule.eventId, current.map((s: { id: string; date: Date; startTime: string; endTime: string }) => ({
          id: s.id, date: s.date, startTime: change.startTime ?? s.startTime, endTime: change.endTime ?? s.endTime,
        })))
        if (refusals.length > 0) throw new ScheduleEditRefusalError(refusals)
      }
      const moved = timeChanged
        ? await tx.shift.findMany({
            where: { id: { in: plan.update } },
            select: { id: true, label: true, date: true, startTime: true, endTime: true, registrations: { where: { status: "active" }, include: { volunteer: true } } },
          })
        : []
      await tx.shift.updateMany({ where: { id: { in: plan.update } }, data })
      // New hours end the swap requests agreed on the old ones (#1174 E13).
      if (timeChanged) await endSwapsIn(tx, { shiftIds: plan.update }, "shift_changed", adminActor(guard.session))
      // The rule shows the permanence as it now runs.
      await tx.shiftRecurrence.update({ where: { id }, data: ruleData })

      const outbox = collectNotifications()
      if (timeChanged && notifyVolunteers !== false) {
        const stamp = new Date().toISOString()
        for (const shift of moved) {
          for (const reg of shift.registrations) {
            await outbox.send({
              kind: "shift_modified",
              dedupeKey: `shift_modified:${reg.id}:${stamp}`,
              recipient: { email: reg.volunteer.email, name: reg.volunteer.firstName },
              volunteerId: reg.volunteerId,
              organizationId: rule.event.organizationId,
              data: {
                volunteerName: reg.volunteer.firstName,
                eventTitle: rule.event.title,
                orgSlug: rule.event.organization.slug,
                shiftLabel: shift.label,
                oldDate: fmtDate(shift.date),
                newDate: fmtDate(shift.date),
                oldStart: shift.startTime,
                newStart: change.startTime ?? shift.startTime,
                oldEnd: shift.endTime,
                newEnd: change.endTime ?? shift.endTime,
                editToken: registrationToken.reveal(reg),
              },
            })
          }
        }
      }
      return { outboxIds: await enqueueNotifications(outbox.payloads, tx, { organizationId: rule.event.organizationId }), notified: outbox.payloads.length }
    })
  } catch (e) {
    if (e instanceof ScheduleEditRefusalError) return NextResponse.json(scheduleEditRefusalBody(e.refusals), { status: 409 })
    throw e
  }
  const { outboxIds, notified } = saved

  const changes: Record<string, { from: unknown; to: unknown }> = { from: { from: null, to: from }, shiftCount: { from: null, to: plan.update.length } }
  if (change.startTime) changes.startTime = { from: rule.startTime, to: change.startTime }
  if (change.endTime) changes.endTime = { from: rule.endTime, to: change.endTime }
  if (change.capacity !== undefined) changes.capacity = { from: rule.capacity, to: change.capacity }
  await logEvent({ eventId: rule.eventId, actor: adminActor(guard.session), action: "recurrence.updated", entityType: "ShiftRecurrence", entityId: id, changes })
  deliverAfterResponse(outboxIds)

  const updated = await db.shift.findMany({ where: { id: { in: plan.update } } })
  return NextResponse.json({ shifts: updated, notified })
}
