// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { NextResponse } from "next/server"
import { requireOrgSession } from "@/lib/auth-guard"
import { loadOrganiserSwaps } from "@/lib/shift-swap-data"
import { swapsShipped } from "@/lib/shift-swap-gate"

/**
 * The event's shift swap requests for its organisers (#1174): those waiting for their approval
 * first, then the other live ones, then the latest ended, with both people and both shifts.
 * Org-scoped: another organisation's event answers as unknown.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireOrgSession()
  if (guard instanceof NextResponse) return guard
  const { id } = await params
  const swaps = await loadOrganiserSwaps(guard.db, id)
  if (!swaps) return NextResponse.json({ error: "Non trouvé" }, { status: 404 })
  if (!swapsShipped()) return NextResponse.json({ shiftSwapsEnabled: false, shiftSwapsApproval: swaps.shiftSwapsApproval, requests: [] })
  return NextResponse.json(swaps)
}
