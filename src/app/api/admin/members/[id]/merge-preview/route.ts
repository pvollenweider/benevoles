// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { NextResponse } from "next/server"
import { requireOrgSession } from "@/lib/auth-guard"
import { validationError } from "@/lib/api-error"
import { mergeRequestSchema } from "@/lib/member-merge-schema"
import { loadMergeInput, withKeepAddressHash } from "@/lib/member-merge-transaction"
import { buildMergePreview, resolvedFields } from "@/lib/member-merge"

/**
 * Full preview of a merge (#600): field diffs, every relation count, every conflict — nothing is
 * written. Owner-only (merge is irreversible and touches every event); organizers can see
 * duplicates (#599) but not merge.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireOrgSession("owner")
  if (guard instanceof NextResponse) return guard
  const { db } = guard

  const { id: keepId } = await params
  const body = await req.json().catch(() => null)
  const parsed = mergeRequestSchema.safeParse(body)
  if (!parsed.success) return validationError(parsed.error)
  const { otherId: absorbId, choices } = parsed.data

  const loaded = await loadMergeInput(db, keepId, absorbId)
  if ("error" in loaded) {
    return NextResponse.json({ error: loaded.error }, { status: loaded.error === "Non trouvé" ? 404 : 409 })
  }

  const finalEmail = resolvedFields(loaded, choices).email
  const input = withKeepAddressHash(loaded, finalEmail)
  const preview = buildMergePreview(input, choices)

  return NextResponse.json({
    keep: { id: loaded.keep.id, firstName: loaded.keep.firstName, lastName: loaded.keep.lastName, email: loaded.keep.email },
    absorb: { id: loaded.absorb.id, firstName: loaded.absorb.firstName, lastName: loaded.absorb.lastName, email: loaded.absorb.email },
    preview,
  })
}
