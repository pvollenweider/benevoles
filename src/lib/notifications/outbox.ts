// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { after } from "next/server"
import { prisma } from "../prisma"
import type { Prisma } from "@/generated/prisma/client"
import { reportError } from "../report-error"
import { errorLogLine } from "../report-error-log"
import { sendNotification } from "./index"
import type { NotificationPayload, Send } from "./types"
import { MAX_ATTEMPTS } from "./types"
import { decryptValue, encryptValue } from "../token-vault"
import { siteDomain } from "@/lib/site"
import { isAddedByOrganizer, resolveAddedByOrganizer } from "./added-by-organizer"
import { MEMBER_ADDRESS_CHANGED_REASON, MEMBER_ADDRESS_CHECKED_KINDS, memberAddressChanged } from "../outbox-address-changed-reason"
import { bestEffort, hourStart, recordLimitHit } from "./limit-hits"
import type { SendBatchKind } from "../send-batches"
import { inactivityCopyVerdict } from "../org-inactivity-steps"

/**
 * Notification outbox (#293).
 *
 * A route builds its notifications with the usual helpers, collected by `collectNotifications()`
 * instead of being sent inline. They are stored (NotificationOutbox) with the client of the
 * transaction that makes the business change, `enqueueNotifications(payloads, tx)`, and
 * `deliverAfterResponse(ids)` schedules delivery once it has committed (#352): the change and its
 * notifications commit or roll back together, so a crash right after the commit can't leave, say,
 * a registration whose confirmation was never recorded. The request doesn't wait on SMTP, and a
 * send that fails is retried by `deliverOutbox()` from the hourly cron with exponential backoff,
 * up to MAX_ATTEMPTS, then left as "failed" and reported to Sentry.
 */

export { MAX_ATTEMPTS }

/**
 * A row that gave up only because the recipient's address doesn't exist (5.1.x, flagged by the
 * email channel): not reported to Sentry. Both flags are required, so any other failure, including
 * an unflagged permanent one, is still reported.
 */
export function isRecipientDataFailure(outcome: { permanent?: boolean; recipientRejected?: true }): boolean {
  return outcome.permanent === true && outcome.recipientRejected === true
}
/** 5 min, 10, 20, 40, 80 between attempts. */
export function backoffMs(attempts: number): number {
  return 5 * 60 * 1000 * 2 ** Math.max(0, attempts - 1)
}
/** A row claimed longer ago than this was abandoned by a crashed delivery: pick it up again. */
const STALE_CLAIM_MS = 15 * 60 * 1000

/**
 * The global client or any transaction's (`tx`, org-scoped or not): only the three outbox calls
 * used here, typed structurally so every client flavour fits.
 */
export type OutboxDb = {
  notificationOutbox: {
    createMany(args: { data: { payload: Prisma.InputJsonValue; dedupeKey: string; organizationId?: string | null; targetedMessageId?: string | null; sendBatchId?: string | null; inactivityStepId?: string | null }[]; skipDuplicates: boolean }): Promise<{ count: number }>
    findUniqueOrThrow(args: { where: { dedupeKey: string }; select: { id: true } }): Promise<{ id: string }>
    create(args: { data: { payload: Prisma.InputJsonValue; organizationId?: string | null; targetedMessageId?: string | null; sendBatchId?: string | null; inactivityStepId?: string | null }; select: { id: true } }): Promise<{ id: string }>
  }
}

/** A batch of emails sent at once from an event (#1101): recorded with the emails, see enqueueNotifications. */
export type SendBatchSpec = { kind: SendBatchKind; eventId: string; actorId: string | null }

