// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * History of targeted messages (#467): who wrote what, when, to whom, and how it was delivered.
 * The outbox is purged (sent rows every night, failed ones after 30 days), so each message keeps
 * counters of the rows the cleanup deleted; its delivery is those counters plus the rows still
 * in the outbox. Pure.
 */

export const MESSAGE_RETENTION_DAYS = 365

export type Delivery = { sent: number; failed: number; pending: number }

/** Counters frozen on the message plus the outbox rows that still exist. */
export function deliveryOf(frozen: { sentCount: number; failedCount: number }, live: { status: string }[]): Delivery {
  const count = (pred: (s: string) => boolean) => live.filter((r) => pred(r.status)).length
  return {
    sent: frozen.sentCount + count((s) => s === "sent"),
    failed: frozen.failedCount + count((s) => s === "failed"),
    pending: count((s) => s === "pending" || s === "sending"),
  }
}

/** « 12 envoyés, 1 en échec, 2 en attente », in words, zero parts left out (« Aucun envoi » if all zero). */
export function deliveryLabel(d: Delivery): string {
  const parts = [
    d.sent > 0 ? `${d.sent} envoyé${d.sent > 1 ? "s" : ""}` : null,
    d.failed > 0 ? `${d.failed} en échec` : null,
    d.pending > 0 ? `${d.pending} en attente` : null,
  ].filter(Boolean)
  return parts.length > 0 ? parts.join(", ") : "Aucun envoi"
}

/**
 * What the cleanup adds to each message before deleting its outbox rows: per message, the sent
 * and failed rows about to go. Rows of other notifications (no message) are ignored.
 */
export function countsToFreeze(rows: { targetedMessageId: string | null; status: string }[]): Map<string, { sent: number; failed: number }> {
  const out = new Map<string, { sent: number; failed: number }>()
  for (const r of rows) {
    if (!r.targetedMessageId || (r.status !== "sent" && r.status !== "failed")) continue
    const c = out.get(r.targetedMessageId) ?? { sent: 0, failed: 0 }
    if (r.status === "sent") c.sent++
    else c.failed++
    out.set(r.targetedMessageId, c)
  }
  return out
}
