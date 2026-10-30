// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { NextResponse } from "next/server"
import { requireOrgSession } from "@/lib/auth-guard"
import { loadDraftOptions } from "@/lib/draft-board-data"

/**
 * GET /api/admin/events/[id]/drafts/options?volunteerId=…&date=YYYY-MM-DD (#1146, lot C): the
 * shifts of that date for that person, each with their availability, the acknowledgement key when
 * one is needed, places and what the workload protection would say once published. Organisers
 * only; private.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireOrgSession()
  if (guard instanceof NextResponse) return guard
  const { id } = await params
  const url = new URL(req.url)
  const volunteerId = url.searchParams.get("volunteerId") ?? ""
  const date = url.searchParams.get("date") ?? ""
  if (!volunteerId || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return NextResponse.json({ error: "Choisissez une personne et une date." }, { status: 400 })
  const result = await loadDraftOptions(guard.db, id, volunteerId, date)
  if (!result) return NextResponse.json({ error: "Non trouvé" }, { status: 404 })
  return NextResponse.json(result, { headers: { "Cache-Control": "private, no-store" } })
}
