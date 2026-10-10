// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { NextResponse } from "next/server"
import { z } from "zod"
import { civilDateSchema } from "@/lib/civil-date"
import { requireOrgSession } from "@/lib/auth-guard"
import { adminActor, logEvent } from "@/lib/event-log"
import { validationError } from "@/lib/api-error"
import { COMMITTED_STATUSES } from "@/lib/registration-capacity"
import { cancelShift } from "@/lib/shift-cancel"
import { addDays } from "@/lib/shift-series"
import { planStop } from "@/lib/shift-recurrence"
import { loadRuleShifts } from "@/lib/shift-recurrence-data"

const schema = z.object({
  from: civilDateSchema,
  /** Cancel the dates that have people too, telling them. Without it, those dates are only listed. */
  confirm: z.boolean().optional(),
})

/**
 * Stops a recurring permanence from a date on (#866). Never removes anyone silently: dates that
 * never had anyone are deleted, dates with only cancelled registrations are cancelled, and dates
 * with people are listed (409) until the organizer confirms; then they are cancelled and their
 * volunteers told, as for a single shift.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireOrgSession()
  if (guard instanceof NextResponse) return guard
  const { db } = guard
  const { id } = await params

  const parsed = schema.safeParse(await req.json())
  if (!parsed.success) return validationError(parsed.error, { useIssueMessage: true })
  const { from, confirm } = parsed.data

  const loaded = await loadRuleShifts(db, id)
  if (!loaded) return NextResponse.json({ error: "Permanence introuvable" }, { status: 404 })
  const { rule, shifts } = loaded
  const plan = planStop(shifts, from)
  if (plan.remove.length + plan.cancelQuiet.length + plan.withPeople.length === 0) {
    return NextResponse.json({ error: "Aucune date de cette permanence à partir de ce jour." }, { status: 400 })
  }
  if (plan.withPeople.length > 0 && !confirm) {
    return NextResponse.json({
      error: `${plan.withPeople.length} date${plan.withPeople.length > 1 ? "s ont" : " a"} déjà des inscrits.`,
      withPeople: plan.withPeople.map((s) => ({ date: s.date, startTime: s.startTime, committed: s.committed })),
    }, { status: 409 })
  }

  const ruleEnds = from <= rule.fromDate.toISOString().slice(0, 10)
  const unpublished = await db.$transaction(async (tx) => {
    await tx.shift.deleteMany({ where: { id: { in: plan.remove } } })
    await tx.shift.updateMany({ where: { id: { in: plan.cancelQuiet } }, data: { status: "cancelled" } })
    if (ruleEnds) await tx.shiftRecurrence.delete({ where: { id } })
    else await tx.shiftRecurrence.update({ where: { id }, data: { untilDate: new Date(addDays(from, -1)) } })
    // As for a cancelled shift: a published event never stays open on no shift at all. Dates
    // with people are cancelled below (cancelShift does the same check for the last one).
    if (plan.withPeople.length > 0) return false
    const remaining = await tx.shift.count({ where: { eventId: rule.eventId, status: { not: "cancelled" } } })
    if (remaining > 0) return false
    const { count } = await tx.event.updateMany({ where: { id: rule.eventId, publicStatus: "published" }, data: { publicStatus: "draft" } })
    return count > 0
  })

  const actor = adminActor(guard.session)
  const stopLogId = await logEvent({
    eventId: rule.eventId,
    actor,
    action: "recurrence.stopped",
    entityType: "ShiftRecurrence",
    entityId: id,
    changes: {
      from: { from: null, to: from },
      removed: { from: null, to: plan.remove.length },
      cancelled: { from: null, to: plan.cancelQuiet.length + plan.withPeople.length },
    },
  })
  if (unpublished) {
    await logEvent({
      eventId: rule.eventId, actor, action: "event.unpublished", entityType: "Event", entityId: rule.eventId,
      changes: { publicStatus: { from: "published", to: "draft" } }, causedByLogId: stopLogId ?? undefined,
    })
  }

  let notified = 0
  for (const s of plan.withPeople) {
    const shift = await db.shift.findFirst({
      where: { id: s.id },
      include: {
        event: { select: { id: true, title: true, slug: true, organizationId: true, organization: { select: { slug: true } } } },
        registrations: { where: { status: { in: [...COMMITTED_STATUSES] } }, include: { volunteer: true } },
      },
    })
    if (!shift) continue
    notified += (await cancelShift(shift, actor)).notified
  }

  return NextResponse.json({
    removed: plan.remove,
    cancelled: [...plan.cancelQuiet, ...plan.withPeople.map((s) => s.id)],
    ruleDeleted: ruleEnds,
    notified,
  })
}
