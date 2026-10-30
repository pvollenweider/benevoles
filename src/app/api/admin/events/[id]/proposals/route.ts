// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { after, NextResponse } from "next/server"
import { z } from "zod"
import { requireOrgSession } from "@/lib/auth-guard"
import { validationError } from "@/lib/api-error"
import { proposalAccess } from "@/lib/proposal-access"
import { proposalConfigSchema } from "@/lib/proposal-config"
import { drainProposalRuns, latestConfiguration, launchProposal, listRuns } from "@/lib/proposal-runs-server"
import { rateLimit } from "@/lib/rate-limit"

const launchSchema = z.object({
  /** One per click on « Générer une proposition » (the page's own): a retry returns the same run. */
  idempotencyKey: z.string().min(8).max(100),
  configuration: proposalConfigSchema,
})

/**
 * GET /api/admin/events/[id]/proposals (#1172): the event's latest runs and the configuration of the
 * last one (to prefill the next). POST: launch a run on the configuration (scope, reserve, night
 * add-ons, rotation categories, preferences, seed); it is computed after the response and writes
 * draft assignments only, never a registration or an email. Organisers only, behind the beta
 * capability « assignmentProposals ».
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireOrgSession()
  if (guard instanceof NextResponse) return guard
  const { id } = await params
  const access = await proposalAccess(guard.db, guard.organizationId, id)
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status })
  const [runs, configuration] = await Promise.all([listRuns(guard.db, id), latestConfiguration(guard.db, id)])
  return NextResponse.json({ runs, configuration })
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireOrgSession()
  if (guard instanceof NextResponse) return guard
  const { id } = await params
  const access = await proposalAccess(guard.db, guard.organizationId, id)
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status })
  const parsed = launchSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return validationError(parsed.error)
  const rl = await rateLimit(`org:${guard.organizationId}`, "proposal-launch", 30, 60 * 60 * 1000)
  if (!rl.ok) return NextResponse.json({ error: "Trop de propositions lancées : réessayez dans un moment." }, { status: 429, headers: { "Retry-After": String(rl.retryAfter) } })
  const result = await launchProposal(guard.db, { eventId: id, actorId: guard.session.user?.id ?? null, idempotencyKey: parsed.data.idempotencyKey, config: parsed.data.configuration })
  if (!result.ok) return NextResponse.json({ error: result.error, code: result.code, ...(result.counts ? { counts: result.counts } : {}) }, { status: result.status })
  // Computed after the response, in this process (src/lib/proposal-runs-server.ts).
  after(() => drainProposalRuns())
  return NextResponse.json({ runId: result.runId, replay: result.replay, notice: result.notice }, { status: 202 })
}
