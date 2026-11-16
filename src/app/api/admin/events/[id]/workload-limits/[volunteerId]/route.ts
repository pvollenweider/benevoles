// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { NextResponse } from "next/server"
import { requireOrgSession } from "@/lib/auth-guard"
import { adminActor, logEvent } from "@/lib/event-log"
import { setPersonalLimits } from "@/lib/workload-personal-data"

/**
 * One person's own workload limits on the event (#1171, lot 2): PUT sets them (each stricter than
 * or equal to the event's; refused while the current programme breaks them), DELETE removes them.
 * The log says that they changed, never the values (Codex: nothing sensitive in routine logs).
 */
type Guard = Exclude<Awaited<ReturnType<typeof requireOrgSession>>, NextResponse>

async function handle(guard: Guard, req: Request, params: Promise<{ id: string; volunteerId: string }>, remove: boolean) {
  const { db } = guard
  const { id, volunteerId } = await params
  const event = await db.event.findFirst({ where: { id }, select: { id: true } })
  if (!event) return NextResponse.json({ error: "Non trouvé" }, { status: 404 })
  // The person must be a member of this organisation (the scoped client says so).
  const member = await db.volunteer.findFirst({ where: { id: volunteerId }, select: { id: true } })
  if (!member) return NextResponse.json({ error: "Personne introuvable sur cet événement." }, { status: 404 })
  const body = remove ? null : ((await req.json().catch(() => null)) as { limits?: unknown } | null)?.limits ?? {}
  const result = await setPersonalLimits(db, id, volunteerId, body, "admin")
  if (!result.ok) return NextResponse.json({ error: result.error, problems: result.problems, workload: result.workload, code: result.workload ? "workload" : undefined }, { status: result.status })
  if (result.changed) {
    await logEvent({ eventId: id, actor: adminActor(guard.session), action: remove ? "workload.personal_limits_removed" : "workload.personal_limits_set", entityType: "Event", entityId: id })
  }
  return NextResponse.json({ layers: result.layers })
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string; volunteerId: string }> }) {
  const guard = await requireOrgSession()
  if (guard instanceof NextResponse) return guard
  return handle(guard, req, params, false)
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string; volunteerId: string }> }) {
  const guard = await requireOrgSession()
  if (guard instanceof NextResponse) return guard
  return handle(guard, req, params, true)
}
