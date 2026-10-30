// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { NextResponse } from "next/server"
import { requireOrgSession } from "@/lib/auth-guard"
import { proposalAccess } from "@/lib/proposal-access"
import { readRun } from "@/lib/proposal-runs-server"

/**
 * GET /api/admin/events/[id]/proposals/[runId] (#1172): one run, its state, progress, report, what
 * it wrote into the drafts and whether it is stale (recomputed from the rows now). Organisers only.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string; runId: string }> }) {
  const guard = await requireOrgSession()
  if (guard instanceof NextResponse) return guard
  const { id, runId } = await params
  const access = await proposalAccess(guard.db, guard.organizationId, id)
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status })
  const run = await readRun(guard.db, id, runId)
  if (!run) return NextResponse.json({ error: "Proposition introuvable." }, { status: 404 })
  return NextResponse.json({ run })
}
