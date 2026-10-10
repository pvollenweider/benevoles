// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { rateLimit, getClientIp } from "@/lib/rate-limit"
import { hashToken } from "@/lib/token-hash"
import { INVALID_KEEP_LINK, keepLinkValid, keepUpdate } from "@/lib/org-keep"

/**
 * « Conserver mon organisation » (#811): the link's token, sent by the button of the link page
 * (never on opening the link: mail scanners open links). Single use: every link of the
 * organisation is deleted, the procedure stops, and the organisation's log says who answered.
 */
export async function POST(req: Request) {
  const rl = await rateLimit(getClientIp(req), "org-keep", 20, 60 * 60 * 1000)
  if (!rl.ok) return NextResponse.json({ error: "Trop de tentatives. Réessayez dans une heure." }, { status: 429 })

  const { token } = await req.json().catch(() => ({}))
  if (typeof token !== "string" || token.length < 32) return NextResponse.json({ error: INVALID_KEEP_LINK }, { status: 400 })

  const now = new Date()
  const outcome = await prisma.$transaction(async (tx) => {
    const link = await tx.orgKeepLink.findUnique({
      where: { tokenHash: hashToken(token) },
      select: { organizationId: true, adminUserId: true, expiresAt: true, organization: { select: { name: true, active: true, suspendedAt: true } } },
    })
    if (!link || !keepLinkValid(link, now)) return null
    await tx.organization.update({ where: { id: link.organizationId }, data: keepUpdate(now) })
    await tx.orgKeepLink.deleteMany({ where: { organizationId: link.organizationId } })
    await tx.orgLog.create({
      data: {
        organizationId: link.organizationId,
        actorType: "admin",
        actorId: link.adminUserId,
        action: "organization.kept",
        entityType: "Organization",
        entityId: link.organizationId,
      },
    })
    return { organizationName: link.organization.name }
  })

  if (!outcome) return NextResponse.json({ error: INVALID_KEEP_LINK }, { status: 400 })
  return NextResponse.json({ ok: true, organizationName: outcome.organizationName })
}
