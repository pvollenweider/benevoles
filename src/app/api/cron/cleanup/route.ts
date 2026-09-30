// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { countsToFreeze } from "@/lib/message-history"
import { daysAgo, RETENTION_DAYS } from "@/lib/retention"
import { NextResponse } from "next/server"
import { recordJobRun } from "@/lib/job-runs"
import { env } from "@/lib/env"
import { prisma } from "@/lib/prisma"
import { encryptLegacyTokens } from "@/lib/token-encryption-job"
import { reportError } from "@/lib/report-error"

export const dynamic = "force-dynamic"

function isAuthorized(req: Request): boolean {
  const expected = env.CRON_SECRET
  if (expected) return req.headers.get("authorization") === `Bearer ${expected}`
  // No secret configured: fail-closed in production, allow localhost in dev.
  if (process.env.NODE_ENV === "production") return false
  const host = req.headers.get("host") ?? ""
  return host.startsWith("localhost") || host.startsWith("127.0.0.1")
}

export async function GET(req: Request) { return run(req) }
export async function POST(req: Request) { return run(req) }

async function run(req: Request) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  return recordJobRun("cleanup", async () => {

  const now = new Date()
  // 30-day retention cutoff. We use updatedAt as a proxy for deactivation
  // time since neither Organization nor AdminUser tracks deactivatedAt.
  // Durations from the retention policy (#486), the single source the docs are checked against.
  const orgCutoff = daysAgo(now, RETENTION_DAYS.deactivatedOrganization)
  const adminCutoff = daysAgo(now, RETENTION_DAYS.deactivatedAdmin)
  const failedCutoff = daysAgo(now, RETENTION_DAYS.failedNotification)

  // --- 1. Inactive organizations ---
  // Cascades to: Event → Shift → Registration, Member, MemberInvite
  // AdminUser.organizationId is set to NULL (SetNull) — handled in step 3.
  const deletedOrgs = await prisma.organization.deleteMany({
    where: { active: false, updatedAt: { lt: orgCutoff } },
  })

  // --- 2. Orphan volunteers ---
  // Registrations were cascade-deleted with their organization's events above.
  // Only delete volunteers with no org link and no remaining registrations —
  // org-scoped volunteers (organizationId set) are roster members and must be kept.
  const deletedVolunteers = await prisma.volunteer.deleteMany({
    where: { organizationId: null, registrations: { none: {} } },
  })

  // --- 3. Deactivated admin users ---
  // Includes admins whose org was just deleted (organizationId = null after SetNull).
  const deletedAdmins = await prisma.adminUser.deleteMany({
    where: { isActive: false, updatedAt: { lt: adminCutoff } },
  })

  // --- 4. Expired password-reset tokens (housekeeping, not GDPR-critical) ---
  // Note: setup tokens (invite links) are deliberately NOT cleared here. Their
  // route already returns a dedicated "lien expiré" message by checking
  // setupTokenExpiresAt itself; clearing the token first would make an expired
  // invite indistinguishable from an already-used one (generic 404 instead of
  // the specific expiry message). The row (and its token) is still removed
  // after 30 days of inactivity by step 3 above.
  const clearedResetTokens = await prisma.adminUser.updateMany({
    where: {
      passwordResetExpiresAt: { lt: now },
      passwordResetTokenHash: { not: null },
    },
    data: { passwordResetTokenHash: null, passwordResetExpiresAt: null },
  })

  // --- 5. Notification outbox (#293) ---
  // Rows hold recipient + template data (PII): delete them once sent, and failed ones after
  // 30 days (kept that long only to investigate why they failed).
  // A targeted message keeps the count of its rows deleted here (#467), in the same transaction,
  // so its delivery summary stays right after the purge.
  const outboxToDelete = { OR: [{ status: "sent" }, { status: "failed", createdAt: { lt: failedCutoff } }] }
  const deletedOutbox = await prisma.$transaction(async (tx) => {
    // Exactly the rows counted are deleted: one that turns « sent » meanwhile waits for tomorrow.
    const linked = await tx.notificationOutbox.findMany({
      where: { AND: [outboxToDelete, { targetedMessageId: { not: null } }] },
      select: { id: true, targetedMessageId: true, status: true },
    })
    for (const [id, c] of countsToFreeze(linked)) {
      await tx.targetedMessage.update({ where: { id }, data: { sentCount: { increment: c.sent }, failedCount: { increment: c.failed } } })
    }
    const linkedDeleted = await tx.notificationOutbox.deleteMany({ where: { id: { in: linked.map((r) => r.id) } } })
    const otherDeleted = await tx.notificationOutbox.deleteMany({ where: { AND: [outboxToDelete, { targetedMessageId: null }] } })
    return { count: linkedDeleted.count + otherDeleted.count }
  })

  // Targeted messages are kept 12 months (#467): their content may hold personal information.
  const deletedMessages = await prisma.targetedMessage.deleteMany({
    where: { createdAt: { lt: daysAgo(now, RETENTION_DAYS.targetedMessage) } },
  })

  // --- 6. Expired rate limit windows (#322) ---
  const deletedRateLimits = await prisma.rateLimit.deleteMany({ where: { resetAt: { lt: now } } })

  // --- 7. Encrypt volunteer-facing tokens still stored in clear (#290) ---
  // No-op until TOKEN_ENCRYPTION_KEY is set; then drains the legacy columns.
  const tokenEncryption = await encryptLegacyTokens().catch((e) => {
    reportError("tokens.encrypt_legacy")(e)
    return null
  })

  return NextResponse.json({
    runAt: now.toISOString(),
    tokenEncryption,
    deleted: {
      notificationOutbox: deletedOutbox.count,
      targetedMessages: deletedMessages.count,
      rateLimits: deletedRateLimits.count,
      organizations: deletedOrgs.count,
      volunteers: deletedVolunteers.count,
      adminUsers: deletedAdmins.count,
    },
    tokensCleaned: {
      passwordReset: clearedResetTokens.count,
    },
  })
  })
}