/** What recording a batch needs on top of OutboxDb: the transaction of the routes has it all. */
export type BatchDb = OutboxDb & {
  sendBatch: {
    create(args: { data: { organizationId: string; eventId: string; kind: string; actorId: string | null; targetedMessageId?: string | null }; select: { id: true } }): Promise<{ id: string }>
    // updateMany / deleteMany, never update / delete: the org-scoped client checks a unique-key
    // write against the committed row, which this transaction's new batch is not yet.
    updateMany(args: { where: { id: string }; data: { recipientCount: number } }): Promise<unknown>
    deleteMany(args: { where: { id: string } }): Promise<unknown>
  }
  orgLog: {
    create(args: { data: { organizationId: string; actorType: string; actorId: string | null; action: string; entityType: string; entityId: string; changes?: Prisma.InputJsonValue } }): Promise<unknown>
  }
  /** Savepoints only (constant statements), so the batch record never aborts the send. */
  $executeRawUnsafe(query: string): Promise<number>
}

/** A `send` that only records payloads, to pass to the notification helpers. */
export function collectNotifications(): { send: Send; payloads: NotificationPayload[] } {
  const payloads: NotificationPayload[] = []
  return {
    payloads,
    send: async (payload) => {
      payloads.push(payload)
      return { ok: true }
    },
  }
}

/**
 * Payloads carry personal links (/my/<token>, leader links) and recipient data. With
 * TOKEN_ENCRYPTION_KEY set they're stored encrypted like the tokens themselves (#290), so the
 * outbox doesn't become a clear-text copy of what the token columns protect.
 */
export function sealPayload(payload: NotificationPayload): Prisma.InputJsonValue {
  const enc = encryptValue(JSON.stringify(payload))
  return enc ? { enc } : (payload as unknown as Prisma.InputJsonValue)
}

export function openPayload(stored: unknown): NotificationPayload {
  const enc = (stored as { enc?: unknown }).enc
  if (typeof enc === "string") {
    return JSON.parse(decryptValue(enc)) as NotificationPayload
  }
  return stored as NotificationPayload
}

/**
 * Stores the notifications; returns the ids of rows to deliver now. A payload with a
 * `dedupeKey` already enqueued (#315) is skipped (ON CONFLICT DO NOTHING) and not re-delivered:
 * the existing row is either sent already or pending its own delivery. A payload whose recipient
 * has no email address (a member added by hand without one) is not stored: email is the only
 * channel, so it could never be delivered and would only fail MAX_ATTEMPTS times and raise the
 * outbox health alert. Callers counting « notified » get the stored ids, so it isn't counted.
 */
export async function enqueueNotifications(
  payloads: NotificationPayload[],
  db: OutboxDb = prisma,
  /**
   * `targetedMessageId`: the history row of a targeted message (#467) these emails belong to.
   * `inactivityStepId`: the inactivity step (#1114) these copies confirm once one is sent.
   */
  opts: { organizationId?: string | null; targetedMessageId?: string; inactivityStepId?: string } = {},
): Promise<string[]> {
  return enqueueRows(payloads, db, opts, null)
}

/**
 * Stores a batch of emails sent at once from an event (#1101) like `enqueueNotifications`, plus
 * its SendBatch (who, when, how many; no recipient) and one organisation log entry, in the same
 * transaction: the batch, its emails and its trace commit together. Nothing queued (no address,
 * all already queued): no batch, no entry. Returns the ids of rows to deliver.
 *
 * The record never decides whether the emails go: each of its writes runs inside a savepoint, and
 * a failure rolls back that savepoint only (reported), never the transaction of the send. The
 * emails are then queued as before, outside any batch, or the batch keeps no log entry.
 */
