// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { randomBytes } from "crypto"
import { prisma } from "@/lib/prisma"
import { hashToken } from "@/lib/token-hash"
import { orgTimeZone } from "@/lib/time-zone"
import { siteName } from "@/lib/site"
import { reportError } from "@/lib/report-error"
import { notifyOperator } from "@/lib/operator-alerts"
import { unreachableNote } from "@/lib/admin-reachability"
import { cancelPendingOutboxForOrganization } from "@/lib/notifications/org-send-guard"
import { deliverAfterResponse, enqueueNotifications } from "@/lib/notifications/outbox"
import { assessActiveOrganizations, type InactivityReportRow } from "@/lib/org-inactivity-data"
import { deactivationDate, procedureAction, type InactivityEmailStep } from "@/lib/org-inactivity"

/**
 * The periodic check of inactive organisations with `ORG_INACTIVITY=on` (#811), run by the nightly
 * cleanup: the three « Souhaitez-vous conserver votre espace ? » emails, then the deactivation of
 * a space nobody answered for. Erasure is not enabled. Server only (Prisma).
 */

export type ProcedureCounts = { first: number; second: number; last: number; deactivated: number; stopped: number }

const EMAILS_SENT: Record<InactivityEmailStep, number> = { first: 1, second: 2, last: 3 }

const APP_URL = () => (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/$/, "")

const day = (d: Date, timeZone: string, weekday = false) =>
  d.toLocaleDateString("fr-FR", { timeZone, ...(weekday ? { weekday: "long" as const } : {}), day: "numeric", month: "long", year: "numeric" })

/**
 * One nightly run over every active organisation (`only`: these ones, for tests on a shared
 * database). One organisation's failure never stops the others.
 */
export async function runInactivityProcedure(now: Date = new Date(), only?: string[]): Promise<ProcedureCounts> {
  const counts: ProcedureCounts = { first: 0, second: 0, last: 0, deactivated: 0, stopped: 0 }
  const deactivatedNames: string[] = []
  for (const row of await assessActiveOrganizations(now, only)) {
    const next = procedureAction({ assessment: row.assessment, noticeAt: row.noticeAt, emailsSent: row.emailsSent }, now)
    try {
      if (next.action === "reset") {
        await stopProcedure(row.id)
        counts.stopped++
      } else if (next.action === "email") {
        await sendInactivityEmail(row, next.step, now)
        counts[next.step]++
      } else if (next.action === "deactivate") {
        await deactivateForInactivity(row, now)
        counts.deactivated++
        deactivatedNames.push(row.name)
      }
    } catch (e) {
      reportError("cleanup.inactivity_procedure")(e)
    }
  }
  if (deactivatedNames.length > 0) {
    const base = APP_URL()
    await notifyOperator({
      key: `inactivity-deactivated:${now.toISOString().slice(0, 10)}`,
      title: `${siteName()} : espaces désactivés faute d'activité`,
      message: `${deactivatedNames.length} espace${deactivatedNames.length > 1 ? "s" : ""} désactivé${deactivatedNames.length > 1 ? "s" : ""} sans réponse aux trois messages : ${deactivatedNames.join(", ")}.`,
      priority: 3,
      url: `${base}/super-admin/inactivity`,
    }).catch(reportError("cleanup.inactivity_operator_alert"))
  }
  return counts
}

/** Activity, confirmation, upcoming event, postponement or exclusion: the procedure stops. */
export async function stopProcedure(organizationId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.organization.update({ where: { id: organizationId }, data: { inactivityNoticeAt: null, inactivityEmailsSent: 0 } })
    await tx.orgKeepLink.deleteMany({ where: { organizationId } })
    await tx.orgLog.create({
      data: { organizationId, actorType: "system", action: "organization.inactivity_check_stopped", entityType: "Organization", entityId: organizationId },
    })
  })
}

