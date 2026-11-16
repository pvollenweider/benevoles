// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import type { Prisma } from "@/generated/prisma/client"
import { prisma } from "@/lib/prisma"
import { isHostedService } from "@/lib/site"
import { APP_TIME_ZONE } from "@/lib/time-zone"
import { OWNER_ROLE } from "@/lib/permissions"
import { blockApplies, signupKeys } from "@/lib/signup-blocklist"
import { approveOrganization } from "@/lib/org-approval-server"
import { logOperator, organizationTarget } from "@/lib/operator-log"
import { notifyOperator } from "@/lib/operator-alerts"
import { reportError } from "@/lib/report-error"
import {
  AUTO_APPROVAL_DAILY_CEILING,
  AUTO_APPROVAL_SETTING_KEY,
  AUTO_APPROVAL_TARGET,
  EMPTY_AUTO_APPROVAL,
  autoApprovalActivationCutoff,
  autoApprovalBudgetDay,
  autoApprovalCandidateProblem,
  autoApprovalDayLabel,
  autoApprovalMomentLabel,
  autoApprovalRemainingBudget,
  autoApprovalSignupOwner,
  autoApprovalState,
  autoApprovalView,
  parseAutoApprovalValue,
  type AutoApprovalValue,
  type AutoApprovalView,
} from "@/lib/auto-approval"

/**
 * Server side of « Validation automatique des nouveaux espaces » (#1371): the setting row, the
 * routes' writes and the scheduled step. The rules are pure in `src/lib/auto-approval.ts`; this
 * module only reads and writes them, under the setting row's lock for every decision.
 *
 * Server only (Prisma).
 */

type Actor = { id?: string | null; name?: string | null; email?: string | null } | null | undefined

function jsonValue(value: AutoApprovalValue): Prisma.InputJsonValue {
  return value as unknown as Prisma.InputJsonValue
}

function appUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").trim().replace(/\/+$/, "")
}

/** The stored value, or the empty default. */
export async function readAutoApprovalValue(db: Pick<typeof prisma, "platformSetting"> = prisma): Promise<AutoApprovalValue> {
  const row = await db.platformSetting.findUnique({ where: { key: AUTO_APPROVAL_SETTING_KEY }, select: { value: true } })
  return parseAutoApprovalValue(row?.value)
}

/** What the super admin section and the routes return. */
export async function readAutoApprovalView(now: Date = new Date()): Promise<AutoApprovalView> {
  return autoApprovalView(await readAutoApprovalValue(), now)
}

/**
 * The row lock every decision takes before re-reading: a cut-off, an expiry, a deactivation or an
 * approval all see the same state, and the daily budget is never spent twice.
 */
async function lockSetting(tx: Prisma.TransactionClient): Promise<AutoApprovalValue | null> {
  const rows = await tx.$queryRaw<{ value: unknown }[]>`SELECT "value" FROM "PlatformSetting" WHERE "key" = ${AUTO_APPROVAL_SETTING_KEY} FOR UPDATE`
  if (rows.length === 0) return null
  return parseAutoApprovalValue(rows[0].value)
}

/**
 * Turns the option on, or changes its end day. Turning it on from off, expired or cut off starts a
 * new session: new activation instant and author, counters reset, cut-off notice cleared. Changing
 * the day of a running session keeps its counters; a new UTC day has already reset the daily one.
 */
export async function setAutoApprovalUntil(until: string, actor: Actor, now: Date = new Date()): Promise<AutoApprovalView> {
  const saved = await prisma.$transaction(async (tx) => {
    const current = await lockSetting(tx)
    const state = autoApprovalState(current, now)
    const running = state === "on" && current !== null
    const today = autoApprovalBudgetDay(now)
    const next: AutoApprovalValue = running
      ? {
          ...current!,
          until,
          budgetDate: today,
          budgetUsed: current!.budgetDate === today ? current!.budgetUsed : 0,
        }
      : {
          ...EMPTY_AUTO_APPROVAL,
          until,
          activatedAt: now.toISOString(),
          activatedById: actor?.id ?? null,
          activatedByLabel: actor?.name?.trim() || actor?.email?.trim() || null,
          budgetDate: today,
        }
    await tx.platformSetting.upsert({
      where: { key: AUTO_APPROVAL_SETTING_KEY },
      create: { key: AUTO_APPROVAL_SETTING_KEY, value: jsonValue(next), updatedById: actor?.id ?? null },
      update: { value: jsonValue(next), updatedById: actor?.id ?? null },
    })
    await logOperator(tx, {
      action: running ? "auto_approval.until_changed" : "auto_approval.activated",
      actor,
      entityType: "Platform",
      entityId: AUTO_APPROVAL_SETTING_KEY,
      target: AUTO_APPROVAL_TARGET,
      detail: running
        ? `Nouvelle date de fin : jusqu'au ${autoApprovalDayLabel(until)} inclus.`
        : `Jusqu'au ${autoApprovalDayLabel(until)} inclus.`,
    })
    return next
  })
  return autoApprovalView(saved, now)
}

