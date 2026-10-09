// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { PENDING_ORG_WHERE, abandonedSignupSpaceWhere, pendingSummary } from "@/lib/org-review"
import { notifyOperator } from "@/lib/operator-alerts"
import { countsToFreeze } from "@/lib/message-history"
import { daysAgo, RETENTION_DAYS } from "@/lib/retention"
import { NextResponse } from "next/server"
import { recordJobRun } from "@/lib/job-runs"
import { env } from "@/lib/env"
import { prisma } from "@/lib/prisma"
import { encryptLegacyTokens } from "@/lib/token-encryption-job"
import { reportError } from "@/lib/report-error"
import { loadOrganizationsWithNewAddressesToVerify, loadSummaryRecipients } from "@/lib/delivery-summary-data"
import { SUMMARY_WINDOW_HOURS, summaryDayKey } from "@/lib/delivery-summary"
import { parseNotificationSettings } from "@/lib/notification-settings"
import { adminMembersToVerifyUrl } from "@/lib/notifications/templates/shared"
import { deliverAfterResponse, enqueueNotifications } from "@/lib/notifications/outbox"
import { siteName } from "@/lib/site"
import { pastEventSummary, pastEventTotals } from "@/lib/past-event-retention"
import { observePastEvents } from "@/lib/past-event-retention-data"
import { inactivityMode } from "@/lib/org-inactivity"
import { loadInactivityReport } from "@/lib/org-inactivity-data"

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
  const deliveryOutcomeCutoff = daysAgo(now, RETENTION_DAYS.deliveryOutcome)
  const mergedTombstoneCutoff = daysAgo(now, RETENTION_DAYS.mergedMemberTombstone)

  // --- 1. Inactive organizations ---
  // Cascades to: Event → Shift → Registration, Member, MemberInvite.
  // AdminUser.organizationId is only SET NULL: the organization's admins are deleted with it here,
  // as the super admin's deletion does. Otherwise an active admin outlived the organization (step 3
  // only removes inactive ones), with its email and password hash kept indefinitely.
  const { deletedOrgs, deletedOrgAdmins } = await prisma.$transaction(async (tx) => {
    const orgs = await tx.organization.findMany({
      // A suspended organisation (#810) is kept for the investigation: only the super admin deletes it.
      where: { active: false, suspendedAt: null, updatedAt: { lt: orgCutoff } },
      select: { id: true },
    })
    const orgIds = orgs.map((o) => o.id)
    if (orgIds.length === 0) return { deletedOrgs: { count: 0 }, deletedOrgAdmins: { count: 0 } }
    const admins = await tx.adminUser.findMany({ where: { organizationId: { in: orgIds } }, select: { id: true } })
    const deletedOrgs = await tx.organization.deleteMany({ where: { id: { in: orgIds } } })
    const deletedOrgAdmins = await tx.adminUser.deleteMany({ where: { id: { in: admins.map((a) => a.id) } } })
    return { deletedOrgs, deletedOrgAdmins }
  })

  // --- 1b. Sign-up spaces never activated (#810): the owner never chose a password. Deleted with
  // their inactive account (step 3 would remove the account alone and leave the space pending).
  const deletedAbandonedSpaces = await prisma.$transaction(async (tx) => {
    const orgs = await tx.organization.findMany({ where: abandonedSignupSpaceWhere(adminCutoff), select: { id: true } })
    const orgIds = orgs.map((o) => o.id)
    if (orgIds.length === 0) return { count: 0 }
    await tx.adminUser.deleteMany({ where: { organizationId: { in: orgIds }, isActive: false } })
    return tx.organization.deleteMany({ where: { id: { in: orgIds } } })
  })

  // --- 2. Orphan volunteers ---
  // Registrations were cascade-deleted with their organization's events above.
  // Only delete volunteers with no org link and no remaining registrations —
  // org-scoped volunteers (organizationId set) are roster members and must be kept.
  const deletedVolunteers = await prisma.volunteer.deleteMany({
    where: { organizationId: null, registrations: { none: {} } },
  })

  // --- 2b. Merged member tombstones (#600): the absorbed record of a merge, past its retention
  // window. Deleting it cascade-deletes whatever DeliveryOutcome rows the merge deliberately left
  // behind (the ones that didn't match the kept member's address hash).
  const deletedMergedTombstones = await prisma.volunteer.deleteMany({
    where: { mergedIntoId: { not: null }, mergedAt: { lt: mergedTombstoneCutoff } },
  })

  // --- 3. Admin invitations never accepted (isActive stays false until then), and org accounts
  // left without an organization by a cleanup that predates step 1 deleting them.
  const deletedAdmins = await prisma.adminUser.deleteMany({
    where: {
      OR: [
        { isActive: false, updatedAt: { lt: adminCutoff } },
        { organizationId: null, role: { not: "super_admin" } },
      ],
    },
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
  const outboxToDelete = { OR: [{ status: "sent" }, { status: { in: ["failed", "cancelled"] }, createdAt: { lt: failedCutoff } }] }
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

  // --- 6b. Delivery outcomes older than their retention window (#598) ---
  const deletedDeliveryOutcomes = await prisma.deliveryOutcome.deleteMany({
    where: { createdAt: { lt: deliveryOutcomeCutoff } },
  })

  // --- 6c. Anonymous video feedback (#646): answers older than their retention window ---
  // `answeredOn` is a day; a row is kept until the whole retention window has passed.
  const deletedVideoFeedback = await prisma.videoFeedback.deleteMany({
    where: { answeredOn: { lt: daysAgo(now, RETENTION_DAYS.videoFeedback) } },
  })

  // --- 6d. Self-service sign-up requests (#810): confirmed or not, gone after their window ---
  const deletedSignupRequests = await prisma.signupRequest.deleteMany({
    where: { createdAt: { lt: daysAgo(now, RETENTION_DAYS.signupRequest) } },
  })

  // --- 6d ter. The operator's log (#810), past its retention window.
  const deletedOperatorLogs = await prisma.operatorLog.deleteMany({ where: { createdAt: { lt: daysAgo(now, RETENTION_DAYS.operatorLog) } } })

  // --- 6d bis. Expired entries of the sign-up block list (#810, part 5): IP entries always expire.
  const deletedSignupBlocks = await prisma.signupBlock.deleteMany({ where: { expiresAt: { lt: now } } })

  // --- 6e. Daily summary of the spaces awaiting validation (#810): one operator alert a day, not one
  // per request; the alert's key carries the date, so a second run the same day sends nothing.
  const pending = await prisma.organization.findMany({ where: PENDING_ORG_WHERE, select: { createdAt: true } })
  const summary = pendingSummary(pending.map((o) => o.createdAt), now)
  if (summary) {
    const base = (process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/+$/, "")
    await notifyOperator({ key: `pending-summary:${now.toISOString().slice(0, 10)}`, title: `${siteName()} : espaces en attente`, message: summary, priority: 3, url: base ? `${base}/super-admin/organizations` : undefined })
      .catch(reportError("cleanup.pending_summary"))
  }

  // --- 7. Encrypt volunteer-facing tokens still stored in clear (#290) ---
  // No-op until TOKEN_ENCRYPTION_KEY is set; then drains the legacy columns.
  const tokenEncryption = await encryptLegacyTokens().catch((e) => {
    reportError("tokens.encrypt_legacy")(e)
    return null
  })

  // --- 8. Daily summary of addresses to verify (#599) ---
  // Only organizations with at least one member whose CURRENT address is still "to verify"
  // because of an important kind (confirmation, waitlist offer, reminder) that failed
  // permanently since the previous run; idempotent through the outbox's own dedupeKey (one
  // summary per organization per admin per day), never through a separate "already sent" table.
  const summarySince = new Date(now.getTime() - SUMMARY_WINDOW_HOURS * 60 * 60 * 1000)
  const addressSummaries = await loadOrganizationsWithNewAddressesToVerify(summarySince, now)
  let addressSummariesSent = 0
  for (const summary of addressSummaries) {
    const org = await prisma.organization.findUnique({ where: { id: summary.organizationId }, select: { notificationSettings: true } })
    if (!parseNotificationSettings(org?.notificationSettings).addressesToVerifyAdminEmail) continue
    const recipients = await loadSummaryRecipients(summary.organizationId)
    if (recipients.length === 0) continue
    const dayKey = summaryDayKey(now)
    const ids = await enqueueNotifications(
      recipients.map((r) => ({
        kind: "addresses_to_verify_summary",
        recipient: { email: r.email, name: r.name },
        organizationId: summary.organizationId,
        dedupeKey: `addresses_to_verify_summary:${summary.organizationId}:${dayKey}:${r.email}`,
        data: {
          count: summary.members.length,
          members: summary.members.map((m) => ({ name: m.name })),
          membersUrl: adminMembersToVerifyUrl(),
        },
      })),
    )
    addressSummariesSent += ids.length
    deliverAfterResponse(ids)
  }

  // --- 8 bis. Periodic check of inactive organisations (#811), report mode: who it would write to.
  let inactivity: Record<string, number> | null = null
  if (inactivityMode() !== "off") {
    try {
      const rows = await loadInactivityReport(now)
      inactivity = { soon: rows.filter((r) => r.assessment.state === "active").length }
      for (const r of rows) if (r.assessment.state === "due") inactivity[r.assessment.step] = (inactivity[r.assessment.step] ?? 0) + 1
    } catch (e) {
      reportError("cleanup.inactivity_report")(e)
    }
  }

  // --- 9. Past events (#813), observation mode: what the 3-year rule would anonymise, nothing changed.
  let pastEvents: ReturnType<typeof pastEventTotals> | null = null
  try {
    pastEvents = pastEventTotals(await observePastEvents(now))
  } catch (e) {
    reportError("cleanup.past_events_observation")(e)
  }

  return NextResponse.json({
    runAt: now.toISOString(),
    observed: { inactivity, pastEvents, pastEventsSummary: pastEvents ? pastEventSummary(pastEvents) : null },
    tokenEncryption,
    deleted: {
      notificationOutbox: deletedOutbox.count,
      targetedMessages: deletedMessages.count,
      rateLimits: deletedRateLimits.count,
      deliveryOutcomes: deletedDeliveryOutcomes.count,
      videoFeedback: deletedVideoFeedback.count,
      signupRequests: deletedSignupRequests.count,
      signupBlocks: deletedSignupBlocks.count,
      operatorLogs: deletedOperatorLogs.count,
      organizations: deletedOrgs.count,
      abandonedSignupSpaces: deletedAbandonedSpaces.count,
      volunteers: deletedVolunteers.count,
      mergedMemberTombstones: deletedMergedTombstones.count,
      adminUsers: deletedOrgAdmins.count + deletedAdmins.count,
    },
    tokensCleaned: {
      passwordReset: clearedResetTokens.count,
    },
    addressSummariesSent,
  })
  })
}
