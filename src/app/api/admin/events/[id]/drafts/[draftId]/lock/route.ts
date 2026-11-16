// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { NextResponse } from "next/server"
import { z } from "zod"
import { requireOrgSession } from "@/lib/auth-guard"
import { validationError } from "@/lib/api-error"
import { setDraftLock } from "@/lib/draft-assignments-server"
import { proposalAccess } from "@/lib/proposal-access"

const schema = z.object({ revision: z.number().int().min(1), locked: z.boolean() })

/**
 * POST /api/admin/events/[id]/drafts/[draftId]/lock (#1172): « Verrouiller » / « Déverrouiller » a
 * draft at the revision seen: a locked draft is kept by every new proposal. Organisers only, behind
 * « assignmentProposals ».
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string; draftId: string }> }) {
  const guard = await requireOrgSession()
  if (guard instanceof NextResponse) return guard
  const { id, draftId } = await params
  const access = await proposalAccess(guard.db, guard.organizationId, id)
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status })
  const parsed = schema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return validationError(parsed.error)
  const result = await setDraftLock(guard.db, { eventId: id, draftId, revision: parsed.data.revision, locked: parsed.data.locked })
  if (!result.ok) return NextResponse.json({ error: result.error, ...(result.code ? { code: result.code } : {}) }, { status: result.status })
  return NextResponse.json({ draft: { id: result.value.id, revision: result.value.revision, locked: result.value.locked } })
}
