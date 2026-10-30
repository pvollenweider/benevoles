// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { NextResponse } from "next/server"
import { z } from "zod"
import { requireOrgSession } from "@/lib/auth-guard"
import { validationError } from "@/lib/api-error"
import { createDraft } from "@/lib/draft-assignments-server"

const schema = z.object({
  shiftId: z.string().min(1).max(100),
  volunteerId: z.string().min(1).max(100),
  /** The acknowledgement ticked for a person placed outside their declared availability (lot B key). */
  ackKey: z.string().max(400).nullish(),
})

/**
 * POST /api/admin/events/[id]/drafts (#1146, lot C): one draft assignment, this person on this
 * shift; nothing is published, no place is held, nobody is told. Event, shift and person of this
 * organisation, on an event that uses dated availability.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireOrgSession()
  if (guard instanceof NextResponse) return guard
  const { id } = await params
  const parsed = schema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return validationError(parsed.error)
  const result = await createDraft(guard.db, { eventId: id, shiftId: parsed.data.shiftId, volunteerId: parsed.data.volunteerId, ackKey: parsed.data.ackKey ?? null, actorId: guard.session.user?.id ?? null })
  if (!result.ok) return NextResponse.json({ error: result.error, ...(result.code ? { code: result.code } : {}) }, { status: result.status })
  return NextResponse.json({ draft: { id: result.value.id, revision: result.value.revision } }, { status: 201 })
}
