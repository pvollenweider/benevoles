// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { NextResponse } from "next/server"
import { requireOrgSession } from "@/lib/auth-guard"
import { loadDayOf, type DayOfSnapshot } from "@/lib/day-of-load"

export const dynamic = "force-dynamic"

/**
 * The « Jour J » board as data (#1141): what the open page polls while it is visible, so a
 * check-in made on another phone shows up without a page reload. Read only, org-scoped, the same
 * query as the page. Never cached: a stale answer would pass for a fresh one.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireOrgSession()
  if (guard instanceof NextResponse) return guard
  const { id } = await params
  const loaded = await loadDayOf(guard.db, id, new Date())
  if (!loaded) return NextResponse.json({ error: "Non trouvé" }, { status: 404 })
  const body: DayOfSnapshot = { board: loaded.board, today: loaded.today, refreshedAt: loaded.refreshedAt }
  return NextResponse.json(body, { headers: { "Cache-Control": "no-store" } })
}
