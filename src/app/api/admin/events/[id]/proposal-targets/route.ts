// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { NextResponse } from "next/server"
import { z } from "zod"
import { requireOrgSession } from "@/lib/auth-guard"
import { validationError } from "@/lib/api-error"
import { proposalAccess } from "@/lib/proposal-access"
import { listTargets, MAX_TARGET_MINUTES, MAX_TARGETS_PER_SAVE, saveTargets } from "@/lib/proposal-targets-server"

const putSchema = z.object({
  targets: z.array(z.object({
    volunteerId: z.string().min(1).max(100),
    /** Minutes; null removes the target. */
    targetMinutes: z.number().int().min(0).max(MAX_TARGET_MINUTES).nullable(),
    /** The revision seen, or null for a person without a target yet. */
    revision: z.number().int().min(1).nullish(),
  })).min(1).max(MAX_TARGETS_PER_SAVE),
})

/**
 * GET /api/admin/events/[id]/proposal-targets (#1172): the hour targets of the event's people. PUT:
 * save several at once, all or nothing, each at the revision seen (null removes one). A target is a
 * wish for the proposal, never a limit. Organisers only, behind « assignmentProposals ».
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireOrgSession()
  if (guard instanceof NextResponse) return guard
  const { id } = await params
  const access = await proposalAccess(guard.db, guard.organizationId, id)
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status })
  const targets = await listTargets(guard.db, id)
  if (!targets) return NextResponse.json({ error: "Événement introuvable." }, { status: 404 })
  return NextResponse.json({ targets })
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireOrgSession()
  if (guard instanceof NextResponse) return guard
  const { id } = await params
  const access = await proposalAccess(guard.db, guard.organizationId, id)
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status })
  const parsed = putSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return validationError(parsed.error)
  const result = await saveTargets(guard.db, { eventId: id, organizationId: guard.organizationId, changes: parsed.data.targets, actorId: guard.session.user?.id ?? null })
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json({ saved: result.saved, removed: result.removed })
}
