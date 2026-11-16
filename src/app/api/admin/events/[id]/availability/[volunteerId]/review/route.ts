// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { NextResponse } from "next/server"
import { z } from "zod"
import { requireOrgSession } from "@/lib/auth-guard"
import { validationError } from "@/lib/api-error"
import { markAvailabilityReviewed } from "@/lib/event-availability-server"

const schema = z.object({ revision: z.number().int().min(0) })

/**
 * POST /api/admin/events/[id]/availability/[volunteerId]/review (#1146, lot C): an organiser read a
 * flagged answer (changed after a publication, or kept by a merge): the flag goes, only when the
 * answer is still at the revision they saw. Event and person of this organisation only.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string; volunteerId: string }> }) {
  const guard = await requireOrgSession()
  if (guard instanceof NextResponse) return guard
  const { id, volunteerId } = await params
  const parsed = schema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return validationError(parsed.error)
  const result = await markAvailabilityReviewed(guard.db, id, volunteerId, parsed.data.revision)
  if (result === "not_found") return NextResponse.json({ error: "Non trouvé" }, { status: 404 })
  if (result === "changed") return NextResponse.json({ error: "Cette réponse a encore changé : relisez-la avant de la marquer comme vue.", code: "changed" }, { status: 409 })
  return NextResponse.json({ ok: true })
}
