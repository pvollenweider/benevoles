// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { NextResponse } from "next/server"
import { randomBytes } from "crypto"
import { prisma } from "@/lib/prisma"
import { rateLimit, getClientIp } from "@/lib/rate-limit"
import { hashToken } from "@/lib/token-hash"
import { normalizeEmail } from "@/lib/email-address"
import { deliverAfterResponse, enqueueNotifications } from "@/lib/notifications/outbox"
import { canSelfReactivate, REACTIVATION_LINK_HOURS } from "@/lib/org-reactivation"

/**
 * « Réactiver mon espace » (#811), step 1: an address. When it belongs to an active administrator
 * of a space deactivated for inactivity, a single-use link goes to it. The answer is the same in
 * every case, so the form tells nobody which addresses or spaces exist.
 */
export async function POST(req: Request) {
  const rl = await rateLimit(getClientIp(req), "org-reactivation", 5, 60 * 60 * 1000)
  if (!rl.ok) return NextResponse.json({ ok: true })

  const { email } = await req.json().catch(() => ({}))
  if (typeof email !== "string" || !email.includes("@")) {
    return NextResponse.json({ error: "Email invalide." }, { status: 400 })
  }

  const admin = await prisma.adminUser.findUnique({
    where: { email: normalizeEmail(email) },
    select: {
      id: true, name: true, email: true, isActive: true,
      organization: { select: { name: true, active: true, suspendedAt: true, inactivityDeactivatedAt: true } },
    },
  })
  if (!admin || !admin.isActive || !admin.organization || !canSelfReactivate(admin.organization)) {
    return NextResponse.json({ ok: true })
  }

  const secret = randomBytes(32).toString("hex")
  const expiresAt = new Date(Date.now() + REACTIVATION_LINK_HOURS * 60 * 60 * 1000)
  const APP_URL = (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/$/, "")
  const reactivateUrl = `${APP_URL}/admin/reactivate/confirm?token=${secret}`

  // The token and the email carrying it commit together. The email has no organisation: every
  // email of a deactivated organisation is refused at send time (#814), and this one must go.
  const outboxIds = await prisma.$transaction(async (tx) => {
    await tx.adminUser.update({
      where: { id: admin.id },
      data: { orgReactivationTokenHash: hashToken(secret), orgReactivationExpiresAt: expiresAt },
    })
    return enqueueNotifications([{
      kind: "org_reactivation",
      organizationId: null,
      recipient: { email: admin.email, name: admin.name },
      data: { adminName: admin.name, organizationName: admin.organization!.name, reactivateUrl, hours: REACTIVATION_LINK_HOURS },
    }], tx)
  })
  deliverAfterResponse(outboxIds)

  return NextResponse.json({ ok: true })
}
