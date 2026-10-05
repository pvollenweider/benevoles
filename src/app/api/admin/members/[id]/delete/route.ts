// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { NextResponse } from "next/server"
import { requireOrgSession } from "@/lib/auth-guard"
import { adminActor } from "@/lib/event-log"
import { runMemberDeletion, MemberDeletionConflictError } from "@/lib/member-deletion-transaction"

/**
 * Permanently deletes a member record (#667, owner decision), distinct from DELETE
 * /api/admin/members/[id] (that one deactivates — see its own comment). Organizer level, like the
 * rest of the members routes (src/lib/permissions.ts): merge is owner-only because it's
 * irreversible and touches every event, but deleting a record that was already inactive and had
 * no registration to begin with is a much smaller, local action.
 */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireOrgSession()
  if (guard instanceof NextResponse) return guard
  const { db, organizationId, session } = guard

  const { id } = await params

  try {
    await runMemberDeletion(db, organizationId, adminActor(session), id)
  } catch (e) {
    if (e instanceof MemberDeletionConflictError) return NextResponse.json({ error: e.message }, { status: e.status })
    throw e
  }

  return NextResponse.json({ success: true })
}
