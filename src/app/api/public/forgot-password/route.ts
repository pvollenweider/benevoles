// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { rateLimit, getClientIp } from "@/lib/rate-limit"
import { normalizeEmail } from "@/lib/email-address"
import { deliverAfterResponse } from "@/lib/notifications/outbox"
import { requestPasswordRecovery } from "@/lib/password-recovery"
import { alertRefusedAtRequest } from "@/lib/notifications/send-limits"
import { recordLimitHit } from "@/lib/notifications/limit-hits"
import { bumpPlatformCounter } from "@/lib/usage-stats"

export async function POST(req: Request) {
  const rl = await rateLimit(getClientIp(req), "forgot-password", 5, 60 * 60 * 1000)
  if (!rl.ok) {
    return NextResponse.json({ ok: true }) // don't leak rate-limit info on auth routes
  }

  const { email } = await req.json().catch(() => ({}))
  if (typeof email !== "string" || !email.includes("@")) {
    return NextResponse.json({ error: "Email invalide." }, { status: 400 })
  }

  const admin = await prisma.adminUser.findUnique({
    where: { email: normalizeEmail(email) },
    select: { id: true, email: true, name: true, organizationId: true, sessionVersion: true, isActive: true },
  })

  // Always return 200 to avoid user enumeration
  if (!admin || !admin.isActive) {
    return NextResponse.json({ ok: true })
  }

  // The link, the per-recipient cap and the email are decided together (src/lib/password-recovery.ts):
  // a request over the cap leaves the link already received working (#352 for the commit order).
  const outcome = await requestPasswordRecovery(admin)
  if (outcome.status === "queued") deliverAfterResponse(outcome.outboxIds)
  if (outcome.status === "over_cap") {
    // Counted like an email dropped at delivery: the operator's limit page and alert.
    await bumpPlatformCounter("emails_dropped")
    await recordLimitHit({ organizationId: admin.organizationId, limit: "recipient_per_hour", outcome: "refused" })
    await alertRefusedAtRequest(admin.organizationId, "password_reset", admin.email)
  }

  return NextResponse.json({ ok: true })
}
