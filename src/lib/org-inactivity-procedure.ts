// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { randomBytes } from "crypto"
import { prisma } from "@/lib/prisma"
import type { Prisma } from "@/generated/prisma/client"
import { hashToken } from "@/lib/token-hash"
import { orgTimeZone } from "@/lib/time-zone"
import { siteName } from "@/lib/site"
import { env } from "@/lib/env"
import { reportError } from "@/lib/report-error"
import { notifyOperator } from "@/lib/operator-alerts"
import { unreachableNote } from "@/lib/admin-reachability"
import { addressHash } from "@/lib/notifications/smtp-outcome"
import { cancelPendingOutboxForOrganization } from "@/lib/notifications/org-send-guard"
import { deliverAfterResponse, enqueueNotifications } from "@/lib/notifications/outbox"
import { assessActiveOrganizations } from "@/lib/org-inactivity-data"
import { assessInactivity } from "@/lib/org-inactivity"
import { clearProcedure } from "@/lib/org-inactivity-clear"
import {
  BLOCK_REASONS, decideProcedure, deadlineDay, STEP_LABELS, STEP_ORDER,
  type ProcedureDecision, type ProcedureInput, type StepKey, type StepRow,
} from "@/lib/org-inactivity-steps"

/**
 * The periodic check of inactive organisations with `ORG_INACTIVITY=on` (#811, #1114), run by the
 * nightly cleanup: the three « Souhaitez-vous conserver votre espace ? » messages, each confirmed
 * before the next (src/lib/org-inactivity-steps.ts), then the deactivation of a space nobody
 * answered for. Erasure is not enabled. Server only (Prisma).
 */

export type ProcedureCounts = { first: number; second: number; last: number; deactivated: number; stopped: number; blocked: number }

type Tx = Prisma.TransactionClient

const APP_URL = () => (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/$/, "")

const day = (d: Date, timeZone: string, weekday = false) =>
  d.toLocaleDateString("fr-FR", { timeZone, ...(weekday ? { weekday: "long" as const } : {}), day: "numeric", month: "long", year: "numeric" })

const STEP_SELECT = { id: true, step: true, queuedAt: true, confirmedAt: true, recipients: true, recipientHashes: true, plannedAt: true } as const

type StoredStep = { id: string; step: string; queuedAt: Date; confirmedAt: Date | null; recipients: number; recipientHashes: string[]; plannedAt: Date }

const asStepRow = (s: StoredStep): StepRow => ({ step: s.step as StepKey, queuedAt: s.queuedAt, confirmedAt: s.confirmedAt, recipients: s.recipients, plannedAt: s.plannedAt })

/** The current step: the latest queued one in order. */
function currentStep(steps: StoredStep[]): StoredStep | null {
  for (const key of [...STEP_ORDER].reverse()) {
    const s = steps.find((x) => x.step === key)
    if (s) return s
  }
  return null
}

/**
 * Everything the decision needs for one organisation, read with `db` (inside the deactivation's
 * transaction: after the organisation row is locked). Null for an organisation gone, deactivated
 * or suspended.
 */
async function loadProcedureFacts(db: Tx, organizationId: string, now: Date) {
  const startOfToday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  const o = await db.organization.findUnique({
    where: { id: organizationId },
    select: {
      id: true, name: true, slug: true, active: true, suspendedAt: true, createdAt: true, timeZone: true,
      lastMeaningfulActivityAt: true, lastRetentionConfirmedAt: true, inactivityPostponedUntil: true, inactivityExempt: true,
      inactivityNoticeAt: true, inactivityPlannedAt: true, inactivityBlockedAt: true,
      inactivitySteps: { select: STEP_SELECT },
    },
  })
  if (!o || !o.active || o.suspendedAt) return null
  const [upcoming, used] = await Promise.all([
    db.event.count({ where: { organizationId, endDate: { gte: startOfToday } } }),
    db.event.count({ where: { organizationId, OR: [{ publicStatus: { in: ["published", "archived"] } }, { registrations: { some: {} } }] } }),
  ])
  const assessment = assessInactivity({
    lastActivityAt: o.lastMeaningfulActivityAt,
    lastRetentionConfirmedAt: o.lastRetentionConfirmedAt,
    hasUpcomingEvent: upcoming > 0,
    everUsed: used > 0,
    suspended: false,
    active: true,
    postponedUntil: o.inactivityPostponedUntil,
    exempt: o.inactivityExempt,
  }, now, o.createdAt)
  const current = currentStep(o.inactivitySteps)
  const waiting = current && !current.confirmedAt
    ? await db.notificationOutbox.count({ where: { inactivityStepId: current.id, status: { in: ["pending", "sending"] } } })
    : 0
  const timeZone = orgTimeZone(o)
  const input: ProcedureInput = {
    due: assessment.state === "due",
    noticeAt: o.inactivityNoticeAt,
    steps: o.inactivitySteps.map(asStepRow),
    waiting,
    plannedAt: o.inactivityPlannedAt,
    timeZone,
  }
  return { org: o, steps: o.inactivitySteps, current, input, timeZone, lastActivityAt: o.lastMeaningfulActivityAt }
}

