// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { NextResponse } from "next/server"
import { requireOrgSession } from "@/lib/auth-guard"
import { slugify } from "@/lib/utils"
import { answerSummary, answerSummaryCsv, answerSummarySelect } from "@/lib/question-answer-summary"

/** GET /api/admin/events/[id]/export/answers (#686): the summary of the answers to the custom questions as CSV. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireOrgSession()
  if (guard instanceof NextResponse) return guard
  const { id } = await params

  const event = await guard.db.event.findFirst({ where: { id }, select: { title: true, slug: true, ...answerSummarySelect } })
  if (!event) return NextResponse.json({ error: "Non trouvé" }, { status: 404 })

  const csv = answerSummaryCsv(answerSummary(event.questions, event.registrations))
  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="reponses-${slugify(event.title) || event.slug}.csv"`,
      "Cache-Control": "no-store",
    },
  })
}
