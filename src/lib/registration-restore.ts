// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { guardShiftPlacement, type ShiftOverrideNeed } from "./shift-override"

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
  | { ok: false; reason: "not_cancelled" | "not_restorable" | "shift_cancelled" | "started"; message: string }

/**
 * Whether a cancelled registration can be put back, and as what. Only a confirmed place or a
 * pending request: a waitlist entry or a refused offer held no place to give back. Only before
 * the shift starts, on a shift still held. A full or closed shift is the organiser's call
 * (AUTHZ-15): the restore then needs their confirmation (src/lib/shift-override.ts), judged by the
 * caller under the shift lock.
 */
export function planRestore(input: RestoreInput): RestorePlan {
  if (input.status !== "cancelled") return { ok: false, reason: "not_cancelled", message: "Cette inscription n'est pas annulée." }
  if (input.previousStatus !== "active" && input.previousStatus !== "requested") {
    return { ok: false, reason: "not_restorable", message: "Seule une place confirmée ou une demande annulée peut être rétablie." }
  }
  if (input.shiftStatus === "cancelled") return { ok: false, reason: "shift_cancelled", message: "Ce créneau est annulé. Rouvrez d'abord le créneau\u00a0: rien n'a été fait." }
  if (input.now.getTime() >= input.shiftStart.getTime()) return { ok: false, reason: "started", message: "Ce créneau a déjà commencé." }
  return { ok: true, status: input.previousStatus }
}

/** The status a cancellation log entry recorded as « from », if any. */
export function cancelledFrom(changes: unknown): string | null {
  const from = (changes as { status?: { from?: unknown } } | null)?.status?.from
  return typeof from === "string" ? from : null
}

/** A cancelled registration as the page reads it, before the rules are applied. */
export type CancelledRegistration = {
  id: string
  volunteerId: string
  shiftId: string
  volunteerName: string
  hasEmail: boolean
  /** The shift, spoken: « Bar, samedi 4 juillet, de 10h à 12h ». */
  shift: string
  /** The shift's name and hours, for the confirmation on a full or closed shift (AUTHZ-15). */
  shiftParts?: { roleName: string; label: string; date: string; startTime: string; endTime: string }
  shiftStatus: string
  shiftStart: Date
  capacity: number
  occupied: number
  /** The person signed up again on this shift since: a restore would make two. */
  liveAgainOnShift: boolean
  /** The latest « registration.cancelled » entry: who, when, from what. */
  cancellation: { actorType: string; at: Date; changes: unknown } | null
}

export type RecentCancellation = {
  id: string
  /** The person and the shift (#1146, lot B): their availability is read when « Rétablir » opens. */
  volunteerId: string
  shiftId: string
  volunteerName: string
  hasEmail: boolean
  shift: string
  previousStatus: RestoredStatus
  /** « par la personne » or « par l'organisation », with the date. */
  cancelled: string
  /** Null when « Rétablir » can be offered; otherwise why not, shown in its place. */
  blocked: string | null
  /**
   * The shift is full or closed (AUTHZ-15): « Rétablir » stays offered, its dialog says so and the
   * confirmation's key goes with it. Null otherwise.
   */
  override?: (ShiftOverrideNeed & { roleName: string; label: string; date: string; startTime: string; endTime: string }) | null
}

const BY: Record<string, string> = { volunteer: "par la personne", admin: "par l'organisation" }

/**
 * The « Annulations récentes » list (#809): cancelled places and requests on shifts that haven't
 * started, the latest cancellation first. What could never be restored (a waitlist entry, a
 * started or cancelled shift, a row cancelled before the log existed) is left out; what can't be
 * restored right now (signed up again) stays, with the reason. A full or closed shift keeps its
 * button, with the confirmation it needs (AUTHZ-15).
 */
export function recentCancellations(rows: CancelledRegistration[], now: Date, timeZone: string): RecentCancellation[] {
  const out: { at: number; row: RecentCancellation }[] = []
  for (const r of rows) {
    if (!r.cancellation) continue
    const plan = planRestore({
      status: "cancelled",
      previousStatus: cancelledFrom(r.cancellation.changes),
      shiftStatus: r.shiftStatus,
      shiftStart: r.shiftStart,
      capacity: r.capacity,
      occupied: r.occupied,
      now,
    })
    if (!plan.ok) continue
    const guard = guardShiftPlacement("restore", r.id, { id: r.shiftId, status: r.shiftStatus, capacity: r.capacity, occupied: r.occupied })
    const day = r.cancellation.at.toLocaleDateString("fr-FR", { timeZone, day: "numeric", month: "long" })
    const time = r.cancellation.at.toLocaleTimeString("fr-FR", { timeZone, hour: "2-digit", minute: "2-digit" })
    out.push({ at: r.cancellation.at.getTime(), row: {
      id: r.id,
      volunteerId: r.volunteerId,
      shiftId: r.shiftId,
      volunteerName: r.volunteerName,
      hasEmail: r.hasEmail,
      shift: r.shift,
      previousStatus: cancelledFrom(r.cancellation.changes) as RestoredStatus,
      cancelled: `Annulée ${BY[r.cancellation.actorType] ?? ""} le ${day} à ${time}`.replace("  ", " "),
      blocked: r.liveAgainOnShift ? "Cette personne a une autre inscription en cours sur ce créneau." : null,
      override: guard.kind === "confirm" && r.shiftParts ? { ...guard.need, ...r.shiftParts } : null,
    } })
  }
  return out.sort((a, b) => b.at - a.at).map((e) => e.row)
}