/** Turns the option off now. The cut-off notice, if any, stays until dismissed. */
export async function disableAutoApproval(actor: Actor, now: Date = new Date()): Promise<AutoApprovalView> {
  const saved = await prisma.$transaction(async (tx) => {
    const current = await lockSetting(tx)
    if (!current || !current.until) return current ?? EMPTY_AUTO_APPROVAL
    const previousDay = current.until
    const next = { ...current, until: null }
    await tx.platformSetting.update({ where: { key: AUTO_APPROVAL_SETTING_KEY }, data: { value: jsonValue(next) } })
    await logOperator(tx, {
      action: "auto_approval.deactivated",
      actor,
      entityType: "Platform",
      entityId: AUTO_APPROVAL_SETTING_KEY,
      target: AUTO_APPROVAL_TARGET,
      detail: `Désactivée avant le ${autoApprovalDayLabel(previousDay)} inclus.`,
    })
    return next
  })
  return autoApprovalView(saved, now)
}

/** « Masquer cet avis »: the cut-off notice is acknowledged, the option stays cut off. */
export async function dismissAutoApprovalNotice(now: Date = new Date()): Promise<AutoApprovalView> {
  const saved = await prisma.$transaction(async (tx) => {
    const current = await lockSetting(tx)
    if (!current || !current.cutOffAt || current.cutOffSeenAt) return current ?? EMPTY_AUTO_APPROVAL
    const next = { ...current, cutOffSeenAt: now.toISOString() }
    await tx.platformSetting.update({ where: { key: AUTO_APPROVAL_SETTING_KEY }, data: { value: jsonValue(next) } })
    return next
  })
  return autoApprovalView(saved, now)
}

export type ReviewResult = { ok: true; reviewedAt: string } | { ok: false; status: number; error: string }

/** Marks an automatically validated space as reread: the « à relire » mark disappears, the trace stays. */
export async function markAutoApprovalReviewed(
  organizationId: string,
  actor: Actor,
  now: Date = new Date(),
): Promise<ReviewResult> {
  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { id: true, name: true, slug: true, autoApprovedAt: true, autoApprovalReviewedAt: true },
  })
  if (!org) return { ok: false, status: 404, error: "Organisation non trouvée" }
  if (!org.autoApprovedAt) return { ok: false, status: 409, error: "Cet espace n'a pas été validé automatiquement." }

  const reviewed = await prisma.$transaction(async (tx) => {
    const { count } = await tx.organization.updateMany({
      where: { id: organizationId, autoApprovedAt: { not: null }, autoApprovalReviewedAt: null },
      data: { autoApprovalReviewedAt: now },
    })
    if (count === 0) return false
    await logOperator(tx, {
      action: "auto_approval.reviewed",
      actor,
      entityType: "Organization",
      entityId: organizationId,
      target: organizationTarget(org),
    })
    return true
  })
  if (!reviewed) return { ok: false, status: 409, error: "Cet espace a déjà été marqué comme relu." }
  return { ok: true, reviewedAt: now.toISOString() }
}

/** The counts the outbox job's summary carries: numbers only, never a space's name. */
export type AutoApprovalCounts = {
  candidates: number
  approved: number
  skipped: number
  failed: number
  cutOff: number
  expired: number
}

const NO_COUNTS: AutoApprovalCounts = { candidates: 0, approved: 0, skipped: 0, failed: 0, cutOff: 0, expired: 0 }

/** Writes the one « expirée » entry, under the lock; true only for the run that wrote it. */
async function expireIfNeeded(now: Date): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    const current = await lockSetting(tx)
    if (!current || autoApprovalState(current, now) !== "expired" || current.expiredAt) return false
    await tx.platformSetting.update({
      where: { key: AUTO_APPROVAL_SETTING_KEY },
      data: { value: jsonValue({ ...current, expiredAt: now.toISOString() }) },
    })
    await logOperator(tx, {
      action: "auto_approval.expired",
      actor: null,
      entityType: "Platform",
      entityId: AUTO_APPROVAL_SETTING_KEY,
      target: AUTO_APPROVAL_TARGET,
      detail: `Expirée le ${autoApprovalDayLabel(current.until!)}.`,
      source: "automatic",
    })
    return true
  })
}

