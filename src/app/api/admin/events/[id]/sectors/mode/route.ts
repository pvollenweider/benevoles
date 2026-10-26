// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { NextResponse } from "next/server"
import { z } from "zod"
import { requireOrgSession } from "@/lib/auth-guard"
import { adminActor, logEvent } from "@/lib/event-log"
import { setSectorsEnabled } from "@/lib/sector-adoption"

/**
 * « Organiser les postes par secteurs » (#1147), the event's option, under the event's row lock
 * (src/lib/sector-adoption.ts): on needs the beta capability (a new adoption), off is refused (409)
 * once a sector was saved. Its own route, not a field of the autosaved event form, so a form save
 * never touches the mode.
 */
const schema = z.object({ enabled: z.boolean() })

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireOrgSession()
  if (guard instanceof NextResponse) return guard
  const { db, organizationId } = guard
  const { id } = await params

  const parsed = schema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: "Indiquez s'il faut activer ou non les secteurs." }, { status: 400 })

  const event = await db.event.findFirst({ where: { id }, select: { id: true } })
  if (!event) return NextResponse.json({ error: "Non trouvé" }, { status: 404 })

  const result = await setSectorsEnabled(db, organizationId, id, parsed.data.enabled)
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
  const { sectorsEnabled, sectorsAdoptedAt, changed } = result.value
  if (changed) {
    await logEvent({ eventId: id, actor: adminActor(guard.session), action: "event.updated", entityType: "Event", entityId: id, changes: { sectorsEnabled: { from: !sectorsEnabled, to: sectorsEnabled } } })
  }
  return NextResponse.json({ sectorsEnabled, sectorsAdoptedAt })
}
