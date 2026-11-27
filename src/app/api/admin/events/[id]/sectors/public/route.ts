// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { NextResponse } from "next/server"
import { z } from "zod"
import { requireOrgSession } from "@/lib/auth-guard"
import { adminActor, logEvent } from "@/lib/event-log"
import { PUBLIC_GROUPING_NOT_ADOPTED_ERROR, sectorsAdopted } from "@/lib/sectors"

/**
 * « Regrouper les créneaux par secteur sur la page d'inscription » (#1469): whether the sign-up page
 * shows the sector names as headings. Its own route, like the sectors option, so an autosave of the
 * event form never touches it. Only for an event that adopted sectors (409 otherwise): before that
 * there is nothing to group by.
 */
const schema = z.object({ enabled: z.boolean() })

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireOrgSession()
  if (guard instanceof NextResponse) return guard
  const { db } = guard
  const { id } = await params

  const parsed = schema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: "Indiquez s'il faut regrouper ou non les créneaux par secteur." }, { status: 400 })

  const event = await db.event.findFirst({ where: { id }, select: { id: true, sectorsEnabled: true, sectorsAdoptedAt: true, publicSectorGrouping: true } })
  if (!event) return NextResponse.json({ error: "Non trouvé" }, { status: 404 })
  if (!sectorsAdopted(event)) return NextResponse.json({ error: PUBLIC_GROUPING_NOT_ADOPTED_ERROR }, { status: 409 })

  const enabled = parsed.data.enabled
  if (enabled !== event.publicSectorGrouping) {
    await db.event.update({ where: { id }, data: { publicSectorGrouping: enabled } })
    await logEvent({ eventId: id, actor: adminActor(guard.session), action: "event.updated", entityType: "Event", entityId: id, changes: { publicSectorGrouping: { from: !enabled, to: enabled } } })
  }
  return NextResponse.json({ publicSectorGrouping: enabled })
}
