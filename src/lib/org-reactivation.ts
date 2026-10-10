// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * « Réactiver mon espace » (#811): an administrator of a space deactivated for lack of activity
 * reactivates it alone, from the sign-in page, with a single-use link sent to their address. Never
 * for a space deactivated or suspended by the operator: those go through the operator only.
 * Pure, Prisma-free.
 */

/** How long the emailed link works. */
export const REACTIVATION_LINK_HOURS = 24

/** What the link page and the API say when a link can't be used. */
export const INVALID_REACTIVATION_LINK = "Ce lien a expiré ou a déjà servi. Demandez-en un nouveau."

type OrgState = { active: boolean; suspendedAt: Date | null; inactivityDeactivatedAt: Date | null }

/** Whether the space's own administrators may reactivate it. */
export function canSelfReactivate(org: OrgState | null | undefined): boolean {
  return !!org && !org.active && org.suspendedAt === null && org.inactivityDeactivatedAt !== null
}

/** Whether a stored link still works: an active account, before expiry, for a space it can reactivate. */
export function reactivationLinkValid(
  admin: { isActive: boolean; orgReactivationExpiresAt: Date | null; organization: OrgState | null },
  now: Date,
): boolean {
  return admin.isActive && admin.orgReactivationExpiresAt !== null && admin.orgReactivationExpiresAt > now && canSelfReactivate(admin.organization)
}

/**
 * What a reactivation writes: active again, no longer marked as deactivated for inactivity, and
 * counted as a confirmation that the space is wanted, so the check starts over from today.
 */
export function reactivationUpdate(now: Date) {
  return { active: true, inactivityDeactivatedAt: null, lastRetentionConfirmedAt: now }
}
