// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Bulk send history (#1101): one SendBatch per batch of emails sent at once from an event, and
 * its delivery in words. Pure (no Prisma: also read by client components); the rows come from
 * src/lib/send-batches-data.ts.
 *
 * The outbox is purged every night (sent rows) or after 30 days (failed, cancelled), so a batch
 * keeps counters of the rows the cleanup deleted; its delivery is those counters plus the rows
 * still in the outbox, the same way as a targeted message (#467, message-history.ts).
 */

/** The anchor of « Envois groupés » in the event's Communication tab, target of the activity log. */
export const SEND_BATCHES_ANCHOR = "envois-groupes"

export const SEND_BATCH_KINDS = ["member_invite", "invite_reminder", "manual_reminder", "targeted_message", "scheduled_message", "open_shifts"] as const
export type SendBatchKind = (typeof SEND_BATCH_KINDS)[number]

const KIND_LABELS: Record<SendBatchKind, string> = {
  member_invite: "Invitations",
  invite_reminder: "Relance des invités sans réponse",
  manual_reminder: "Rappel aux inscrits",
  targeted_message: "Message aux bénévoles",
  scheduled_message: "Message programmé",
  open_shifts: "Créneaux à compléter",
}

export function sendBatchKindLabel(kind: string): string {
  return KIND_LABELS[kind as SendBatchKind] ?? "Envoi groupé"
}

/** The message kinds: their subject and text are in « Messages envoyés », not repeated here. */
export function isMessageKind(kind: string): boolean {
  return kind === "targeted_message" || kind === "scheduled_message" || kind === "open_shifts"
}

/** What the cleanup folds into a batch before deleting its rows. */
export type FrozenBatchCounts = { sentCount: number; heldSentCount: number; failedCount: number; cancelledCount: number; maxHeldWaitSec: number }

/** An outbox row as the summary reads it. */
export type BatchRow = { status: string; lastHeldAt: Date | null; firstHeldAt: Date | null; sentAt: Date | null }

export type BatchDelivery = {
  recipients: number
  sent: number
  /** Among the sent ones, those a sending limit held back first. */
  heldSent: number
  /** Still to go (pending or being sent). */
  pending: number
  /** Among the pending ones, those a sending limit is holding back. */
  heldNow: number
  failed: number
  cancelled: number
  /** Longest wait a limit caused among the sent ones, in seconds (0: none). */
  maxHeldWaitSec: number
}

/** How long a limit delayed one sent row, in seconds; 0 when it was never held. */
export function heldWaitSec(row: BatchRow): number {
  const heldAt = row.firstHeldAt ?? row.lastHeldAt
  if (!heldAt || !row.sentAt || row.status !== "sent") return 0
  return Math.max(0, Math.round((row.sentAt.getTime() - heldAt.getTime()) / 1000))
}

/** Counters frozen on the batch plus the outbox rows that still exist. */
export function batchDelivery(recipients: number, frozen: FrozenBatchCounts, live: BatchRow[]): BatchDelivery {
  const d: BatchDelivery = {
    recipients,
    sent: frozen.sentCount,
    heldSent: frozen.heldSentCount,
    pending: 0,
    heldNow: 0,
    failed: frozen.failedCount,
    cancelled: frozen.cancelledCount,
    maxHeldWaitSec: frozen.maxHeldWaitSec,
  }
  for (const r of live) {
    if (r.status === "sent") {
      d.sent++
      if (r.lastHeldAt) d.heldSent++
      d.maxHeldWaitSec = Math.max(d.maxHeldWaitSec, heldWaitSec(r))
    } else if (r.status === "pending" || r.status === "sending") {
      d.pending++
      if (r.lastHeldAt) d.heldNow++
    } else if (r.status === "failed") d.failed++
    else if (r.status === "cancelled") d.cancelled++
  }
  // A batch whose count could not be written (#1101, best effort): its emails tell it.
  if (d.recipients === 0) d.recipients = d.sent + d.pending + d.failed + d.cancelled
  return d
}

/**
 * What the cleanup adds to each batch before deleting its rows: per batch, the outcome of the
 * rows about to go. Rows outside any batch are ignored.
 */
export function batchCountsToFreeze(rows: (BatchRow & { sendBatchId: string | null })[]): Map<string, FrozenBatchCounts> {
  const out = new Map<string, FrozenBatchCounts>()
  for (const r of rows) {
    if (!r.sendBatchId) continue
    const c = out.get(r.sendBatchId) ?? { sentCount: 0, heldSentCount: 0, failedCount: 0, cancelledCount: 0, maxHeldWaitSec: 0 }
    if (r.status === "sent") {
      c.sentCount++
      if (r.lastHeldAt) c.heldSentCount++
      c.maxHeldWaitSec = Math.max(c.maxHeldWaitSec, heldWaitSec(r))
    } else if (r.status === "failed") c.failedCount++
    else if (r.status === "cancelled") c.cancelledCount++
    else continue
    out.set(r.sendBatchId, c)
  }
  return out
}

const plural = (n: number, one: string, many: string) => `${n} ${n > 1 ? many : one}`

/** « 118 envoyés, 1 en échec, 1 annulé, 2 en attente », zero parts left out (« Aucun email parti » if all zero). */
export function batchDeliveryLabel(d: BatchDelivery): string {
  const parts = [
    d.sent > 0 ? plural(d.sent, "envoyé", "envoyés") : null,
    d.pending > 0 ? `${d.pending} en attente` : null,
    d.failed > 0 ? `${d.failed} en échec` : null,
    d.cancelled > 0 ? plural(d.cancelled, "annulé", "annulés") : null,
  ].filter(Boolean)
  return parts.length > 0 ? parts.join(", ") : "Aucun email parti"
}

/** « moins d'une minute », « une minute », « 12 minutes », « 2 heures », « 1 jour ». */
export function waitText(sec: number): string {
  if (sec < 45) return "moins d'une minute"
  if (sec < 90) return "une minute"
  const min = Math.round(sec / 60)
  if (min < 60) return `${min} minutes`
  const h = Math.round(sec / 3600)
  if (h < 24) return h === 1 ? "une heure" : `${h} heures`
  const days = Math.round(sec / 86400)
  return days === 1 ? "un jour" : `${days} jours`
}

/**
 * The plain sentence when a sending limit delayed part of the batch, or null: « 1 email a attendu
 * une minute avant de partir, à cause du plafond d'envoi. » The wait is measured from the first
 * time the limit held the email to its departure.
 */
export function heldSentence(d: BatchDelivery): string | null {
  const out: string[] = []
  if (d.heldSent > 0) {
    const wait = waitText(d.maxHeldWaitSec)
    out.push(d.heldSent === 1
      ? `1 email a attendu ${wait} avant de partir, à cause du plafond d'envoi.`
      : `${d.heldSent} emails ont attendu jusqu'à ${wait} avant de partir, à cause du plafond d'envoi.`)
  }
  if (d.heldNow > 0) {
    out.push(d.heldNow === 1
      ? "1 email attend son tour à cause du plafond d'envoi : il partira dès que le plafond le permet."
      : `${d.heldNow} emails attendent leur tour à cause du plafond d'envoi : ils partiront dès que le plafond le permet.`)
  }
  return out.length > 0 ? out.join(" ") : null
}

/** What the activity log shows of a batch (#1101), computed when the log is read. */
export type ActivityBatch = {
  kindLabel: string
  eventId: string
  eventTitle: string
  /** « 120 destinataires, 118 envoyés, 2 en attente ». */
  summary: string
  heldSentence: string | null
}

/** « 120 destinataires, 118 envoyés, 2 en attente », the delivery as it is now. */
export function batchSummary(d: BatchDelivery): string {
  return `${recipientsText(d.recipients)}, ${batchDeliveryLabel(d)}`
}

/** « 120 destinataires ». */
export function recipientsText(n: number): string {
  return plural(n, "destinataire", "destinataires")
}
