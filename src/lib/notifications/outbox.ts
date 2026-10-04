// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { after } from "next/server"
import { prisma } from "../prisma"
import type { Prisma } from "@/generated/prisma/client"
import { reportError } from "../report-error"
import { sendNotification } from "./index"
import type { NotificationPayload, Send } from "./types"
import { MAX_ATTEMPTS } from "./types"
import { decryptValue, encryptValue } from "../token-vault"

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
    createMany(args: { data: { payload: Prisma.InputJsonValue; dedupeKey: string; organizationId?: string | null; targetedMessageId?: string | null }[]; skipDuplicates: boolean }): Promise<{ count: number }>
    findUniqueOrThrow(args: { where: { dedupeKey: string }; select: { id: true } }): Promise<{ id: string }>
    create(args: { data: { payload: Prisma.InputJsonValue; organizationId?: string | null; targetedMessageId?: string | null }; select: { id: true } }): Promise<{ id: string }>
  }
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
 * the existing row is either sent already or pending its own delivery.
 */
export async function enqueueNotifications(
  payloads: NotificationPayload[],
  db: OutboxDb = prisma,
  /** `targetedMessageId`: the history row of a targeted message (#467) these emails belong to. */
  opts: { organizationId?: string | null; targetedMessageId?: string } = {},
): Promise<string[]> {
  const link = opts.targetedMessageId ? { targetedMessageId: opts.targetedMessageId } : {}
  const ids: string[] = []
  for (const { dedupeKey, ...payload } of payloads) {
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
    try { return new URL(process.env.NEXT_PUBLIC_APP_URL ?? "").hostname || "benevol.app" } catch { return "benevol.app" }
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
export async function deliverOutbox(opts: { ids?: string[]; limit?: number; now?: Date } = {}): Promise<{ sent: number; retried: number; failed: number }> {
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

  const result = { sent: 0, retried: 0, failed: 0 }
  for (const row of due) {
    const { count } = await prisma.notificationOutbox.updateMany({
      where: { id: row.id, status: row.status, claimedAt: row.claimedAt },
      data: { status: "sending", claimedAt: now },
    })
    if (count === 0) continue // claimed by another delivery meanwhile

    const claimed = await prisma.notificationOutbox.findUniqueOrThrow({ where: { id: row.id } })
    const outcome = await Promise.resolve()
      .then(() => sendNotification({ ...openPayload(claimed.payload), messageId: outboxMessageId(row.id), outboxId: row.id }))
      .catch(
      (e: unknown) => ({ ok: false as const, reason: e instanceof Error ? e.message : String(e), permanent: undefined as true | undefined }),
    )

    if (outcome.ok) {
      await prisma.notificationOutbox.update({ where: { id: row.id }, data: { status: "sent", sentAt: new Date(), lastError: null } })
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
      reportError(`outbox.gave_up.${kind}`)(new Error(`Notification ${row.id} failed ${attempts} times: ${outcome.reason}`))
    } else {
      result.retried++
    }
  }
  return result
}

export type OutboxHealth = {
  failedLastDay: number
  oldestPendingMinutes: number | null
  staleClaims: number
  healthy: boolean
}

/** Alert thresholds (#316): a pending email older than this means delivery is stuck. */
export const MAX_PENDING_AGE_MINUTES = 120

/**
 * Health of the queue (#316), reported by the hourly cron and sent to Sentry when unhealthy:
 * rows that gave up in the last day, age of the oldest undelivered row, claims abandoned by a
 * crashed delivery.
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
  const healthy = failedLastDay === 0 && staleClaims === 0 && (oldestPendingMinutes ?? 0) <= MAX_PENDING_AGE_MINUTES
  return { failedLastDay, oldestPendingMinutes, staleClaims, healthy }
}
