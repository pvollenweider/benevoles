// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { NextResponse } from "next/server"
import { z } from "zod"
import { civilDateSchema } from "@/lib/civil-date"
import { requireOrgSession } from "@/lib/auth-guard"
import { clockSchema } from "@/lib/shift-time"
import { adminActor, logEvent } from "@/lib/event-log"
import { validationError } from "@/lib/api-error"
import { generateRecurrence, recurrenceProblem, type RecurrenceInput } from "@/lib/shift-recurrence"
import { SHIFT_CONTACT_NAME_MAX, SHIFT_CONTACT_PHONE_MAX, SHIFT_INSTRUCTIONS_MAX } from "@/lib/shift-info"

const schema = z.object({
  eventId: z.string(),
  roleName: z.string().trim().min(1),
  label: z.string().optional(),
  from: civilDateSchema,
  until: civilDateSchema,
  weekdays: z.array(z.number().int().min(1).max(7)).min(1).max(7),
  everyWeeks: z.union([z.literal(1), z.literal(2)]),
  startTime: clockSchema,
  endTime: clockSchema,
  slotMinutes: z.number().int(),
  breakMinutes: z.number().int().optional(),
  capacity: z.number().int().min(1),
  holidays: z.enum(["none", "FR", "CH"]),
  closures: z.array(civilDateSchema).max(366).default([]),
  locationDetails: z.string().optional(),
  contactName: z.string().max(SHIFT_CONTACT_NAME_MAX).optional().nullable(),
  contactPhone: z.string().max(SHIFT_CONTACT_PHONE_MAX).optional().nullable(),
  instructions: z.string().max(SHIFT_INSTRUCTIONS_MAX).optional().nullable(),
  displayOrder: z.number().int().optional(),
  waitlistEnabled: z.boolean().optional(),
  requiresApproval: z.boolean().optional(),
})

const day = (d: Date) => d.toISOString().slice(0, 10)

/**
 * Creates a recurring permanence (#866): the rule and every shift it gives, in one transaction,
 * all or none. The shifts are ordinary shifts linked to the rule.
 */
export async function POST(req: Request) {
  const guard = await requireOrgSession()
  if (guard instanceof NextResponse) return guard
  const { db } = guard

  const parsed = schema.safeParse(await req.json())
  if (!parsed.success) return validationError(parsed.error, { useIssueMessage: true })
  const { eventId, roleName, label, from, until, weekdays, everyWeeks, startTime, endTime, slotMinutes, breakMinutes = 0, capacity, holidays, closures, ...info } = parsed.data

  const owned = await db.event.findFirst({ where: { id: eventId }, select: { id: true, startDate: true, endDate: true } })
  if (!owned) return NextResponse.json({ error: "Événement introuvable" }, { status: 404 })

  const input: RecurrenceInput = {
    from, until, weekdays: [...new Set(weekdays)].sort() as RecurrenceInput["weekdays"], everyWeeks,
    startTime, endTime, slotMinutes, breakMinutes, holidays, closures: [...new Set(closures)].sort(),
  }
  const problem = recurrenceProblem(input, { start: day(owned.startDate), end: day(owned.endDate) })
  if (problem) return NextResponse.json({ error: problem }, { status: 400 })

  const { shifts: slots } = generateRecurrence(input)
  const shiftLabel = label?.trim() || roleName
  const { rule, count } = await db.$transaction(async (tx) => {
    const rule = await tx.shiftRecurrence.create({
      data: {
        eventId, roleName, label: shiftLabel, weekdays: input.weekdays, everyWeeks, startTime, endTime, slotMinutes, breakMinutes,
        capacity, fromDate: new Date(from), untilDate: new Date(until), holidays, closures: input.closures,
      },
    })
    const created = await tx.shift.createMany({
      data: slots.map((slot) => ({
        ...info,
        eventId,
        roleName,
        label: shiftLabel,
        capacity,
        date: new Date(slot.date),
        startTime: slot.startTime,
        endTime: slot.endTime,
        status: "open",
        recurrenceId: rule.id,
      })),
    })
    return { rule, count: created.count }
  })

  // One entry for the whole rule: hundreds of « shift.created » lines would drown the log.
  await logEvent({
    eventId,
    actor: adminActor(guard.session),
    action: "recurrence.created",
    entityType: "ShiftRecurrence",
    entityId: rule.id,
    changes: {
      roleName: { from: null, to: roleName },
      from: { from: null, to: from },
      until: { from: null, to: until },
      startTime: { from: null, to: startTime },
      endTime: { from: null, to: endTime },
      shiftCount: { from: null, to: count },
    },
  })

  const shifts = await db.shift.findMany({ where: { recurrenceId: rule.id }, orderBy: [{ date: "asc" }, { startTime: "asc" }] })
  return NextResponse.json({
    recurrenceId: rule.id,
    rule: { ...rule, fromDate: day(rule.fromDate), untilDate: day(rule.untilDate) },
    shifts,
  }, { status: 201 })
}
