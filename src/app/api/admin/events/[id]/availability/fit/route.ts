// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { NextResponse } from "next/server"
import { requireOrgSession } from "@/lib/auth-guard"
import { loadPersonFits } from "@/lib/availability-assist-data"

/** Shifts asked at most in one read: the manual add form's limit (#918). */
const MAX_SHIFTS = 30

/**
 * One person's dated availability for the shifts chosen in the manual add form (#1146, lot B), for
 * the organisers: each shift's fit and, when the person said they are not available then, the key
 * of the acknowledgement to send with the addition. Event and person of this organisation only;
 * an event without the option answers `inUse: false`.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireOrgSession()
  if (guard instanceof NextResponse) return guard
  const { id } = await params
  const url = new URL(req.url)
  const volunteerId = url.searchParams.get("volunteerId") ?? ""
  const shiftIds = [...new Set(url.searchParams.getAll("shiftId").filter(Boolean))]
  if (!volunteerId || shiftIds.length === 0 || shiftIds.length > MAX_SHIFTS) return NextResponse.json({ error: "Choisissez une personne et au moins un créneau." }, { status: 400 })
  const result = await loadPersonFits(guard.db, id, volunteerId, shiftIds)
  if (!result) return NextResponse.json({ error: "Non trouvé" }, { status: 404 })
  return NextResponse.json(result, { headers: { "Cache-Control": "private, no-store" } })
}
