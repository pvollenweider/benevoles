// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { NextResponse } from "next/server"
import { requireSuperAdmin } from "@/lib/auth-guard"
import { prisma } from "@/lib/prisma"
import { decideReview } from "@/lib/org-review"
import { deliverAfterResponse, enqueueNotifications } from "@/lib/notifications/outbox"

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
    select: { id: true, name: true, active: true, suspendedAt: true, publicationApprovedAt: true, outboundEmailApprovedAt: true },
  })
  if (!org) return NextResponse.json({ error: "Organisation non trouvée" }, { status: 404 })

  const outcome = decideReview(org, body?.decision)
  if (!outcome.ok) return NextResponse.json({ error: outcome.error }, { status: outcome.status })

  if (outcome.decision === "refuse") {
    await prisma.$transaction(async (tx) => {
      // Admins are only SET NULL by the organisation's deletion: removed with it, as the cleanup does.
      await tx.adminUser.deleteMany({ where: { organizationId: id } })
      await tx.organization.delete({ where: { id } })
    })
    return NextResponse.json({ ok: true, decision: "refuse" })
  }

  const base = (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/+$/, "")
  const ids = await prisma.$transaction(async (tx) => {
    await tx.organization.update({ where: { id }, data: outcome.update })
    await tx.orgLog.create({
      data: { organizationId: id, actorType: "admin", actorId: guard.session.user?.id ?? null, action: "organization.approved", entityType: "Organization", entityId: id },
    })
    const admins = await tx.adminUser.findMany({ where: { organizationId: id }, select: { email: true, name: true } })
    return enqueueNotifications(admins.map((a) => ({
      kind: "space_approved" as const,
      organizationId: id,
      recipient: { email: a.email, name: a.name },
      dedupeKey: `space_approved:${id}:${a.email}`,
      data: { adminName: a.name, organizationName: org.name, adminUrl: `${base}/admin/events` },
    })), tx)
  })
  deliverAfterResponse(ids)
  return NextResponse.json({ ok: true, decision: "approve" })
}