/** The cut-off entry and flag, for a budget already used up without a recorded cut-off. */
async function recordCutOff(now: Date): Promise<number> {
  const cut = await prisma.$transaction(async (tx) => {
    const current = await lockSetting(tx)
    if (!current || autoApprovalState(current, now) !== "on") return false
    if (autoApprovalRemainingBudget(current, now) > 0 || current.cutOffAt) return false
    await tx.platformSetting.update({
      where: { key: AUTO_APPROVAL_SETTING_KEY },
      data: { value: jsonValue({ ...current, cutOffAt: now.toISOString(), cutOffSeenAt: null, cutOffAlertedAt: null }) },
    })
    await logOperator(tx, {
      action: "auto_approval.cut_off",
      actor: null,
      entityType: "Platform",
      entityId: AUTO_APPROVAL_SETTING_KEY,
      target: AUTO_APPROVAL_TARGET,
      detail: `Plafond de ${AUTO_APPROVAL_DAILY_CEILING} validations atteint le ${autoApprovalMomentLabel(now.toISOString(), APP_TIME_ZONE)}.`,
      source: "automatic",
    })
    return true
  })
  return cut ? 1 : 0
}

/**
 * Raises the one alert of the cut-off day. `cutOffAlertedAt` is the job's own marker; the alert
 * mechanism also deduplicates per day (`auto-approval-cut-off:<UTC day>`), so a retry after a
 * failed marker write cannot send it twice.
 */
async function maybeAlertCutOff(now: Date): Promise<void> {
  const current = await readAutoApprovalValue()
  if (autoApprovalState(current, now) !== "cut_off" || !current.cutOffAt || current.cutOffAlertedAt) return
  if (autoApprovalBudgetDay(new Date(current.cutOffAt)) !== autoApprovalBudgetDay(now)) return

  const day = autoApprovalBudgetDay(new Date(current.cutOffAt))
  await notifyOperator({
    key: `auto-approval-cut-off:${day}`,
    title: "Validation automatique coupée",
    message: `Le plafond de ${AUTO_APPROVAL_DAILY_CEILING} validations automatiques a été atteint le ${autoApprovalMomentLabel(current.cutOffAt, APP_TIME_ZONE)}. L'option est coupée ; les espaces en attente restent à valider à la main.`,
    priority: 4,
    url: `${appUrl()}/super-admin/blocklist#validation-automatique`,
  })

  await prisma.$transaction(async (tx) => {
    const latest = await lockSetting(tx)
    if (!latest || latest.cutOffAlertedAt || latest.cutOffAt !== current.cutOffAt) return
    await tx.platformSetting.update({
      where: { key: AUTO_APPROVAL_SETTING_KEY },
      data: { value: jsonValue({ ...latest, cutOffAlertedAt: now.toISOString() }) },
    })
  })
}

/** At most the remaining daily budget, never the whole table. */
async function candidateIds(value: AutoApprovalValue, now: Date, remaining: number): Promise<string[]> {
  const activatedAt = value.activatedAt ? new Date(value.activatedAt) : null
  if (!activatedAt || Number.isNaN(activatedAt.getTime())) return []
  const rows = await prisma.organization.findMany({
    where: {
      // The reliable sign-up marker written by the confirmation transaction. A space created by any
      // other path (operator, seed, script) has no `signupAt` and never enters this job.
      signupAt: { not: null },
      // A space that was already waiting when the option was turned on stays for the operator.
      createdAt: { gt: activatedAt },
      active: true,
      suspendedAt: null,
      OR: [{ publicationApprovedAt: null }, { outboundEmailApprovedAt: null }],
      admins: {
        some: {
          role: OWNER_ROLE,
          isActive: true,
          // The activation instant is a column (#1371), never `updatedAt`: a rename months later
          // must not make the owner look freshly activated.
          activatedAt: { not: null, lte: autoApprovalActivationCutoff(now) },
        },
      },
    },
    orderBy: { createdAt: "asc" },
    take: Math.min(remaining, AUTO_APPROVAL_DAILY_CEILING),
    select: { id: true },
  })
  return rows.map((r) => r.id)
}

type OneOutcome = { status: "approved"; reached: boolean } | { status: "skipped" } | { status: "stopped" }

/**
 * One space, in its own transaction: lock the setting row, re-read it, re-check every condition
 * (a refusal, a suspension or a manual validation that happened meanwhile consumes nothing), then
 * validate and count in the same transaction. The queued « espace activé » emails are delivered by
 * the outbox run that called this step.
 */
