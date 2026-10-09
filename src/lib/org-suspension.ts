// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Suspension of an organisation for abuse (#810): a state of its own, distinct from a plain
 * deactivation and from the future deactivation for inactivity (#811).
 *
 * A suspended organisation is also inactive (`active: false`), so every existing guard applies at
 * once: no sign-in, no public page, no registration, no email or push (#814, its queued emails
 * cancelled in the same transaction). On top of that:
 * - it is never reactivated by « Réactiver » (here) nor by any self-service flow (#811): the
 *   suspension has to be lifted explicitly first, by the super admin;
 * - it is never erased by the nightly cleanup (data kept for the investigation): only the super
 *   admin's explicit deletion removes it.
 *
 * Pure: the route applies the result. Prisma-free, OrgDetail and OrgsManager read the labels.
 */

export const SUSPENSION_REASON_MIN = 3
export const SUSPENSION_REASON_MAX = 500

export type OrgState = {
  active: boolean
  suspendedAt: Date | string | null
  /** #810: an active organisation missing a grant is awaiting validation. Absent = granted. */
  publicationApprovedAt?: Date | string | null
  outboundEmailApprovedAt?: Date | string | null
}

export type OrgStatus = "active" | "pending" | "inactive" | "suspended"

export function orgStatus(org: OrgState): OrgStatus {
  if (org.suspendedAt) return "suspended"
  if (!org.active) return "inactive"
  return org.publicationApprovedAt === null || org.outboundEmailApprovedAt === null ? "pending" : "active"
}

export const ORG_STATUS_LABELS: Record<OrgStatus, string> = {
  active: "Active",
  pending: "En attente de validation",
  inactive: "Désactivée",
  suspended: "Suspendue",
}

export type SuspensionRequest = { active?: boolean; suspended?: boolean; suspensionReason?: string }

export type SuspensionUpdate = { active?: boolean; suspendedAt?: Date | null; suspensionReason?: string | null }

export type SuspensionDecision =
  | { ok: true; update: SuspensionUpdate; event: "suspended" | "suspension_lifted" | null; cancelQueuedEmails: boolean }
  | { ok: false; status: 400 | 409; error: string }

/**
 * What a super admin's PATCH does to the state. `active` and `suspended` are never accepted
 * together: one action at a time, each with its own confirmation.
 */
export function decideSuspension(current: OrgState, req: SuspensionRequest, now: Date = new Date()): SuspensionDecision {
  if (req.suspended !== undefined && req.active !== undefined) {
    return { ok: false, status: 400, error: "Une seule action à la fois : suspendre ou (ré)activer." }
  }
  const suspended = !!current.suspendedAt

  if (req.suspended === true) {
    if (suspended) return { ok: false, status: 409, error: "Cette organisation est déjà suspendue." }
    const reason = (req.suspensionReason ?? "").trim()
    if (reason.length < SUSPENSION_REASON_MIN || reason.length > SUSPENSION_REASON_MAX) {
      return { ok: false, status: 400, error: `Indiquez la raison de la suspension (${SUSPENSION_REASON_MIN} à ${SUSPENSION_REASON_MAX} caractères).` }
    }
    return { ok: true, update: { active: false, suspendedAt: now, suspensionReason: reason }, event: "suspended", cancelQueuedEmails: true }
  }

  if (req.suspended === false) {
    if (!suspended) return { ok: false, status: 409, error: "Cette organisation n'est pas suspendue." }
    // Lifting the suspension does not reactivate: the organisation stays deactivated until the
    // super admin reactivates it, as a separate, deliberate step.
    return { ok: true, update: { suspendedAt: null, suspensionReason: null }, event: "suspension_lifted", cancelQueuedEmails: false }
  }

  if (req.active === true && suspended) {
    return { ok: false, status: 409, error: "Organisation suspendue : levez d'abord la suspension." }
  }
  if (req.active !== undefined) {
    return { ok: true, update: { active: req.active }, event: null, cancelQueuedEmails: req.active === false }
  }
  return { ok: true, update: {}, event: null, cancelQueuedEmails: false }
}