type Facts = NonNullable<Awaited<ReturnType<typeof loadProcedureFacts>>>

/**
 * One nightly run over every active organisation (`only`: these ones, for tests on a shared
 * database). One organisation's failure never stops the others.
 */
export async function runInactivityProcedure(now: Date = new Date(), only?: string[]): Promise<ProcedureCounts> {
  const counts: ProcedureCounts = { first: 0, second: 0, last: 0, deactivated: 0, stopped: 0, blocked: 0 }
  const deactivatedNames: string[] = []
  for (const row of await assessActiveOrganizations(now, only)) {
    // Nothing to decide for a space neither due nor under way.
    if (row.assessment.state !== "due" && row.noticeAt === null && row.stepCount === 0) continue
    try {
      // Copies of the current step for administrators added (or whose address changed) since.
      await topUpCurrentStep(row.id, now)
      const facts = await loadProcedureFacts(prisma, row.id, now)
      if (!facts) continue
      const decision = decideProcedure(facts.input, now)
      if (decision.action === "reset") {
        await stopProcedure(row.id)
        counts.stopped++
      } else if (decision.action === "queue") {
        await queueStep(facts, decision.step, decision.plannedAt, now, row.reachability)
        counts[decision.step]++
      } else if (decision.action === "deactivate") {
        if (await deactivateForInactivity(row.id, now)) {
          counts.deactivated++
          deactivatedNames.push(row.name)
        }
      } else if (decision.action === "blocked") {
        await markBlocked(facts, decision, now)
        counts.blocked++
      } else if (decision.action === "wait") {
        await keepPlanned(facts, decision.plannedAt)
        if (facts.org.inactivityBlockedAt) await prisma.organization.update({ where: { id: row.id }, data: { inactivityBlockedAt: null } })
      }
    } catch (e) {
      reportError("cleanup.inactivity_procedure")(e)
    }
  }
  if (deactivatedNames.length > 0) {
    await notifyOperator({
      key: `inactivity-deactivated:${now.toISOString().slice(0, 10)}`,
      title: `${siteName()} : espaces désactivés faute d'activité`,
      message: `${deactivatedNames.length} espace${deactivatedNames.length > 1 ? "s" : ""} désactivé${deactivatedNames.length > 1 ? "s" : ""} sans réponse aux trois messages envoyés : ${deactivatedNames.join(", ")}.`,
      priority: 3,
      url: `${APP_URL()}/super-admin/inactivity`,
    }).catch(reportError("cleanup.inactivity_operator_alert"))
  }
  return counts
}

/** Activity, confirmation, upcoming event, postponement or exclusion: the procedure stops. */
export async function stopProcedure(organizationId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await clearProcedure(tx, organizationId)
    await tx.orgLog.create({
      data: { organizationId, actorType: "system", action: "organization.inactivity_check_stopped", entityType: "Organization", entityId: organizationId },
    })
  })
}

/** The planned date stored, and every keep link of the procedure valid until then. Only later. */
async function keepPlanned(facts: Facts, plannedAt: Date | null, db: Tx = prisma): Promise<void> {
  if (!plannedAt) return
  const stored = facts.org.inactivityPlannedAt
  if (stored && stored.getTime() >= plannedAt.getTime()) return
  await db.organization.update({ where: { id: facts.org.id }, data: { inactivityPlannedAt: plannedAt } })
  await db.orgKeepLink.updateMany({ where: { organizationId: facts.org.id, expiresAt: { lt: plannedAt } }, data: { expiresAt: plannedAt } })
}

type Admin = { id: string; email: string; name: string }