export async function enqueueBatch(
  payloads: NotificationPayload[],
  db: BatchDb,
  opts: { organizationId: string; targetedMessageId?: string; batch: SendBatchSpec },
): Promise<string[]> {
  if (!payloads.some((p) => p.recipient.email?.trim())) return []
  const batchId = await inSavepoint(db, "send_batch_create", async () => (await db.sendBatch.create({
    data: { organizationId: opts.organizationId, eventId: opts.batch.eventId, kind: opts.batch.kind, actorId: opts.batch.actorId, targetedMessageId: opts.targetedMessageId ?? null },
    select: { id: true },
  })).id)
  const ids = await enqueueRows(payloads, db, opts, batchId)
  if (!batchId) return ids
  await inSavepoint(db, "send_batch_finish", async () => {
    if (ids.length === 0) {
      await db.sendBatch.deleteMany({ where: { id: batchId } })
      return
    }
    await db.sendBatch.updateMany({ where: { id: batchId }, data: { recipientCount: ids.length } })
    await db.orgLog.create({
      data: {
        organizationId: opts.organizationId,
        actorType: opts.batch.actorId ? "admin" : "system",
        actorId: opts.batch.actorId,
        action: "sendbatch.queued",
        entityType: "SendBatch",
        entityId: batchId,
        changes: { recipients: { from: null, to: ids.length } },
      },
    })
  })
  return ids
}

/**
 * Runs `step` inside a savepoint of the current transaction: on failure, only the step is rolled
 * back, the transaction goes on (Postgres aborts a whole transaction on a failed statement
 * otherwise). Returns the step's value, or null when it failed.
 */
async function inSavepoint<T>(db: BatchDb, name: string, step: () => Promise<T>): Promise<T | null> {
  await db.$executeRawUnsafe(`SAVEPOINT ${name}`)
  try {
    const value = await step()
    await db.$executeRawUnsafe(`RELEASE SAVEPOINT ${name}`)
    return value
  } catch (e) {
    await db.$executeRawUnsafe(`ROLLBACK TO SAVEPOINT ${name}`)
    try { reportError(`outbox.send_batch.${name}`)(e) } catch { /* reporting never fails the send */ }
    return null
  }
}

async function enqueueRows(
  payloads: NotificationPayload[],
  db: OutboxDb,
  opts: { organizationId?: string | null; targetedMessageId?: string; inactivityStepId?: string },
  sendBatchId: string | null,
): Promise<string[]> {
  const link = {
    ...(opts.targetedMessageId ? { targetedMessageId: opts.targetedMessageId } : {}),
    ...(sendBatchId ? { sendBatchId } : {}),
    ...(opts.inactivityStepId ? { inactivityStepId: opts.inactivityStepId } : {}),
  }
  const ids: string[] = []
  for (const { dedupeKey, ...payload } of payloads) {
    if (!payload.recipient.email?.trim()) continue
    // Stored in clear on the row (#382): the page filters on it, the payload stays sealed.
    const organizationId = payload.organizationId ?? opts.organizationId ?? null
    if (dedupeKey) {
      const { count } = await db.notificationOutbox.createMany({
        data: [{ payload: sealPayload(payload), dedupeKey, organizationId, ...link }],
        skipDuplicates: true,
      })
      if (count === 0) continue
      const row = await db.notificationOutbox.findUniqueOrThrow({ where: { dedupeKey }, select: { id: true } })
      ids.push(row.id)
      continue
    }
    const row = await db.notificationOutbox.create({ data: { payload: sealPayload(payload), organizationId, ...link }, select: { id: true } })
    ids.push(row.id)
  }
  return ids
}

/** Stable Message-ID per outbox row: a re-send after a crash is recognizable as the same email. */
export function outboxMessageId(rowId: string): string {
  const host = (() => {
    try { return new URL(process.env.NEXT_PUBLIC_APP_URL ?? "").hostname || siteDomain() } catch { return siteDomain() }
  })()
  return `<outbox-${rowId}@${host}>`
}

/**
 * Delivers stored rows once the response has been sent. After a transactional enqueue, call it
 * only once the transaction has committed: before that, the rows aren't visible to delivery.
 */
export function deliverAfterResponse(ids: string[]): void {
  if (ids.length === 0) return
  after(() => deliverOutbox({ ids }).then(() => undefined, reportError("outbox.deliver")))
}

