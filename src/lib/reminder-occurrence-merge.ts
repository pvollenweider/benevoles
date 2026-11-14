// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Pure planning for the reminder occurrences of a member merge (#1139, #600), no Prisma import.
 *
 * `ReminderOccurrence` is unique on (eventId, volunteerId, localDay, ruleId). Moving the absorbed
 * record's registrations to the kept one without moving this state loses the proof that a reminder
 * already went out: with no `sent` row under the kept id, the next hourly run recomputes the pair
 * and sends it again, sometimes to the same address. The merge therefore folds the absorbed keys
 * into the kept record in the same transaction:
 *
 * - `sent` wins over every other state, so a reminder already delivered is never sent twice;
 * - otherwise a `queued` row wins over pending/cancelled/failed, so an already enqueued email is
 *   not thrown away when the kept record has no better state;
 * - the two other rows are deleted, and every superseded outbox row is cancelled so it cannot
 *   leave after the merge.
 *
 * A loser whose outbox row is already `sending` cannot be cancelled safely (a delivery may be in
 * flight); the caller only cancels `pending` rows, exactly like `cancelOutboxForMergedMember`.
 */

export type MergeOccurrence = {
  id: string
  eventId: string
  localDay: string
  ruleId: string
  status: string
  outboxId: string | null
  sentAt: Date | null
}

export type ReminderOccurrenceMergePlan = {
  /** Absorbed occurrences to move to the kept record (no conflict). */
  reassignIds: string[]
  /** Absorbed occurrences to delete after their state was folded or superseded. */
  deleteAbsorbIds: string[]
  /** Kept occurrences to delete so an absorbed queued occurrence can take the same key. */
  deleteKeepIds: string[]
  /** Kept occurrences that become sent with the absorbed record's delivery. */
  markSent: { id: string; sentAt: Date | null; outboxId: string | null }[]
  /** Outbox rows superseded by the merge; the caller cancels them only while still pending. */
  cancelOutboxIds: string[]
}

const key = (occurrence: Pick<MergeOccurrence, "eventId" | "localDay" | "ruleId">) =>
  [occurrence.eventId, occurrence.localDay, occurrence.ruleId].join("\u0000")

/**
 * Folds the absorbed record's occurrences into the kept record's. When a key exists on both sides,
 * one row survives (see the module comment); when it exists only on the absorbed side, it moves
 * with the registration. Idempotent for planning only: the transaction applies the plan once.
 */
export function planReminderOccurrenceMerge(
  keep: readonly MergeOccurrence[],
  absorb: readonly MergeOccurrence[],
): ReminderOccurrenceMergePlan {
  const plan: ReminderOccurrenceMergePlan = {
    reassignIds: [],
    deleteAbsorbIds: [],
    deleteKeepIds: [],
    markSent: [],
    cancelOutboxIds: [],
  }
  const keepByKey = new Map(keep.map((occurrence) => [key(occurrence), occurrence]))

  for (const absorbed of absorb) {
    const kept = keepByKey.get(key(absorbed))
    if (!kept) {
      plan.reassignIds.push(absorbed.id)
      continue
    }

    const keptSent = kept.status === "sent"
    const absorbedSent = absorbed.status === "sent"
    if (keptSent || absorbedSent) {
      // Sent precedence: a delivered reminder is never re-created under the kept id.
      if (!keptSent && absorbedSent) {
        plan.markSent.push({ id: kept.id, sentAt: absorbed.sentAt, outboxId: absorbed.outboxId })
      }
      plan.deleteAbsorbIds.push(absorbed.id)
      // The surviving row is sent; any unsent outbox row on either side is superseded.
      if (!absorbedSent && absorbed.outboxId) plan.cancelOutboxIds.push(absorbed.outboxId)
      if (!keptSent && kept.outboxId) plan.cancelOutboxIds.push(kept.outboxId)
      continue
    }

    if (kept.status === "queued") {
      // The kept record's email is already enqueued: keep its row, cancel the absorbed one.
      plan.deleteAbsorbIds.push(absorbed.id)
      if (absorbed.outboxId) plan.cancelOutboxIds.push(absorbed.outboxId)
      continue
    }

    if (absorbed.status === "queued") {
      // Only the absorbed record's reminder is enqueued: make it the kept record's row.
      plan.deleteKeepIds.push(kept.id)
      if (kept.outboxId) plan.cancelOutboxIds.push(kept.outboxId)
      plan.reassignIds.push(absorbed.id)
      continue
    }

    // Neither sent nor queued: the kept record's row is as good as the absorbed one.
    plan.deleteAbsorbIds.push(absorbed.id)
    if (absorbed.outboxId) plan.cancelOutboxIds.push(absorbed.outboxId)
  }

  plan.cancelOutboxIds = [...new Set(plan.cancelOutboxIds)]
  return plan
}