async function sendInactivityEmail(row: InactivityReportRow, step: InactivityEmailStep, now: Date): Promise<void> {
  const noticeAt = step === "first" ? now : row.noticeAt!
  const deactivationOn = deactivationDate(noticeAt)
  const org = await prisma.organization.findUniqueOrThrow({ where: { id: row.id }, select: { timeZone: true } })
  const timeZone = orgTimeZone(org)
  const admins = await prisma.adminUser.findMany({ where: { organizationId: row.id, isActive: true }, select: { id: true, email: true, name: true } })

  const outboxIds = await prisma.$transaction(async (tx) => {
    await tx.organization.update({ where: { id: row.id }, data: { inactivityNoticeAt: noticeAt, inactivityEmailsSent: EMAILS_SENT[step] } })
    const payloads = []
    for (const admin of admins) {
      // One link per email and administrator: an earlier email's link keeps working.
      const secret = randomBytes(32).toString("hex")
      await tx.orgKeepLink.create({ data: { tokenHash: hashToken(secret), organizationId: row.id, adminUserId: admin.id, expiresAt: deactivationOn } })
      payloads.push({
        kind: "org_inactivity_notice" as const,
        organizationId: row.id,
        recipient: { email: admin.email, name: admin.name },
        dedupeKey: `org_inactivity:${row.id}:${noticeAt.toISOString()}:${step}:${admin.email}`,
        data: {
          step,
          organizationName: row.name,
          lastActivity: row.lastActivityAt ? day(row.lastActivityAt, timeZone) : null,
          deactivationOn: day(deactivationOn, timeZone, true),
          keepUrl: `${APP_URL()}/admin/keep?token=${secret}`,
        },
      })
    }
    // Sent to nobody when no administrator is left: logged all the same, the procedure goes on.
    await tx.orgLog.create({
      data: {
        organizationId: row.id, actorType: "system", action: "organization.inactivity_email_sent", entityType: "Organization", entityId: row.id,
        changes: { step: { from: null, to: step }, recipients: { from: null, to: admins.length } },
      },
    })
    return enqueueNotifications(payloads, tx)
  })
  deliverAfterResponse(outboxIds)

  if (step === "last") {
    await notifyOperator({
      key: `inactivity-last:${row.id}:${noticeAt.toISOString()}`,
      title: `${siteName()} : espace bientôt désactivé`,
      message: `${row.name} sera désactivé le ${day(deactivationOn, timeZone, true)} sans réponse (dernier rappel envoyé à ${admins.length} administrateur${admins.length > 1 ? "s" : ""}).${unreachableNote(row.reachability)}`,
      priority: 3,
      url: `${APP_URL()}/super-admin/organizations/${row.slug}`,
    }).catch(reportError("cleanup.inactivity_operator_alert"))
  }
}

async function deactivateForInactivity(row: InactivityReportRow, now: Date): Promise<void> {
  const timeZone = orgTimeZone(await prisma.organization.findUniqueOrThrow({ where: { id: row.id }, select: { timeZone: true } }))
  const admins = await prisma.adminUser.findMany({ where: { organizationId: row.id, isActive: true }, select: { email: true, name: true } })
  const outboxIds = await prisma.$transaction(async (tx) => {
    // As an operator deactivation (#814): queued emails of the organisation are never sent later.
    await cancelPendingOutboxForOrganization(tx, row.id)
    await tx.organization.update({
      where: { id: row.id },
      data: { active: false, inactivityDeactivatedAt: now, inactivityNoticeAt: null, inactivityEmailsSent: 0 },
    })
    await tx.orgKeepLink.deleteMany({ where: { organizationId: row.id } })
    await tx.orgLog.create({
      data: { organizationId: row.id, actorType: "system", action: "organization.deactivated_for_inactivity", entityType: "Organization", entityId: row.id },
    })
    // Without an organisation: every email of a deactivated one is refused at send time.
    return enqueueNotifications(admins.map((admin) => ({
      kind: "org_inactivity_deactivated" as const,
      organizationId: null,
      recipient: { email: admin.email, name: admin.name },
      dedupeKey: `org_inactivity_deactivated:${row.id}:${now.toISOString().slice(0, 10)}:${admin.email}`,
      data: { organizationName: row.name, deactivatedOn: day(now, timeZone) },
    })), tx)
  })
  deliverAfterResponse(outboxIds)
}