/**
 * Sends due notifications: the given ids (right after a request), or every due row (cron).
 * Each row is claimed with a conditional update first, so two deliveries running at the same
 * time never send the same notification twice.
 *
 * Delivery is at-least-once: a crash after the SMTP server accepted the message but before the
 * row is marked "sent" leaves it claimed, and the stale-claim pickup sends it again. A rare
 * duplicate email is the accepted trade-off against a lost one.
 */
export async function deliverOutbox(opts: { ids?: string[]; limit?: number; now?: Date } = {}): Promise<{ sent: number; retried: number; failed: number; cancelled: number; held: number }> {
  const now = opts.now ?? new Date()
  const due = await prisma.notificationOutbox.findMany({
    where: {
      ...(opts.ids ? { id: { in: opts.ids } } : {}),
      OR: [
        { status: "pending", nextAttemptAt: { lte: now } },
        { status: "sending", claimedAt: { lt: new Date(now.getTime() - STALE_CLAIM_MS) } },
      ],
    },
    orderBy: { createdAt: "asc" },
    take: opts.limit ?? 100,
    select: { id: true, status: true, claimedAt: true },
  })

  const result = { sent: 0, retried: 0, failed: 0, cancelled: 0, held: 0 }
  for (const row of due) {
    const { count } = await prisma.notificationOutbox.updateMany({
      where: { id: row.id, status: row.status, claimedAt: row.claimedAt },
      data: { status: "sending", claimedAt: now },
    })
    if (count === 0) continue // claimed by another delivery meanwhile

    const claimed = await prisma.notificationOutbox.findUniqueOrThrow({ where: { id: row.id } })
    // A grouped « added by an organizer » email (#916) lists what is still held when it leaves:
    // nothing left, nothing to tell. A failed read is an ordinary failed attempt, retried.
    let nothingLeft = false
    let addressChanged = false
    let inactivityStopped: string | null = null
    const outcome = await Promise.resolve()
      .then(async () => {
        let payload = openPayload(claimed.payload)
        if (isAddedByOrganizer(payload)) {
          const resolved = await resolveAddedByOrganizer(payload)
          if (!resolved) { nothingLeft = true; return { ok: true as const } }
          payload = resolved
        }
        // An invitation or manual reminder held in the queue (#1105) carries a personal link: if
        // the member's address changed meanwhile, it must not leave for the old one.
        if (payload.volunteerId && MEMBER_ADDRESS_CHECKED_KINDS.includes(payload.kind)) {
          const member = await prisma.volunteer.findUnique({ where: { id: payload.volunteerId }, select: { email: true } })
          if (memberAddressChanged(payload.recipient.email, member)) { addressChanged = true; return { ok: true as const } }
        }
        // An inactivity message (#1114) goes only to a current administrator, while the procedure runs.
        if (claimed.inactivityStepId) {
          inactivityStopped = await inactivityCopyBlocked(claimed.inactivityStepId, payload.recipient.email ?? "", now)
          if (inactivityStopped) return { ok: true as const }
        }
        // The row's organisation (#814) is checked by sendNotification right before this one send,
        // not when the batch was read: a deactivation during a batch stops the rest of it.
        return sendNotification({ ...payload, organizationId: claimed.organizationId ?? payload.organizationId ?? null, messageId: outboxMessageId(row.id), outboxId: row.id })
      })
      .catch(
      (e: unknown) => ({ ok: false as const, reason: e instanceof Error ? e.message : String(e), permanent: undefined as true | undefined, recipientRejected: undefined as true | undefined, blocked: undefined as true | undefined, held: undefined as true | undefined, retryAfterMs: undefined as number | undefined, limit: undefined as string | undefined }),
    )

    if (addressChanged) {
      await prisma.notificationOutbox.update({ where: { id: row.id }, data: { status: "cancelled", lastError: MEMBER_ADDRESS_CHANGED_REASON, claimedAt: null } })
      result.cancelled++
      continue
    }

    if (inactivityStopped) {
      await prisma.notificationOutbox.update({ where: { id: row.id }, data: { status: "cancelled", lastError: inactivityStopped, claimedAt: null } })
      result.cancelled++
      continue
    }

    if (nothingLeft) {
      await prisma.notificationOutbox.update({ where: { id: row.id }, data: { status: "cancelled", lastError: "Plus aucune inscription à annoncer.", claimedAt: null } })
      result.cancelled++
      continue
    }

    if (!outcome.ok && outcome.held) {
      // Over a sending limit (#810): not an attempt, not a failure. Back to pending, tried again
      // when the window ends; the attempts count is left as it was.
      await prisma.notificationOutbox.update({
        where: { id: row.id },
        data: { status: "pending", claimedAt: null, nextAttemptAt: new Date(now.getTime() + (outcome.retryAfterMs ?? 60_000)) },
      })
      result.held++
      if (outcome.limit) await markHeld(row.id, claimed.organizationId, outcome.limit, now)
      continue
    }

    if (!outcome.ok && outcome.blocked) {
      // Deactivated or deleted organisation (#814), or a public-triggered email over its
      // per-recipient cap (#810): cancelled for good, never retried, never sent later.
      await prisma.notificationOutbox.update({ where: { id: row.id }, data: { status: "cancelled", lastError: outcome.reason, claimedAt: null } })
      result.cancelled++
      continue
    }

    if (outcome.ok) {
      const sentAt = new Date()
      if (claimed.inactivityStepId) {
        // The first copy accepted confirms its inactivity step (#1114), in the same transaction:
        // the sent row itself is purged the next night, the confirmation stays.
        const stepId = claimed.inactivityStepId
        await prisma.$transaction([
          prisma.notificationOutbox.update({ where: { id: row.id }, data: { status: "sent", sentAt, lastError: null } }),
          prisma.orgInactivityStep.updateMany({ where: { id: stepId, confirmedAt: null }, data: { confirmedAt: sentAt } }),
        ])
      } else {
        await prisma.notificationOutbox.update({ where: { id: row.id }, data: { status: "sent", sentAt, lastError: null } })
      }
      result.sent++
      continue
    }

    const attempts = claimed.attempts + 1
    // A permanent SMTP rejection (#598) stops the retries at once: a 5xx can't be fixed by
    // waiting, unlike a 4xx or a connection issue, which keep the normal backoff.
    const giveUp = attempts >= MAX_ATTEMPTS || outcome.permanent === true
    await prisma.notificationOutbox.update({
      where: { id: row.id },
      data: {
        status: giveUp ? "failed" : "pending",
        attempts,
        lastError: outcome.reason.slice(0, 500),
        nextAttemptAt: new Date(now.getTime() + backoffMs(attempts)),
        claimedAt: null,
      },
    })
    if (giveUp) {
      result.failed++
      let kind = "unknown"
      try { kind = openPayload(claimed.payload).kind } catch { /* reported below anyway */ }
      const gaveUp = new Error(`Notification ${row.id} failed ${attempts} times: ${outcome.reason}`)
      if (isRecipientDataFailure(outcome)) {
        // A mailbox or domain that doesn't exist: the member's address, not an application error.
        // Failed and shown to the organiser as before, logged as a warning, not sent to Sentry.
        console.warn(errorLogLine(`outbox.gave_up.${kind}`, gaveUp))
      } else {
        reportError(`outbox.gave_up.${kind}`)(gaveUp)
      }
    } else {
      result.retried++
    }
  }
  return result
}

