// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { NextResponse } from "next/server"
import { requireFrontDeskOrOrganizer } from "@/lib/auth-guard"
import { loadDayOf, type DayOfSnapshot } from "@/lib/day-of-load"
import { sectorFilterOfRequest } from "@/lib/sector-filter-data"

export const dynamic = "force-dynamic"

/**
 * The « Jour J » board as data (#1141): what the open page polls while it is visible, so a
 * check-in made on another phone shows up without a page reload. Read only, org-scoped, the same
 * query as the page. Never cached: a stale answer would pass for a fresh one. `?secteur=` (#1170)
 * keeps the page's « Secteur » filter on every read: the postes of one sector, read now.
 *
 * Also open to a front-desk account holding a live grant on this event (#1142): the guard reads
 * the grant for the event of the path, and everything below reads that same event. The board
 * carries names, phones and attendance, never an email, an answer or a note.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const guard = await requireFrontDeskOrOrganizer(id)
  if (guard instanceof NextResponse) return guard
  const sector = await sectorFilterOfRequest(guard.db, id, req)
  if (!sector) return NextResponse.json({ error: "Non trouvé" }, { status: 404 })
  const loaded = await loadDayOf(guard.db, id, new Date(), sector.shiftWhere)
  if (!loaded) return NextResponse.json({ error: "Non trouvé" }, { status: 404 })
  const body: DayOfSnapshot = { board: loaded.board, today: loaded.today, refreshedAt: loaded.refreshedAt }
  return NextResponse.json(body, { headers: { "Cache-Control": "no-store" } })
}
