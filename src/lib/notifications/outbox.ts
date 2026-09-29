import { after } from "next/server"
import { prisma } from "../prisma"
import { reportError } from "../report-error"
import { sendNotification } from "./index"
import type { NotificationPayload, Send } from "./types"
import { decryptValue, encryptValue } from "../token-vault"

/**
 * Notification outbox (#293).
 *
 * A route builds its notifications with the usual helpers, collected by `collectNotifications()`
 * instead of being sent inline, then `enqueueAndDeliver()` stores them (NotificationOutbox) and
 * schedules delivery right after the response. The request no longer waits on SMTP, and a send
 * that fails is retried by `deliverOutbox()` from the hourly cron with exponential backoff, up to
 * MAX_ATTEMPTS, then left as "failed" and reported to Sentry.
 */

export const MAX_ATTEMPTS = 6
/** 5 min, 10, 20, 40, 80 between attempts. */
export function backoffMs(attempts: number): number {
  return 5 * 60 * 1000 * 2 ** Math.max(0, attempts - 1)
}
/** A row claimed longer ago than this was abandoned by a crashed delivery: pick it up again. */
const STALE_CLAIM_MS = 15 * 60 * 1000

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
export function sealPayload(payload: NotificationPayload): object {
  const enc = encryptValue(JSON.stringify(payload))
  return enc ? { enc } : (payload as object)
}

export function openPayload(stored: unknown): NotificationPayload {
  const enc = (stored as { enc?: unknown }).enc
  if (typeof enc === "string") {
    return JSON.parse(decryptValue(enc)) as NotificationPayload
  }
  return stored as NotificationPayload
}

export async function enqueueNotifications(payloads: NotificationPayload[]): Promise<string[]> {
  const ids: string[] = []
  for (const payload of payloads) {
    const row = await prisma.notificationOutbox.create({ data: { payload: sealPayload(payload) }, select: { id: true } })
    ids.push(row.id)
  }
  return ids
}

/** Stores the notifications, then delivers them once the response has been sent. */
export async function enqueueAndDeliver(payloads: NotificationPayload[]): Promise<void> {
  if (payloads.length === 0) return
  const ids = await enqueueNotifications(payloads)
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
      .then(() => sendNotification(openPayload(claimed.payload)))
      .catch(
      (e: unknown) => ({ ok: false as const, reason: e instanceof Error ? e.message : String(e) }),
    )

    if (outcome.ok) {
      await prisma.notificationOutbox.update({ where: { id: row.id }, data: { status: "sent", sentAt: new Date(), lastError: null } })
      result.sent++
      continue
    }

    const attempts = claimed.attempts + 1
    const giveUp = attempts >= MAX_ATTEMPTS
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