async function approveOne(id: string, now: Date): Promise<OneOutcome> {
  return prisma.$transaction(async (tx) => {
    const current = await lockSetting(tx)
    if (!current || autoApprovalState(current, now) !== "on") return { status: "stopped" }
    const today = autoApprovalBudgetDay(now)
    const used = current.budgetDate === today ? current.budgetUsed : 0
    if (used >= AUTO_APPROVAL_DAILY_CEILING) return { status: "stopped" }

    const org = await tx.organization.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        slug: true,
        active: true,
        suspendedAt: true,
        publicationApprovedAt: true,
        outboundEmailApprovedAt: true,
        createdAt: true,
        signupAt: true,
        admins: {
          where: { role: OWNER_ROLE },
          select: { email: true, createdAt: true, isActive: true, activatedAt: true },
        },
      },
    })
    if (!org || autoApprovalCandidateProblem(org, current, now) !== null) return { status: "skipped" }

    // The block list is checked again here, at the moment of the decision, for the owner's address
    // and domain (a block added between the selection and this transaction counts).
    const owner = autoApprovalSignupOwner(org)
    if (!owner) return { status: "skipped" }
    const keys = signupKeys(owner.email, null, process.env.AUTH_SECRET ?? "")
    const hits = await tx.signupBlock.findMany({ where: { OR: keys }, select: { expiresAt: true } })
    if (hits.some((hit) => blockApplies(hit, now))) return { status: "skipped" }

    const result = await approveOrganization(tx, { organizationId: id, actor: { type: "automatic" }, now })
    if (!result.approved) return { status: "skipped" }

    const nextUsed = used + 1
    const reached = nextUsed >= AUTO_APPROVAL_DAILY_CEILING
    const next: AutoApprovalValue = {
      ...current,
      budgetDate: today,
      budgetUsed: nextUsed,
      totalSinceActivation: current.totalSinceActivation + 1,
      ...(reached && !current.cutOffAt ? { cutOffAt: now.toISOString(), cutOffSeenAt: null, cutOffAlertedAt: null } : {}),
    }
    await tx.platformSetting.update({ where: { key: AUTO_APPROVAL_SETTING_KEY }, data: { value: jsonValue(next) } })
    if (reached && !current.cutOffAt) {
      await logOperator(tx, {
        action: "auto_approval.cut_off",
        actor: null,
        entityType: "Platform",
        entityId: AUTO_APPROVAL_SETTING_KEY,
        target: AUTO_APPROVAL_TARGET,
        detail: `Plafond de ${AUTO_APPROVAL_DAILY_CEILING} validations atteint le ${autoApprovalMomentLabel(now.toISOString(), APP_TIME_ZONE)}.`,
        source: "automatic",
      })
    }
    return { status: "approved", reached: reached && !current.cutOffAt }
  })
}

/**
 * The step at the start of the outbox run. Does nothing off the hosted service, off the option or
 * after its end day; otherwise validates a bounded batch and returns counts only. It never throws:
 * a space that fails is reported and the run goes on to the next.
 */
export async function runAutoApproval({ now = new Date() }: { now?: Date } = {}): Promise<AutoApprovalCounts> {
  if (!isHostedService()) return { ...NO_COUNTS }

  const counts: AutoApprovalCounts = { ...NO_COUNTS }
  const value = await readAutoApprovalValue()
  const state = autoApprovalState(value, now)

  if (state === "off") return counts
  if (state === "expired") {
    if (await expireIfNeeded(now)) counts.expired = 1
    return counts
  }
  if (state === "cut_off") {
    await maybeAlertCutOff(now).catch(reportError("auto_approval.alert"))
    return counts
  }

  const remaining = autoApprovalRemainingBudget(value, now)
  if (remaining <= 0) {
    counts.cutOff = await recordCutOff(now)
    await maybeAlertCutOff(now).catch(reportError("auto_approval.alert"))
    return counts
  }

  const ids = await candidateIds(value, now, remaining)
  counts.candidates = ids.length
  for (const id of ids) {
    try {
      const outcome = await approveOne(id, now)
      if (outcome.status === "approved") {
        counts.approved += 1
        if (outcome.reached) counts.cutOff = 1
      } else if (outcome.status === "skipped") {
        counts.skipped += 1
      } else {
        // The option was turned off, expired or cut off meanwhile: stop this batch.
        break
      }
    } catch (e) {
      counts.failed += 1
      reportError("auto_approval.approve")(e)
    }
  }

  await maybeAlertCutOff(now).catch(reportError("auto_approval.alert"))
  return counts
}