/** One copy of `step` per administrator: a keep link each, valid until the planned date. */
async function queueCopies(
  tx: Tx,
  o: { id: string; name: string },
  step: { id: string; step: StepKey },
  admins: Admin[],
  data: { lastActivity: string | null; deactivationOn: string; previousSentOn: string | null; previousDeactivationOn: string | null },
  plannedAt: Date,
): Promise<string[]> {
  const payloads = []
  for (const admin of admins) {
    // One link per email and administrator: an earlier email's link keeps working.
    const secret = randomBytes(32).toString("hex")
    await tx.orgKeepLink.create({ data: { tokenHash: hashToken(secret), organizationId: o.id, adminUserId: admin.id, expiresAt: plannedAt } })
    payloads.push({
      kind: "org_inactivity_notice" as const,
      organizationId: o.id,
      recipient: { email: admin.email, name: admin.name },
      dedupeKey: `org_inactivity:${step.id}:${admin.email.trim().toLowerCase()}`,
      data: { step: step.step, organizationName: o.name, ...data, keepUrl: `${APP_URL()}/admin/keep?token=${secret}` },
    })
  }
  return enqueueNotifications(payloads, tx, { inactivityStepId: step.id })
}

const adminsOf = (db: Tx, organizationId: string): Promise<Admin[]> =>
  db.adminUser.findMany({ where: { organizationId, isActive: true }, select: { id: true, email: true, name: true } })
    .then((all) => all.filter((a) => a.email.trim() !== ""))

const hashOf = (email: string) => addressHash(email, env.AUTH_SECRET)

async function queueStep(facts: Facts, key: StepKey, plannedAt: Date, now: Date, reachability: Parameters<typeof unreachableNote>[0]): Promise<void> {
  const o = facts.org
  const timeZone = facts.timeZone
  const previous = facts.current
  const admins = await adminsOf(prisma, o.id)
  const previousPlanned = previous?.plannedAt ?? null
  const changed = previousPlanned !== null && day(deadlineDay(previousPlanned), timeZone) !== day(deadlineDay(plannedAt), timeZone)
  const data = {
    lastActivity: facts.lastActivityAt ? day(facts.lastActivityAt, timeZone) : null,
    deactivationOn: day(deadlineDay(plannedAt), timeZone, true),
    previousSentOn: previous?.confirmedAt ? day(previous.confirmedAt, timeZone) : null,
    previousDeactivationOn: changed && previousPlanned ? day(deadlineDay(previousPlanned), timeZone, true) : null,
  }

  const outboxIds = await prisma.$transaction(async (tx) => {
    // Once per organisation and step (unique): a second run at the same time fails here.
    const step = await tx.orgInactivityStep.create({
      data: { organizationId: o.id, step: key, queuedAt: now, plannedAt, recipients: admins.length, recipientHashes: admins.map((a) => hashOf(a.email)) },
      select: { id: true },
    })
    await tx.organization.update({
      where: { id: o.id },
      data: { ...(key === "first" ? { inactivityNoticeAt: now } : {}), inactivityEmailsSent: STEP_ORDER.indexOf(key) + 1, inactivityBlockedAt: null },
    })
    await keepPlanned(facts, plannedAt, tx)
    const ids = await queueCopies(tx, o, { id: step.id, step: key }, admins, data, plannedAt)
    // Queued, not sent: the step is confirmed when the relay accepts a first copy.
    await tx.orgLog.create({
      data: {
        organizationId: o.id, actorType: "system", action: "organization.inactivity_email_queued", entityType: "Organization", entityId: o.id,
        changes: { step: { from: null, to: key }, recipients: { from: null, to: admins.length } },
      },
    })
    return ids
  })
  deliverAfterResponse(outboxIds)

  if (key === "last") {
    await notifyOperator({
      key: `inactivity-last:${o.id}:${now.toISOString().slice(0, 10)}`,
      title: `${siteName()} : espace bientôt désactivé`,
      message: `${o.name} : dernier rappel mis en file d'attente pour ${admins.length} administrateur${admins.length > 1 ? "s" : ""}. Sans réponse, désactivation au plus tôt après le ${day(deadlineDay(plannedAt), timeZone, true)}, et seulement 15 jours après l'envoi effectif de ce rappel.${unreachableNote(reachability)}`,
      priority: 3,
      url: `${APP_URL()}/super-admin/organizations/${o.slug}`,
    }).catch(reportError("cleanup.inactivity_operator_alert"))
  }
}

/**
 * The current step, not confirmed yet, for administrators who did not get it: added since, or
 * whose address changed (the old address's copy is cancelled at send time). Once per address.
 */
