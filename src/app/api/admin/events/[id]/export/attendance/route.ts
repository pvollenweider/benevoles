// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { NextResponse } from "next/server"
import { requireOrgSession } from "@/lib/auth-guard"
import { attendanceCsv } from "@/lib/attendance"
import { contactPhone } from "@/lib/contact-phone"
import { orgTimeZone } from "@/lib/time-zone"
import { slugify } from "@/lib/utils"
import { answerText } from "@/lib/event-questions"

/** GET /api/admin/events/[id]/export/attendance (#399): the attendance sheet as CSV. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireOrgSession()
  if (guard instanceof NextResponse) return guard
  const { id } = await params

  const event = await guard.db.event.findFirst({
    where: { id },
    select: {
      id: true, title: true, slug: true,
      organization: { select: { timeZone: true } },
      // Custom questions (#483), archived ones included: their answers stay until the event goes.
      questions: { orderBy: [{ archivedAt: "asc" }, { position: "asc" }], select: { id: true, label: true, archivedAt: true, answers: { select: { volunteerId: true, values: true } } } },
      registrations: {
        where: { status: "active" },
        orderBy: [{ shift: { date: "asc" } }, { shift: { startTime: "asc" } }, { volunteer: { lastName: "asc" } }],
        select: {
          phone: true, checkedInAt: true, volunteerId: true,
          volunteer: { select: { firstName: true, lastName: true, email: true, phone: true } },
          shift: { select: { roleName: true, label: true, date: true, startTime: true, endTime: true } },
        },
      },
    },
  })
  if (!event) return NextResponse.json({ error: "Non trouvé" }, { status: 404 })

  const questions = (event.questions ?? []).filter((q) => !q.archivedAt || q.answers.length > 0)
  const csv = attendanceCsv(
    event.registrations.map((r) => ({
      firstName: r.volunteer.firstName,
      lastName: r.volunteer.lastName,
      email: r.volunteer.email,
      phone: contactPhone({ phone: r.phone, volunteer: r.volunteer }),
      roleName: r.shift.roleName,
      label: r.shift.label,
      date: r.shift.date.toISOString().slice(0, 10),
      startTime: r.shift.startTime,
      endTime: r.shift.endTime,
      checkedInAt: r.checkedInAt,
      answers: questions.map((q) => answerText(q.answers.find((a) => a.volunteerId === r.volunteerId)?.values)),
    })),
    orgTimeZone(event.organization),
    questions.map((q) => (q.archivedAt ? `${q.label} (question retirée)` : q.label)),
  )

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="presences-${slugify(event.title) || event.slug}.csv"`,
      "Cache-Control": "no-store",
    },
  })
}
