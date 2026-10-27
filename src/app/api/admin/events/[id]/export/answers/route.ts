// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { NextResponse } from "next/server"
import { requireOrgSession } from "@/lib/auth-guard"
import { slugify } from "@/lib/utils"
import { answerSummary, answerSummaryCsv, answerSummarySelectFor } from "@/lib/question-answer-summary"
import { sectorFilterOfRequest } from "@/lib/sector-filter-data"
import { sectorFileSuffix } from "@/lib/sector-filter"

/**
 * GET /api/admin/events/[id]/export/answers (#686): the summary of the answers to the custom
 * questions as CSV. `?secteur=` (#1170) counts the people registered on the sector's postes only.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireOrgSession()
  if (guard instanceof NextResponse) return guard
  const { id } = await params
  const sector = await sectorFilterOfRequest(guard.db, id, req)
  if (!sector) return NextResponse.json({ error: "Non trouvé" }, { status: 404 })

  const event = await guard.db.event.findFirst({ where: { id }, select: { title: true, slug: true, ...answerSummarySelectFor(sector.shiftWhere) } })
  if (!event) return NextResponse.json({ error: "Non trouvé" }, { status: 404 })

  const csv = answerSummaryCsv(answerSummary(event.questions, event.registrations))
  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="reponses-${slugify(event.title) || event.slug}${sectorFileSuffix(sector.filter)}.csv"`,
      "Cache-Control": "no-store",
    },
  })
}
