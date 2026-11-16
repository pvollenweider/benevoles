// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { NextResponse } from "next/server"
import { requireSuperAdmin } from "@/lib/auth-guard"
import { prisma } from "@/lib/prisma"
import { decideReview } from "@/lib/org-review"
import { approveOrganization } from "@/lib/org-approval-server"
import { refuseOrganization } from "@/lib/org-refusal-server"
import { deliverAfterResponse } from "@/lib/notifications/outbox"

/**
 * Review of a space awaiting validation (#810, part 4c), from its super admin page, never from a
 * link: `approve` gives both grants and emails its administrators; `refuse` deletes it with its
 * accounts (as the nightly cleanup does for a deactivated one), nothing sent.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireSuperAdmin()
  if (guard instanceof NextResponse) return guard
  const { id } = await params
  const body = await req.json().catch(() => null) as { decision?: unknown } | null

  const org = await prisma.organization.findUnique({
    where: { id },
    select: { id: true, active: true, suspendedAt: true, publicationApprovedAt: true, outboundEmailApprovedAt: true },
  })
  if (!org) return NextResponse.json({ error: "Organisation non trouvée" }, { status: 404 })

  const outcome = decideReview(org, body?.decision)
  if (!outcome.ok) return NextResponse.json({ error: outcome.error }, { status: outcome.status })

  if (outcome.decision === "refuse") {
    // The refusal's transactional part lives in src/lib/org-refusal-server.ts: the integration
    // test calls the same function outside HTTP. Its lock order (administrator rows first, then
    // the organisation) is documented there.
    const refusal = await prisma.$transaction((tx) => refuseOrganization(tx, {
      organizationId: id,
      actor: guard.session.user,
    }))
    if (!refusal.refused) return NextResponse.json({ error: refusal.error }, { status: refusal.status })
    return NextResponse.json({ ok: true, decision: "refuse" })
  }

  // The shared validation (#1371): the operator's review and the future scheduled run call the
  // very same function. It writes only on a successful conditional grant.
  const result = await prisma.$transaction((tx) => approveOrganization(tx, {
    organizationId: id,
    actor: {
      type: "operator",
      id: guard.session.user?.id ?? null,
      label: guard.session.user?.name?.trim() || guard.session.user?.email?.trim() || null,
    },
    now: outcome.update.publicationApprovedAt,
  }))

  if (!result.approved) {
    // Same responses as today for a space no longer awaiting validation; the race with a refusal
    // or a suspension ends here instead of writing a second time.
    if (result.reason === "not_found") return NextResponse.json({ error: "Organisation non trouvée" }, { status: 404 })
    return NextResponse.json({ error: "Cet espace n'est pas en attente de validation." }, { status: 409 })
  }

  deliverAfterResponse(result.outboxIds)
  return NextResponse.json({ ok: true, decision: "approve" })
}
