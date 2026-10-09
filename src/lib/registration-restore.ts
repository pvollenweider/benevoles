// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * « Rétablir » a cancelled registration (#809): an organiser puts back a place cancelled by
 * mistake, or from a personal link that was in someone else's hands. Pure rules, shared by the
 * route and the admin list that shows the button.
 */

/** What a registration can be restored to: what it was before the cancellation. */
export type RestoredStatus = "active" | "requested"

export type RestoreInput = {
  status: string
  /** The status before the cancellation, from the latest « registration.cancelled » log entry. */
  previousStatus: string | null
  shiftStatus: string
  /** When the shift starts, in UTC (organisation time zone applied). */
  shiftStart: Date
  capacity: number
  /** Registrations holding a spot on the shift (OCCUPYING_STATUSES), read under lock. */
  occupied: number
  now: Date
}

export type RestorePlan =
  | { ok: true; status: RestoredStatus }
  | { ok: false; reason: "not_cancelled" | "not_restorable" | "shift_cancelled" | "started" | "full"; message: string }

/**
 * Whether a cancelled registration can be put back, and as what. Only a confirmed place or a
 * pending request: a waitlist entry or a refused offer held no place to give back. Only before
 * the shift starts, on a shift still held, with a free spot: restoring never overbooks.
 */
export function planRestore(input: RestoreInput): RestorePlan {
  if (input.status !== "cancelled") return { ok: false, reason: "not_cancelled", message: "Cette inscription n'est pas annulée." }
  if (input.previousStatus !== "active" && input.previousStatus !== "requested") {
    return { ok: false, reason: "not_restorable", message: "Seule une place confirmée ou une demande annulée peut être rétablie." }
  }
  if (input.shiftStatus === "cancelled") return { ok: false, reason: "shift_cancelled", message: "Ce créneau est annulé." }
  if (input.now.getTime() >= input.shiftStart.getTime()) return { ok: false, reason: "started", message: "Ce créneau a déjà commencé." }
  if (input.occupied >= input.capacity) return { ok: false, reason: "full", message: "Ce créneau est complet : la place a été reprise." }
  return { ok: true, status: input.previousStatus }
}

/** The status a cancellation log entry recorded as « from », if any. */
export function cancelledFrom(changes: unknown): string | null {
  const from = (changes as { status?: { from?: unknown } } | null)?.status?.from
  return typeof from === "string" ? from : null
}
