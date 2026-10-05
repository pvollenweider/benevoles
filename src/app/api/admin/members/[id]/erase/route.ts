// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { NextResponse } from "next/server"
import { requireOrgSession } from "@/lib/auth-guard"
import { adminActor } from "@/lib/event-log"
import { runMemberErasure, MemberErasureConflictError } from "@/lib/member-erasure-transaction"
import { reportError } from "@/lib/report-error"

/**
 * Erases a member's personal data (#516, owner decision: anonymise, not delete). Owners and
 * organizers, like permanent deletion (#667): answering a person's erasure request is part of
 * managing the members. Irreversible, confirmed in the member page's dialog; idempotent (a second
 * call on an erased record changes nothing and says so).
 */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireOrgSession()
  if (guard instanceof NextResponse) return guard
  const { db, organizationId, session } = guard

  const { id } = await params

  try {
    const result = await runMemberErasure(db, organizationId, adminActor(session), id)
    // The erasure date, so the page's notice says the same thing before and after its refresh.
    return NextResponse.json({ success: true, alreadyErased: result.alreadyErased, erasedAt: result.erasedAt.toISOString() })
  } catch (e) {
    if (e instanceof MemberErasureConflictError) return NextResponse.json({ error: e.message }, { status: e.status })
    // One transaction: a failure rolls everything back. Say so in JSON (the dialog shows it) rather
    // than a bare 500 page, like the merge route.
    reportError("member.erase")(e)
    return NextResponse.json({ error: "L'effacement n'a pas pu être fait. Rien n'a été modifié.", notApplied: true }, { status: 500 })
  }
}
