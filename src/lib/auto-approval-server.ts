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
import { notifyOperator, sendNtfy, type OperatorAlert } from "@/lib/operator-alerts"
import { reportError } from "@/lib/report-error"
import {
  AUTO_APPROVAL_CEILING_REACHED,
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
  autoApprovalStoredBudgetUsed,
  autoApprovalView,
  readAutoApprovalStored,
  type AutoApprovalStored,
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

/** The stored value and its strict-validator verdict, or the empty default. */
async function readAutoApprovalStoredValue(
  db: Pick<typeof prisma, "platformSetting"> = prisma,
  now: Date = new Date(),
): Promise<AutoApprovalStored> {
  const row = await db.platformSetting.findUnique({ where: { key: AUTO_APPROVAL_SETTING_KEY }, select: { value: true } })
  return readAutoApprovalStored(row?.value, now)
}

/** What the super admin section and the routes return. */
export async function readAutoApprovalView(now: Date = new Date()): Promise<AutoApprovalView> {
  const row = await prisma.platformSetting.findUnique({ where: { key: AUTO_APPROVAL_SETTING_KEY }, select: { value: true } })
  return autoApprovalView(row?.value, now)
}

/**
 * The row lock every decision takes before re-reading: a cut-off, an expiry, a deactivation or an
 * approval all see the same state, and the daily budget is never spent twice. It returns the raw
 * stored value: the caller reads the authoritative time after the lock, never before it.
 */
async function lockSettingRow(tx: Prisma.TransactionClient): Promise<unknown | null> {
  const rows = await tx.$queryRaw<{ value: unknown }[]>`SELECT "value" FROM "PlatformSetting" WHERE "key" = ${AUTO_APPROVAL_SETTING_KEY} FOR UPDATE`
  if (rows.length === 0) return null
  return rows[0].value
}

/** Thrown when turning the option on would spend a daily budget already used up today. */
export class AutoApprovalCeilingReachedError extends Error {
  constructor() {
    super(AUTO_APPROVAL_CEILING_REACHED)
    this.name = "AutoApprovalCeilingReachedError"
  }
}

/**
 * Turns the option on, or changes its end day. Turning it on from off, expired or cut off starts a
 * new session (new activation instant and author, `totalSinceActivation` reset, cut-off notice
 * cleared), but the UTC day's budget survives every state change: it is reset only when the UTC
 * day changes. Turning it on with today's budget already used up is refused.
 */
export async function setAutoApprovalUntil(until: string, actor: Actor, now: Date = new Date()): Promise<AutoApprovalView> {
  const saved = await prisma.$transaction(async (tx) => {
    const raw = await lockSettingRow(tx)
    const current = raw === null ? null : readAutoApprovalStored(raw, now)
    const state = raw === null ? "off" : autoApprovalState(raw, now)
    const running = state === "on" && current !== null
    const today = autoApprovalBudgetDay(now)
    let budgetDate = today
    let budgetUsed = 0

    if (running) {
      // A running session keeps its counters. A UTC day that has turned resets the daily one; a
      // stored day after today's is never moved backwards.
      const day = current.value.budgetDate!
      budgetDate = day > today ? day : today
      budgetUsed = day >= today ? current.value.budgetUsed : 0
    } else {
      // A new activation replaces a corrupted value by a clean one, but still honours today's
      // budget when it can be read; an unreadable budget of today counts as fully used.
      const readable = raw === null ? 0 : autoApprovalStoredBudgetUsed(raw, now)
      if (readable === null || readable >= AUTO_APPROVAL_DAILY_CEILING) {
        throw new AutoApprovalCeilingReachedError()
      }
      budgetUsed = readable
    }

    const next: AutoApprovalValue = running
      ? { ...current.value, until, budgetDate, budgetUsed }
      : {
          ...EMPTY_AUTO_APPROVAL,
          until,
          activatedAt: now.toISOString(),
          activatedById: actor?.id ?? null,
          activatedByLabel: actor?.name?.trim() || actor?.email?.trim() || null,
          budgetDate,
          budgetUsed,
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

/** Turns the option off now. The cut-off notice and the UTC day's budget stay until dismissed/reset. */
export async function disableAutoApproval(actor: Actor, now: Date = new Date()): Promise<AutoApprovalView> {
  const saved = await prisma.$transaction(async (tx) => {
    const raw = await lockSettingRow(tx)
    const current = raw === null ? null : readAutoApprovalStored(raw, now)
    // A corrupted value is already off: leave it untouched for the activation to replace.
    if (!current || current.invalid || !current.value.until) return current?.value ?? EMPTY_AUTO_APPROVAL
    const previousDay = current.value.until
    const next = { ...current.value, until: null }
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
export async function dismissAutoApprovalNotice(actor: Actor, now: Date = new Date()): Promise<AutoApprovalView> {
  const saved = await prisma.$transaction(async (tx) => {
    const raw = await lockSettingRow(tx)
    const current = raw === null ? null : readAutoApprovalStored(raw, now)
    if (!current || current.invalid || !current.value.cutOffAt || current.value.cutOffSeenAt) {
      return current?.value ?? EMPTY_AUTO_APPROVAL
    }
    const next = { ...current.value, cutOffSeenAt: now.toISOString() }
    await tx.platformSetting.update({ where: { key: AUTO_APPROVAL_SETTING_KEY }, data: { value: jsonValue(next) } })
    await logOperator(tx, {
      action: "auto_approval.notice_dismissed",
      actor,
      entityType: "Platform",
      entityId: AUTO_APPROVAL_SETTING_KEY,
      target: AUTO_APPROVAL_TARGET,
      detail: `Avis de coupure du ${autoApprovalMomentLabel(current.value.cutOffAt, APP_TIME_ZONE)} masqué.`,
    })
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

/** The alert of one cut-off; its dedupe key is the cut-off's own instant, not a UTC day. */
function cutOffAlert(cutOffAt: string): OperatorAlert {
  return {
    key: `auto-approval-cut-off:${cutOffAt}`,
    title: "Validation automatique coupée",
    message: `Le plafond de ${AUTO_APPROVAL_DAILY_CEILING} validations automatiques a été atteint le ${autoApprovalMomentLabel(cutOffAt, APP_TIME_ZONE)}. L'option est coupée ; les espaces en attente restent à valider à la main.`,
    priority: 4,
    url: `${appUrl()}/super-admin/blocklist#validation-automatique`,
  }
}

/** Writes the one « expirée » entry, under the lock; true only for the run that wrote it. */
async function expireIfNeeded(clock: () => Date): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    const raw = await lockSettingRow(tx)
    // The authoritative instant is read after the lock, never the one captured before the batch.
    const now = clock()
    if (raw === null) return false
    const current = readAutoApprovalStored(raw, now)
    if (current.invalid || autoApprovalState(current.value, now) !== "expired" || current.value.expiredAt) return false
    await tx.platformSetting.update({
      where: { key: AUTO_APPROVAL_SETTING_KEY },
      data: { value: jsonValue({ ...current.value, expiredAt: now.toISOString() }) },
    })
    await logOperator(tx, {
      action: "auto_approval.expired",
      actor: null,
      entityType: "Platform",
      entityId: AUTO_APPROVAL_SETTING_KEY,
      target: AUTO_APPROVAL_TARGET,
      detail: `Expirée le ${autoApprovalDayLabel(current.value.until!)}.`,
      source: "automatic",
    })
    return true
  })
}

/** The cut-off entry, with its durable alert email, for a budget already used up without one. */
async function recordCutOff(clock: () => Date): Promise<number> {
  const cut = await prisma.$transaction(async (tx) => {
    const raw = await lockSettingRow(tx)
    const now = clock()
    if (raw === null) return false
    const current = readAutoApprovalStored(raw, now)
    if (current.invalid || autoApprovalState(current.value, now) !== "on") return false
    if (autoApprovalRemainingBudget(current.value, now) > 0 || current.value.cutOffAt) return false
    const cutOffAt = now.toISOString()
    // The email is queued in the very transaction that writes the cut-off: it exists if and only
    // if the cut-off committed, exactly once (its dedupe key is the cut-off instant).
    await notifyOperator(cutOffAlert(cutOffAt), {}, { db: tx, push: false, strictEmail: true })
    await tx.platformSetting.update({
      where: { key: AUTO_APPROVAL_SETTING_KEY },
      data: { value: jsonValue({ ...current.value, cutOffAt, cutOffSeenAt: null, cutOffAlertedAt: null }) },
    })
    await logOperator(tx, {
      action: "auto_approval.cut_off",
      actor: null,
      entityType: "Platform",
      entityId: AUTO_APPROVAL_SETTING_KEY,
      target: AUTO_APPROVAL_TARGET,
      detail: `Plafond de ${AUTO_APPROVAL_DAILY_CEILING} validations atteint le ${autoApprovalMomentLabel(cutOffAt, APP_TIME_ZONE)}.`,
      source: "automatic",
    })
    return true
  })
  return cut ? 1 : 0
}

/**
 * Claims the right to push this cut-off's ntfy alert with one conditional update: only the run
 * whose update matches (same cut-off instant, `cutOffAlertedAt` still empty) gets a row back, so
 * two runs never both push. The push is best effort: a failure is reported by `sendNtfy` and not
 * retried, because the email queued with the cut-off transaction is the guarantee.
 */
async function claimCutOffAlert(cutOffAt: string, now: Date): Promise<boolean> {
  const rows = await prisma.$queryRaw<{ key: string }[]>`
    UPDATE "PlatformSetting"
       SET "value" = jsonb_set("value"::jsonb, '{cutOffAlertedAt}', to_jsonb(${now.toISOString()}::text), true),
           "updatedAt" = now()
     WHERE "key" = ${AUTO_APPROVAL_SETTING_KEY}
       AND "value"->>'cutOffAt' = ${cutOffAt}
       AND "value"->>'cutOffAlertedAt' IS NULL
    RETURNING "key"
  `
  return rows.length > 0
}

/**
 * Sends the immediate push of a committed cut-off, once. The alert is tied to the cut-off, not to
 * the UTC day, and expiry does not suppress it: a run that crashes after the commit finds the
 * email already queued and only has to claim the push on the next run.
 */
async function maybeAlertCutOff(clock: () => Date): Promise<void> {
  const now = clock()
  const current = await readAutoApprovalStoredValue(prisma, now)
  if (current.invalid || !current.value.cutOffAt || current.value.cutOffAlertedAt) return
  const cutOffAt = current.value.cutOffAt
  if (!(await claimCutOffAlert(cutOffAt, now))) return
  await sendNtfy(cutOffAlert(cutOffAt))
}

/** At most the remaining daily budget, never the whole table. */
async function candidateIds(
  value: AutoApprovalValue,
  now: Date,
  remaining: number,
  organizationIds?: readonly string[],
): Promise<string[]> {
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
      // Tests and a targeted run narrow the batch to their own spaces; the scheduled job passes
      // no scope and sees every eligible space.
      ...(organizationIds ? { id: { in: [...organizationIds] } } : {}),
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
 * One space, in its own transaction: lock the setting row, read the authoritative time again,
 * re-check every condition (a refusal, a suspension or a manual validation that happened meanwhile
 * consumes nothing), then validate and count in the same transaction. The queued « espace activé »
 * emails are delivered by the outbox run that called this step.
 */
async function approveOne(id: string, clock: () => Date): Promise<OneOutcome> {
  return prisma.$transaction(async (tx) => {
    const raw = await lockSettingRow(tx)
    // After the lock: a run that waited across the option's end, or across UTC midnight, decides
    // with this instant, never with the one it captured before selecting candidates.
    const now = clock()
    if (raw === null) return { status: "stopped" }
    const current = readAutoApprovalStored(raw, now)
    if (current.invalid || autoApprovalState(current.value, now) !== "on") return { status: "stopped" }
    const today = autoApprovalBudgetDay(now)
    // Never move the budget day backwards: a stored day after the clock's means a concurrent run
    // already moved on, so this space is left untouched.
    if (current.value.budgetDate! > today) return { status: "stopped" }
    const used = current.value.budgetDate === today ? current.value.budgetUsed : 0
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
    if (!org || autoApprovalCandidateProblem(org, current.value, now) !== null) return { status: "skipped" }

    // The block list is checked again here, at the moment of the decision, for the owner's address
    // and domain (a block added between the selection and this transaction counts).
    const owner = autoApprovalSignupOwner(org, now)
    if (!owner) return { status: "skipped" }
    const keys = signupKeys(owner.email, null, process.env.AUTH_SECRET ?? "")
    const hits = await tx.signupBlock.findMany({ where: { OR: keys }, select: { expiresAt: true } })
    if (hits.some((hit) => blockApplies(hit, now))) return { status: "skipped" }

    const result = await approveOrganization(tx, { organizationId: id, actor: { type: "automatic" }, now })
    if (!result.approved) return { status: "skipped" }

    const nextUsed = used + 1
    const reached = nextUsed >= AUTO_APPROVAL_DAILY_CEILING
    const cutsOff = reached && !current.value.cutOffAt
    const cutOffAt = cutsOff ? now.toISOString() : null
    const next: AutoApprovalValue = {
      ...current.value,
      budgetDate: today,
      budgetUsed: nextUsed,
      totalSinceActivation: current.value.totalSinceActivation + 1,
      ...(cutOffAt ? { cutOffAt, cutOffSeenAt: null, cutOffAlertedAt: null } : {}),
    }
    if (cutOffAt) {
      // Durable email first, in this transaction: it commits with the cut-off and with the grant.
      await notifyOperator(cutOffAlert(cutOffAt), {}, { db: tx, push: false, strictEmail: true })
    }
    await tx.platformSetting.update({ where: { key: AUTO_APPROVAL_SETTING_KEY }, data: { value: jsonValue(next) } })
    if (cutOffAt) {
      await logOperator(tx, {
        action: "auto_approval.cut_off",
        actor: null,
        entityType: "Platform",
        entityId: AUTO_APPROVAL_SETTING_KEY,
        target: AUTO_APPROVAL_TARGET,
        detail: `Plafond de ${AUTO_APPROVAL_DAILY_CEILING} validations atteint le ${autoApprovalMomentLabel(cutOffAt, APP_TIME_ZONE)}.`,
        source: "automatic",
      })
    }
    return { status: "approved", reached: cutsOff }
  })
}

export type AutoApprovalRunOptions = {
  /** The instant used to choose the batch; each space's decision rereads `clock` after its lock. */
  now?: Date
  /** Injectable clock, real by default, used after each lock so tests can advance it. */
  clock?: () => Date
  /** Tests and a targeted run narrow the candidates to these organisation ids; the job passes none. */
  organizationIds?: readonly string[]
}

/**
 * The step at the start of the outbox run. Does nothing off the hosted service, off the option or
 * after its end day; otherwise validates a bounded batch and returns counts only. It never throws:
 * a space that fails is reported and the run goes on to the next.
 */
export async function runAutoApproval({
  now = new Date(),
  clock = () => new Date(),
  organizationIds,
}: AutoApprovalRunOptions = {}): Promise<AutoApprovalCounts> {
  if (!isHostedService()) return { ...NO_COUNTS }

  const counts: AutoApprovalCounts = { ...NO_COUNTS }
  const stored = await readAutoApprovalStoredValue(prisma, now)
  if (stored.invalid) {
    // One report per run; the option is off, so no candidate can be selected.
    reportError("auto_approval.invalid")(new Error("Réglage de validation automatique illisible : l'option est traitée comme désactivée."))
    return counts
  }

  const state = autoApprovalState(stored.value, now)
  if (state === "off") return counts
  if (state === "expired") {
    if (await expireIfNeeded(clock)) counts.expired = 1
    // Expiry does not suppress a cut-off alert that a crashed run did not push yet.
    await maybeAlertCutOff(clock).catch(reportError("auto_approval.alert"))
    return counts
  }
  if (state === "cut_off") {
    await maybeAlertCutOff(clock).catch(reportError("auto_approval.alert"))
    return counts
  }

  const remaining = autoApprovalRemainingBudget(stored.value, now)
  if (remaining <= 0) {
    counts.cutOff = await recordCutOff(clock)
    await maybeAlertCutOff(clock).catch(reportError("auto_approval.alert"))
    return counts
  }

  const ids = await candidateIds(stored.value, now, remaining, organizationIds)
  counts.candidates = ids.length
  for (const id of ids) {
    try {
      const outcome = await approveOne(id, clock)
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

  await maybeAlertCutOff(clock).catch(reportError("auto_approval.alert"))
  return counts
}
