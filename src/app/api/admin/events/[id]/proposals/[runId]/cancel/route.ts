// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { NextResponse } from "next/server"
import { requireOrgSession } from "@/lib/auth-guard"
import { proposalAccess } from "@/lib/proposal-access"
import { cancelRun } from "@/lib/proposal-runs-server"

/**
 * POST /api/admin/events/[id]/proposals/[runId]/cancel (#1172): « Arrêter la recherche ». A queued
 * run stops at once, a running one at its next heartbeat; a run already written cannot be cancelled.
 * Nothing is published and nobody is told (D08). Organisers only.
 */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string; runId: string }> }) {
  const guard = await requireOrgSession()
  if (guard instanceof NextResponse) return guard
  const { id, runId } = await params
  const access = await proposalAccess(guard.db, guard.organizationId, id)
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status })
  const result = await cancelRun(guard.db, { eventId: id, runId })
  if (!result.ok) return NextResponse.json({ error: result.error, code: result.code }, { status: result.status })
  return NextResponse.json({ status: result.status })
}
