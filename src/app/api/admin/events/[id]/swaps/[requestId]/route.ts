// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { NextResponse } from "next/server"
import { z } from "zod"
import { requireOrgSession } from "@/lib/auth-guard"
import { swapsShipped } from "@/lib/shift-swap-gate"
import { decideSwap, SWAP_NOT_FOUND, SWAP_UNAVAILABLE } from "@/lib/shift-swap-server"

/**
 * An organiser approves or refuses a shift swap waiting for validation (#1174), bound to the
 * request's `revision` shown: a second click or another organiser's decision answers with the
 * current state. Approving runs every rule again; an approval never overrides one.
 */
const schema = z.object({ approve: z.boolean(), revision: z.number().int().min(0) })

export async function POST(req: Request, { params }: { params: Promise<{ id: string; requestId: string }> }) {
  const guard = await requireOrgSession()
  if (guard instanceof NextResponse) return guard
  const { db, organizationId, session } = guard
  const { id, requestId } = await params
  const parsed = schema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: "Indiquez s'il faut valider ou refuser l'échange." }, { status: 400 })
  const request = await db.shiftSwapRequest.findFirst({ where: { id: requestId, eventId: id }, select: { id: true } })
  if (!request) return NextResponse.json({ error: SWAP_NOT_FOUND }, { status: 404 })
  if (!swapsShipped()) return NextResponse.json({ error: SWAP_UNAVAILABLE, code: "unavailable" }, { status: 403 })
  const result = await decideSwap(db, { organizationId, requestId, adminId: session.user?.id ?? "", approve: parsed.data.approve, revision: parsed.data.revision })
  if (!result.ok) return NextResponse.json({ error: result.error, status: result.status, code: result.code }, { status: result.httpStatus })
  return NextResponse.json(result)
}
