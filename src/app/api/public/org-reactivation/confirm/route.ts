// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { rateLimit, getClientIp } from "@/lib/rate-limit"
import { hashToken } from "@/lib/token-hash"
import { INVALID_REACTIVATION_LINK, reactivationLinkValid, reactivationUpdate } from "@/lib/org-reactivation"

/**
 * « Réactiver mon espace » (#811), step 2: the link's token, sent by the button of the link page
 * (never on opening the link: mail scanners open links). Used once: the space is active again, the
 * check starts over from today, and the organisation's log says who reactivated it.
 */
export async function POST(req: Request) {
  const rl = await rateLimit(getClientIp(req), "org-reactivation-confirm", 20, 60 * 60 * 1000)
  if (!rl.ok) return NextResponse.json({ error: "Trop de tentatives. Réessayez dans une heure." }, { status: 429 })

  const { token } = await req.json().catch(() => ({}))
  if (typeof token !== "string" || token.length < 32) return NextResponse.json({ error: INVALID_REACTIVATION_LINK }, { status: 400 })

  const now = new Date()
  const outcome = await prisma.$transaction(async (tx) => {
    const admin = await tx.adminUser.findUnique({
      where: { orgReactivationTokenHash: hashToken(token) },
      select: {
        id: true, isActive: true, orgReactivationExpiresAt: true, organizationId: true,
        organization: { select: { name: true, active: true, suspendedAt: true, inactivityDeactivatedAt: true } },
      },
    })
    if (!admin) return null
    // Valid or not, a presented link is spent.
    await tx.adminUser.update({ where: { id: admin.id }, data: { orgReactivationTokenHash: null, orgReactivationExpiresAt: null } })
    if (!admin.organizationId || !reactivationLinkValid(admin, now)) return null
    const orgId = admin.organizationId
    await tx.organization.update({ where: { id: orgId }, data: reactivationUpdate(now) })
    // The other administrators' links have nothing left to do.
    await tx.adminUser.updateMany({ where: { organizationId: orgId, orgReactivationTokenHash: { not: null } }, data: { orgReactivationTokenHash: null, orgReactivationExpiresAt: null } })
    await tx.orgLog.create({
      data: {
        organizationId: orgId,
        actorType: "admin",
        actorId: admin.id,
        action: "organization.reactivated_after_inactivity",
        entityType: "Organization",
        entityId: orgId,
      },
    })
    return { organizationName: admin.organization!.name }
  })

  if (!outcome) return NextResponse.json({ error: INVALID_REACTIVATION_LINK }, { status: 400 })
  return NextResponse.json({ ok: true, organizationName: outcome.organizationName })
}
