// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { NextResponse } from "next/server"
import { z } from "zod"
import { requireOrgSession } from "@/lib/auth-guard"
import { adminActor } from "@/lib/event-log"
import { BULK_DELETE_MAX } from "@/lib/member-bulk-deletion"
import { runBulkMemberDeletion } from "@/lib/member-deletion-transaction"
import { rateLimit } from "@/lib/rate-limit"

/**
 * Bulk permanent deletion of member records (#1305), same level as the single-member deletion
 * (members/[id]/delete): organisers and owners. The org-scoped client is the tenant boundary: an
 * id of another organisation is absent from its reads and comes back as skipped "not found",
 * never deleted. The transaction re-checks the rule under the same row locks as
 * runMemberDeletion.
 *
 * At most BULK_DELETE_MAX ids per request after de-duplication; the members list splits a bigger
 * selection into several requests. Logged once per deleted member, exactly like the single action.
 */

const MAX_MESSAGE = `${BULK_DELETE_MAX} membres au maximum par requête. Envoyez la sélection par lots de ${BULK_DELETE_MAX}.`

const schema = z.object({
  ids: z.array(z.string().trim().min(1)).min(1),
})

export async function POST(req: Request) {
  const guard = await requireOrgSession()
  if (guard instanceof NextResponse) return guard
  const { db, organizationId, session } = guard

  const parsed = schema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    const empty = parsed.error.issues.some((issue) => issue.code === "too_small" && issue.path[0] === "ids")
    return NextResponse.json(
      { error: empty ? "Sélectionnez au moins un membre." : "Sélection invalide : envoyez une liste d'identifiants de membres." },
      { status: 400 },
    )
  }

  // Duplicates count once, and the ceiling applies to what will actually be processed.
  const ids = [...new Set(parsed.data.ids)]
  if (ids.length > BULK_DELETE_MAX) return NextResponse.json({ error: MAX_MESSAGE }, { status: 400 })

  // The members list already splits its selection; this guards a script repeating the call, like
  // the other destructive admin routes do for their own quotas.
  const rl = await rateLimit(`org:${organizationId}`, "member-bulk-delete", 60, 60 * 60 * 1000)
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Trop de suppressions groupées cette heure. Réessayez plus tard." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter) } },
    )
  }

  const result = await runBulkMemberDeletion(db, organizationId, adminActor(session), ids)
  return NextResponse.json(result)
}
