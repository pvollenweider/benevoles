// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { NextResponse } from "next/server"
import { z } from "zod"
import { requireOrgSession } from "@/lib/auth-guard"
import { adminActor, logEvent } from "@/lib/event-log"
import { reorderSectors } from "@/lib/sector-adoption"

/** The order of an event's active sectors (#1147): every active sector once, in the new order. */
const schema = z.object({ sectorIds: z.array(z.string().min(1)).max(200) })

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireOrgSession()
  if (guard instanceof NextResponse) return guard
  const { db, organizationId } = guard
  const { id } = await params

  const parsed = schema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: "Données invalides." }, { status: 400 })

  const event = await db.event.findFirst({ where: { id }, select: { id: true } })
  if (!event) return NextResponse.json({ error: "Non trouvé" }, { status: 404 })

  const result = await reorderSectors(db, organizationId, id, parsed.data.sectorIds)
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
  await logEvent({ eventId: id, actor: adminActor(guard.session), action: "sector.reordered", entityType: "Event", entityId: id })
  return NextResponse.json({ sectors: result.value })
}
