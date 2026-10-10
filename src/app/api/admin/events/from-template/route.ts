// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { NextResponse } from "next/server"
import { civilDateSchema } from "@/lib/civil-date"
import { z } from "zod"
import { requireOrgSession } from "@/lib/auth-guard"
import { validationError } from "@/lib/api-error"
import { slugify } from "@/lib/utils"
import { findTemplate, templateToEvent } from "@/lib/event-templates"
import { defaultHolidayCalendar } from "@/lib/shift-recurrence"
import { orgTimeZone } from "@/lib/time-zone"

const schema = z.object({
  templateId: z.string().min(1),
  title: z.string().max(200).optional().default(""),
  startDate: civilDateSchema,
})

/** POST /api/admin/events/from-template (#395): a draft event with the template's shifts. */
export async function POST(req: Request) {
  const guard = await requireOrgSession()
  if (guard instanceof NextResponse) return guard
  const { db, organizationId } = guard

  const parsed = schema.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) return validationError(parsed.error, { useIssueMessage: true })

  const template = findTemplate(parsed.data.templateId)
  if (!template) return NextResponse.json({ error: "Modèle inconnu." }, { status: 400 })

  const draft = templateToEvent(template, parsed.data)
  let slug = slugify(draft.title)
  const existing = await db.event.findFirst({ where: { slug }, select: { id: true } })
  if (existing) slug = `${slug}-${Date.now()}`

  const event = await db.event.create({
    data: {
      title: draft.title,
      slug,
      organizationId,
      startDate: new Date(draft.startDate),
      endDate: new Date(draft.endDate),
      publicStatus: "draft",
      isListed: true,
      // Registrations start closed (#463): opening them is a decision, like publishing.
      registrationsOpen: false,
      shifts: {
        create: draft.shifts.map((s) => ({ ...s, date: new Date(s.date), status: "open" })),
      },
    },
    select: { id: true, organization: { select: { timeZone: true } } },
  })

  // Recurring permanences (#866): each rule, then its shifts linked to it, leaving out the public
  // holidays suggested by the organisation's zone.
  const holidays = defaultHolidayCalendar(orgTimeZone(event.organization))
  let recurringCount = 0
  for (const { rule, shifts } of templateToEvent(template, parsed.data, holidays).recurrences) {
    await db.$transaction(async (tx) => {
      const created = await tx.shiftRecurrence.create({
        data: { ...rule, eventId: event.id, fromDate: new Date(rule.fromDate), untilDate: new Date(rule.untilDate) },
      })
      await tx.shift.createMany({ data: shifts.map((s) => ({ ...s, eventId: event.id, date: new Date(s.date), status: "open", recurrenceId: created.id })) })
    })
    recurringCount += shifts.length
  }

  return NextResponse.json({ id: event.id, shiftCount: draft.shifts.length + recurringCount }, { status: 201 })
}
