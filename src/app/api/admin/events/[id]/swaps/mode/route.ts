// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { NextResponse } from "next/server"
import { z } from "zod"
import { requireOrgSession } from "@/lib/auth-guard"
import { adminActor, logEvent } from "@/lib/event-log"
import { setShiftSwapsOption } from "@/lib/shift-swap-data"

/**
 * « Autoriser les demandes d'échange de créneaux » and « Valider chaque échange » (#1174), the
 * event's options, under the event's row lock (src/lib/shift-swap-data.ts): on is a new adoption
 * (beta gate); off ends the live requests as cancelled by the organisation, the people told. Its
 * own route, not a field of the autosaved event form, so a form save never switches swaps.
 */
const schema = z.object({ enabled: z.boolean().optional(), approval: z.boolean().optional() }).refine((v) => v.enabled !== undefined || v.approval !== undefined)

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireOrgSession()
  if (guard instanceof NextResponse) return guard
  const { db, organizationId } = guard
  const { id } = await params
  const parsed = schema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: "Indiquez s'il faut activer ou non les échanges de créneaux." }, { status: 400 })

  const actor = adminActor(guard.session)
  const result = await setShiftSwapsOption(db, organizationId, id, parsed.data, actor)
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
  if (Object.keys(result.changes).length > 0) {
    await logEvent({ eventId: id, actor, action: "event.updated", entityType: "Event", entityId: id, changes: result.changes })
  }
  return NextResponse.json({ shiftSwapsEnabled: result.shiftSwapsEnabled, shiftSwapsApproval: result.shiftSwapsApproval })
}
