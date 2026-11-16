// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { NextResponse } from "next/server"
import { requireOrgSession } from "@/lib/auth-guard"
import { proposalAccess } from "@/lib/proposal-access"
import { writeRunResult } from "@/lib/proposal-runs-server"

/**
 * POST /api/admin/events/[id]/proposals/[runId]/write (#1172): « Utiliser ce résultat partiel »,
 * the stored result of an interrupted run written into the drafts, once, checked again against the
 * rows as they are now. The same request again returns the first receipt. Organisers only.
 */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string; runId: string }> }) {
  const guard = await requireOrgSession()
  if (guard instanceof NextResponse) return guard
  const { id, runId } = await params
  const access = await proposalAccess(guard.db, guard.organizationId, id)
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status })
  const result = await writeRunResult(guard.db, { eventId: id, runId, actorId: guard.session.user?.id ?? null })
  if (!result.ok) return NextResponse.json({ error: result.error, code: result.code }, { status: result.status })
  return NextResponse.json({ replay: result.replay, written: result.writtenCount, dropped: result.droppedCount })
}
