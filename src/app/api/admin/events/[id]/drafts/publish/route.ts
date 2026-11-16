// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { NextResponse } from "next/server"
import { z } from "zod"
import { requireOrgSession } from "@/lib/auth-guard"
import { validationError } from "@/lib/api-error"
import { adminActor } from "@/lib/event-log"
import { publishDrafts } from "@/lib/draft-assignments-server"
import { MAX_PUBLISH_DRAFTS } from "@/lib/draft-assignments"

const schema = z.object({
  selection: z.array(z.object({ id: z.string().min(1).max(100), revision: z.number().int().min(1) })).min(1).max(MAX_PUBLISH_DRAFTS),
  /** One per click on « Publier » (the page's own): a retry returns the first result. */
  idempotencyKey: z.string().min(8).max(100),
})

/**
 * POST /api/admin/events/[id]/drafts/publish (#1146, lot C): publishes the selected drafts, all or
 * nothing, in one transaction (src/lib/draft-assignments-server.ts). A refusal lists every problem
 * and changes nothing. Organisers only.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireOrgSession()
  if (guard instanceof NextResponse) return guard
  const { id } = await params
  const parsed = schema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return validationError(parsed.error)
  const organizer = guard.session.user?.id ? await guard.db.adminUser.findFirst({ where: { id: guard.session.user.id }, select: { name: true } }) : null
  const result = await publishDrafts(guard.db, {
    eventId: id, selection: parsed.data.selection, idempotencyKey: parsed.data.idempotencyKey, actor: adminActor(guard.session),
    organizer: { email: guard.session.user?.email ?? null, name: organizer?.name ?? null },
  })
  if (!result.ok) return NextResponse.json({ error: result.error, code: result.code, ...(result.problems ? { problems: result.problems } : {}) }, { status: result.status })
  // The placement emails are queued with the registrations: they leave with the outbox cron (#916).
  return NextResponse.json({ publicationId: result.value.publicationId, replay: result.value.replay, published: result.value.drafts.length, people: result.value.people })
}
