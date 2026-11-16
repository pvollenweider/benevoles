// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { NextResponse } from "next/server"
import { requireSuperAdmin } from "@/lib/auth-guard"
import { prisma } from "@/lib/prisma"
import { decideReview } from "@/lib/org-review"
import { approveOrganization } from "@/lib/org-approval-server"
import { deliverAfterResponse } from "@/lib/notifications/outbox"
import { logOperator, organizationTarget } from "@/lib/operator-log"

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
    select: { id: true, name: true, slug: true, active: true, suspendedAt: true, publicationApprovedAt: true, outboundEmailApprovedAt: true },
  })
  if (!org) return NextResponse.json({ error: "Organisation non trouvée" }, { status: 404 })

  const outcome = decideReview(org, body?.decision)
  if (!outcome.ok) return NextResponse.json({ error: outcome.error }, { status: outcome.status })

  if (outcome.decision === "refuse") {
    const refusal = await prisma.$transaction(async (tx) => {
      // The same organisation row lock as the approval (#1371): the two decisions serialise. The
      // state is read again under that lock, so an approval that committed first is never undone
      // by a refusal decided from the older read above.
      await tx.$queryRaw`SELECT id FROM "Organization" WHERE id = ${id} FOR UPDATE`
      const current = await tx.organization.findUnique({
        where: { id },
        select: { active: true, suspendedAt: true, publicationApprovedAt: true, outboundEmailApprovedAt: true },
      })
      if (!current) return { ok: false as const, status: 404 as const, error: "Organisation non trouvée" }
      const again = decideReview(current, "refuse")
      if (!again.ok) return { ok: false as const, status: again.status, error: again.error }
      // Admins are only SET NULL by the organisation's deletion: removed with it, as the cleanup does.
      await tx.adminUser.deleteMany({ where: { organizationId: id } })
      await tx.organization.delete({ where: { id } })
      // The organisation's own log goes with it: the decision is kept in the operator's log.
      await logOperator(tx, { action: "organization.refused", actor: guard.session.user, entityType: "Organization", entityId: id, target: organizationTarget(org) })
      return { ok: true as const }
    })
    if (!refusal.ok) return NextResponse.json({ error: refusal.error }, { status: refusal.status })
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