async function topUpCurrentStep(organizationId: string, now: Date): Promise<void> {
  const facts = await loadProcedureFacts(prisma, organizationId, now)
  if (!facts?.current || facts.current.confirmedAt || !facts.input.due) return
  const current = facts.current
  const missing = (await adminsOf(prisma, organizationId)).filter((a) => !current.recipientHashes.includes(hashOf(a.email)))
  if (missing.length === 0) return
  const timeZone = facts.timeZone
  const ordered = STEP_ORDER.indexOf(current.step as StepKey)
  const previous = ordered > 0 ? facts.steps.find((s) => s.step === STEP_ORDER[ordered - 1]) ?? null : null
  const plannedAt = later(facts.org.inactivityPlannedAt, current.plannedAt)
  const ids = await prisma.$transaction(async (tx) => {
    const { count } = await tx.orgInactivityStep.updateMany({
      where: { id: current.id, confirmedAt: null, recipients: current.recipients },
      data: { recipients: { increment: missing.length }, recipientHashes: { push: missing.map((a) => hashOf(a.email)) } },
    })
    if (count === 0) return [] // changed meanwhile: the next night looks again
    const queued = await queueCopies(tx, facts.org, { id: current.id, step: current.step as StepKey }, missing, {
      lastActivity: facts.lastActivityAt ? day(facts.lastActivityAt, timeZone) : null,
      deactivationOn: day(deadlineDay(plannedAt), timeZone, true),
      previousSentOn: previous?.confirmedAt ? day(previous.confirmedAt, timeZone) : null,
      previousDeactivationOn: null,
    }, plannedAt)
    await tx.orgLog.create({
      data: {
        organizationId, actorType: "system", action: "organization.inactivity_email_queued", entityType: "Organization", entityId: organizationId,
        changes: { step: { from: null, to: current.step }, recipients: { from: current.recipients, to: current.recipients + missing.length } },
      },
    })
    return queued
  })
  deliverAfterResponse(ids)
}

const later = (a: Date | null, b: Date): Date => (a && a.getTime() > b.getTime() ? a : b)

/** Blocked: nothing automatic any more; the operator is alerted once, until it is unblocked. */
async function markBlocked(facts: Facts, decision: Extract<ProcedureDecision, { action: "blocked" }>, now: Date): Promise<void> {
  await keepPlanned(facts, decision.plannedAt)
  const { count } = await prisma.organization.updateMany({ where: { id: facts.org.id, inactivityBlockedAt: null }, data: { inactivityBlockedAt: now } })
  if (count === 0) return
  await prisma.orgLog.create({
    data: {
      organizationId: facts.org.id, actorType: "system", action: "organization.inactivity_check_blocked", entityType: "Organization", entityId: facts.org.id,
      changes: { reason: { from: null, to: decision.reason }, step: { from: null, to: decision.step } },
    },
  })
  const step = decision.step ? `${STEP_LABELS[decision.step]} : ` : ""
  await notifyOperator({
    key: `inactivity-blocked:${facts.org.id}:${now.toISOString()}`,
    title: `${siteName()} : vérification d'inactivité bloquée`,
    message: `${facts.org.name} : ${step}${BLOCK_REASONS[decision.reason]}. Pas de désactivation tant que c'est le cas : à traiter depuis la page de l'organisation.`,
    priority: 3,
    url: `${APP_URL()}/super-admin/organizations/${facts.org.slug}`,
  }).catch(reportError("cleanup.inactivity_operator_alert"))
}

/**
 * The deactivation, decided again inside its transaction once the organisation row is locked: an
 * activity, an answer, an upcoming event, an exclusion or a postponement recorded since the
 * nightly read, or a step not confirmed after all, and nothing happens. False then.
 */
async function deactivateForInactivity(organizationId: string, now: Date): Promise<boolean> {
  const result = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Organization" WHERE id = ${organizationId} FOR UPDATE`
    const facts = await loadProcedureFacts(tx, organizationId, now)
    if (!facts || decideProcedure(facts.input, now).action !== "deactivate") return null
    const admins = await adminsOf(tx, organizationId)
    // As an operator deactivation (#814): queued emails of the organisation are never sent later.
    await cancelPendingOutboxForOrganization(tx, organizationId)
    await clearProcedure(tx, organizationId)
    await tx.organization.update({ where: { id: organizationId }, data: { active: false, inactivityDeactivatedAt: now } })
    await tx.orgLog.create({
      data: { organizationId, actorType: "system", action: "organization.deactivated_for_inactivity", entityType: "Organization", entityId: organizationId },
    })
    // Without an organisation: every email of a deactivated one is refused at send time.
    return enqueueNotifications(admins.map((admin) => ({
      kind: "org_inactivity_deactivated" as const,
      organizationId: null,
      recipient: { email: admin.email, name: admin.name },
      dedupeKey: `org_inactivity_deactivated:${organizationId}:${now.toISOString().slice(0, 10)}:${admin.email}`,
      data: { organizationName: facts.org.name, deactivatedOn: day(now, facts.timeZone) },
    })), tx)
  })
  if (result === null) return false
  deliverAfterResponse(result)
  return true
}
