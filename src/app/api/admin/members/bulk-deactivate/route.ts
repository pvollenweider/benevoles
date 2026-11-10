// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { NextResponse } from "next/server"
import { z } from "zod"
import { requireOrgSession } from "@/lib/auth-guard"
import { adminActor } from "@/lib/event-log"
import { BULK_DEACTIVATE_MAX } from "@/lib/member-bulk-deactivation"
import { runBulkMemberDeactivation } from "@/lib/member-deactivation-transaction"
import { rateLimit } from "@/lib/rate-limit"

/**
 * Bulk deactivation of members (#1307), same level as the single-member deactivation
 * (`DELETE members/[id]`): organisers and owners. The org-scoped client is the tenant boundary: an
 * id of another organisation is absent from its reads and comes back as skipped "not found",
 * never deactivated. Each batch is one transaction under the same row locks as the bulk deletion.
 *
 * Already inactive records are skipped (never deactivated a second time), merged tombstones are
 * ignored. At most BULK_DEACTIVATE_MAX ids per request after de-duplication; the members list
 * splits a bigger selection into several requests. One `member.deactivated` OrgLog entry per
 * record actually deactivated, exactly like the single action.
 */

const MAX_MESSAGE = `${BULK_DEACTIVATE_MAX} membres au maximum par requête. Envoyez la sélection par lots de ${BULK_DEACTIVATE_MAX}.`

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
  if (ids.length > BULK_DEACTIVATE_MAX) return NextResponse.json({ error: MAX_MESSAGE }, { status: 400 })

  // Like the bulk deletion: a script repeating the call stays bounded, the list itself splits a
  // bigger selection into several requests.
  const rl = await rateLimit(`org:${organizationId}`, "member-bulk-deactivate", 60, 60 * 60 * 1000)
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Trop de désactivations groupées cette heure. Réessayez plus tard." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter) } },
    )
  }

  const result = await runBulkMemberDeactivation(db, organizationId, adminActor(session), ids)
  return NextResponse.json(result)
}
