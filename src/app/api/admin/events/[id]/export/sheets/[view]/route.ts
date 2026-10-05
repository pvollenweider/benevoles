// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { NextResponse } from "next/server"
import { requireOrgSession } from "@/lib/auth-guard"
import { contactPhone } from "@/lib/contact-phone"
import { orgTimeZone } from "@/lib/time-zone"
import { isSheetView, renderSheet } from "@/lib/print-sheets"
import { answerSummary, answerSummarySelect } from "@/lib/question-answer-summary"

/** GET /api/admin/events/[id]/export/sheets/[view] (#400): one printable sheet of the event. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string; view: string }> }) {
  const guard = await requireOrgSession()
  if (guard instanceof NextResponse) return guard
  const { id, view } = await params
  if (!isSheetView(view)) return NextResponse.json({ error: "Vue inconnue" }, { status: 404 })

  const event = await guard.db.event.findFirst({
    where: { id },
    select: {
      title: true,
      organization: { select: { name: true, timeZone: true } },
      sectorLeaders: { select: { roleName: true, name: true, email: true } },
      shifts: {
        where: { status: { not: "cancelled" } },
        orderBy: [{ date: "asc" }, { startTime: "asc" }, { displayOrder: "asc" }],
        select: {
          id: true, roleName: true, label: true, date: true, startTime: true, endTime: true, capacity: true,
          locationDetails: true, contactName: true, contactPhone: true, instructions: true,
          registrations: {
            where: { status: "active" },
            select: { phone: true, comment: true, checkedInAt: true, volunteer: { select: { id: true, firstName: true, lastName: true, email: true, phone: true } } },
          },
        },
      },
    },
  })
  if (!event) return NextResponse.json({ error: "Non trouvé" }, { status: 404 })

  // The answers summary (#686) counts every live registration, not only the confirmed ones above.
  const forAnswers = view === "answers" ? await guard.db.event.findFirst({ where: { id }, select: answerSummarySelect }) : null

  const timeZone = orgTimeZone(event.organization)
  const html = renderSheet(view, {
    eventTitle: event.title,
    organizationName: event.organization.name,
    printedAt: new Date().toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short", timeZone }),
    leaders: event.sectorLeaders,
    answers: forAnswers ? answerSummary(forAnswers.questions, forAnswers.registrations) : undefined,
    shifts: event.shifts.map((s) => ({
      id: s.id, roleName: s.roleName, label: s.label, date: s.date.toISOString().slice(0, 10),
      startTime: s.startTime, endTime: s.endTime, capacity: s.capacity,
      locationDetails: s.locationDetails, contactName: s.contactName, contactPhone: s.contactPhone, instructions: s.instructions,
      registrations: s.registrations.map((r) => ({
        id: r.volunteer.id, firstName: r.volunteer.firstName, lastName: r.volunteer.lastName, email: r.volunteer.email,
        phone: contactPhone({ phone: r.phone, volunteer: r.volunteer }), comment: r.comment, checkedIn: !!r.checkedInAt,
      })),
    })),
  })

  return new NextResponse(html, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } })
}