/**
 * Why a queued inactivity copy (#1114) must not leave any more, read right before the send: its
 * step is gone (procedure stopped), the recipient is no longer an active administrator at that
 * address, or the procedure was stopped since the step was queued. Null: it may go.
 */
async function inactivityCopyBlocked(stepId: string, recipientEmail: string, now: Date): Promise<string | null> {
  const step = await prisma.orgInactivityStep.findUnique({
    where: { id: stepId },
    select: {
      queuedAt: true,
      organization: {
        select: {
          active: true, inactivityExempt: true, inactivityPostponedUntil: true, lastMeaningfulActivityAt: true, lastRetentionConfirmedAt: true,
          admins: { where: { isActive: true }, select: { email: true } },
        },
      },
    },
  })
  if (!step) return "Vérification d'inactivité arrêtée : message annulé."
  const o = step.organization
  return inactivityCopyVerdict({ recipientEmail, queuedAt: step.queuedAt }, {
    active: o.active,
    exempt: o.inactivityExempt,
    postponedUntil: o.inactivityPostponedUntil,
    lastActivityAt: o.lastMeaningfulActivityAt,
    lastRetentionConfirmedAt: o.lastRetentionConfirmedAt,
    adminEmails: o.admins.map((a) => a.email),
  }, now)
}

