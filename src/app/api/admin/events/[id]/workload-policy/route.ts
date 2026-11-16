// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { NextResponse } from "next/server"
import { z } from "zod"
import { requireOrgSession } from "@/lib/auth-guard"
import { adminActor, logEvent } from "@/lib/event-log"
import { loadWorkloadPolicyState, setWorkloadPolicy } from "@/lib/workload-policy-data"

/**
 * « Protection des pauses et de la charge » (#1171), the event's policy: GET reads it with the
 * current findings, PUT turns it on or off or changes its values (src/lib/workload-policy-data.ts:
 * exclusive workload lock, scan of the commitments, beta gate for a new adoption). Its own route,
 * not a field of the autosaved event form, so a form save never switches the protection.
 */
const schema = z.object({ enabled: z.boolean(), values: z.record(z.string(), z.unknown()).optional() }).strict()

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireOrgSession()
  if (guard instanceof NextResponse) return guard
  const { id } = await params
  const state = await loadWorkloadPolicyState(guard.db, guard.organizationId, id)
  if (!state) return NextResponse.json({ error: "Non trouvé" }, { status: 404 })
  return NextResponse.json(state)
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireOrgSession()
  if (guard instanceof NextResponse) return guard
  const { db, organizationId } = guard
  const { id } = await params
  const parsed = schema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: "Indiquez s'il faut activer la protection, et ses valeurs." }, { status: 400 })

  const result = await setWorkloadPolicy(db, organizationId, id, parsed.data)
  if (!result.ok) {
    return NextResponse.json({ error: result.error, ...(result.problems ? { problems: result.problems } : {}), ...(result.findings ? { findings: result.findings } : {}) }, { status: result.status })
  }
  if (Object.keys(result.changes).length > 0) {
    await logEvent({ eventId: id, actor: adminActor(guard.session), action: "event.updated", entityType: "Event", entityId: id, changes: result.changes })
  }
  return NextResponse.json({ enabled: result.enabled, policy: result.policy })
}
