// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { NextResponse } from "next/server"
import { z } from "zod"
import { requireOrgSession } from "@/lib/auth-guard"
import { validationError } from "@/lib/api-error"
import { discardDraft, reviewDraft } from "@/lib/draft-assignments-server"

const reviewSchema = z.object({ revision: z.number().int().min(1), ackKey: z.string().max(400).nullish() })

const respond = (r: { ok: false; status: number; error: string; code?: string }) => NextResponse.json({ error: r.error, ...(r.code ? { code: r.code } : {}) }, { status: r.status })

/**
 * PATCH /api/admin/events/[id]/drafts/[draftId] (#1146, lot C): review the draft again at the
 * revision seen (its shift and the person's answer as they are now), with the acknowledgement ticked
 * if one is needed. DELETE …?revision=N: withdraw it. Organisers only.
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string; draftId: string }> }) {
  const guard = await requireOrgSession()
  if (guard instanceof NextResponse) return guard
  const { id, draftId } = await params
  const parsed = reviewSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return validationError(parsed.error)
  const result = await reviewDraft(guard.db, { eventId: id, draftId, revision: parsed.data.revision, ackKey: parsed.data.ackKey ?? null, actorId: guard.session.user?.id ?? null })
  if (!result.ok) return respond(result)
  return NextResponse.json({ draft: { id: result.value.id, revision: result.value.revision } })
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string; draftId: string }> }) {
  const guard = await requireOrgSession()
  if (guard instanceof NextResponse) return guard
  const { id, draftId } = await params
  const revision = Number(new URL(req.url).searchParams.get("revision"))
  if (!Number.isInteger(revision) || revision < 1) return NextResponse.json({ error: "Révision manquante : rechargez la page." }, { status: 400 })
  const result = await discardDraft(guard.db, { eventId: id, draftId, revision })
  if (!result.ok) return respond(result)
  return NextResponse.json({ ok: true })
}
