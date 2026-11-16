// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { NextResponse } from "next/server"
import { z } from "zod"
import { requireOrgSession } from "@/lib/auth-guard"
import { adminActor, logEvent } from "@/lib/event-log"
import { setAvailabilityOption } from "@/lib/event-availability-server"

/**
 * « Recueillir les disponibilités pour cet événement » and its deadline (#1146), under the event's
 * row lock (src/lib/event-availability-server.ts). Its own route, not a field of the autosaved event
 * form. Turning it off revokes the links and keeps the answers, after a confirmation.
 */
const schema = z.object({ enabled: z.boolean().optional(), deadline: z.string().max(32).nullable().optional(), confirm: z.boolean().optional() })
  .refine((v) => v.enabled !== undefined || v.deadline !== undefined)

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireOrgSession()
  if (guard instanceof NextResponse) return guard
  const { id } = await params
  const parsed = schema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: "Indiquez s'il faut recueillir ou non les disponibilités." }, { status: 400 })
  const result = await setAvailabilityOption(guard.db, guard.organizationId, id, parsed.data)
  if (!result.ok) return NextResponse.json({ error: result.error, ...(result.liveLinks ? { liveLinks: result.liveLinks } : {}) }, { status: result.status })
  const { ok: _ok, changes, ...state } = result
  void _ok
  if (Object.keys(changes).length > 0) {
    await logEvent({ eventId: id, actor: adminActor(guard.session), action: "event.updated", entityType: "Event", entityId: id, changes })
  }
  return NextResponse.json(state)
}