/**
 * Marks a held row (#1100) and counts it in its limit's hour, once per row and hour: the
 * conditional update lets exactly one delivery through, even when two run at once or a stale
 * claim is picked up again. Best effort, after the row is already back to pending.
 */
async function markHeld(id: string, organizationId: string | null, limit: string, now: Date): Promise<void> {
  await bestEffort("email.limit.mark_held", async () => {
    // The first hold (#1101): with sentAt, how long the limit delayed this email.
    await prisma.notificationOutbox.updateMany({ where: { id, firstHeldAt: null }, data: { firstHeldAt: now } })
    const { count } = await prisma.notificationOutbox.updateMany({
      where: { id, OR: [{ lastHeldAt: null }, { lastHeldAt: { lt: hourStart(now) } }] },
      data: { lastHeldAt: now },
    })
    if (count === 1) await recordLimitHit({ organizationId, limit, outcome: "held", now })
  })
}

export type OutboxHealth = {
  failedLastDay: number
  oldestPendingMinutes: number | null
  staleClaims: number
  healthy: boolean
  /**
   * Delivery is stuck (abandoned claim, or a row pending too long): what the hourly cron alerts on.
   * A row that gave up is already reported once when it fails (outbox.gave_up.*), so counting it
   * again would repeat the same alert every hour for a day.
   */
  stuck: boolean
}

/** Alert thresholds (#316): a pending email older than this means delivery is stuck. */
export const MAX_PENDING_AGE_MINUTES = 120

/**
 * Health of the queue (#316): rows that gave up in the last day, age of the oldest undelivered
 * row, claims abandoned by a crashed delivery. The health page shows it all; the hourly cron sends
 * it to Sentry only when delivery is stuck.
 */
export async function outboxHealth(now: Date = new Date()): Promise<OutboxHealth> {
  const [failedLastDay, oldestPending, staleClaims] = await Promise.all([
    prisma.notificationOutbox.count({ where: { status: "failed", createdAt: { gte: new Date(now.getTime() - 24 * 60 * 60 * 1000) } } }),
    prisma.notificationOutbox.findFirst({
      where: { status: { in: ["pending", "sending"] } },
      orderBy: { createdAt: "asc" },
      select: { createdAt: true },
    }),
    prisma.notificationOutbox.count({ where: { status: "sending", claimedAt: { lt: new Date(now.getTime() - STALE_CLAIM_MS) } } }),
  ])
  const oldestPendingMinutes = oldestPending ? Math.floor((now.getTime() - oldestPending.createdAt.getTime()) / 60000) : null
  const stuck = staleClaims > 0 || (oldestPendingMinutes ?? 0) > MAX_PENDING_AGE_MINUTES
  const healthy = failedLastDay === 0 && !stuck
  return { failedLastDay, oldestPendingMinutes, staleClaims, healthy, stuck }
}
