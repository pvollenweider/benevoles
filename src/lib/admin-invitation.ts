// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * When an admin address is free again (#1053). `AdminUser.email` is unique across the platform,
 * and an invitation is an inactive account until its link is used: without this rule, an
 * invitation nobody accepted kept the address until the nightly cleanup, blocking the person's
 * own sign-up or their organisation's invitation.
 *
 * An invitation to join a team, never activated, whose 7-day link has expired no longer holds the
 * address: an invitation or a sign-up for it replaces that row (src/lib/admin-invitation-server.ts).
 * Only when the organisation already has an active administrator: the first account of a space
 * (sign-up owner, account created by the operator) is kept, since the operator can still send it a
 * new link and the space would otherwise lose its only account. Active accounts and invitations
 * still valid are never touched. Pure and Prisma-free.
 */

export type AdminEmailHolder = {
  organizationId: string | null
  isActive: boolean
  role: string
  setupTokenHash: string | null
  setupTokenExpiresAt: Date | null
  /** Whether the row's organisation has at least one active administrator. */
  organizationHasActiveAdmin: boolean
}

/**
 * Whether the account is still the invitation it was created as: never activated, and therefore
 * still carrying its setup link. accept-invite clears both token fields and sets `isActive` in one
 * statement, so an inactive account with no setup token is one that was activated and later
 * deactivated, not a pending invitation (#1142).
 */
export function isNeverActivated(row: Pick<AdminEmailHolder, "isActive" | "setupTokenHash" | "setupTokenExpiresAt">): boolean {
  return !row.isActive && row.setupTokenHash != null && row.setupTokenExpiresAt != null
}

/**
 * The same "never activated" state as a Prisma `where` fragment, for a conditional write that must
 * not install a setup token on an account activated meanwhile (#1142). Kept next to the predicate
 * it mirrors, and next to the super-admin resend's own fragment.
 */
export const NEVER_ACTIVATED_WHERE: { isActive: false; setupTokenHash: { not: null }; setupTokenExpiresAt: { not: null } } = {
  isActive: false,
  setupTokenHash: { not: null },
  setupTokenExpiresAt: { not: null },
}

/**
 * Never activated and its setup link expired. An activated account has no setup token (cleared
 * by accept-invite) and is never made inactive again (admins are removed, not deactivated).
 */
export function isExpiredInvitation(row: AdminEmailHolder, now: Date): boolean {
  return isNeverActivated(row) && row.setupTokenExpiresAt!.getTime() < now.getTime()
}

/**
 * How long after its expiry an invitation stays untouchable: an activation whose link was checked
 * just before the expiry (then the password hashed, then the account updated) always finishes
 * first, so a replacement never deletes an account being activated.
 */
export const INVITATION_RELEASE_GRACE_MS = 60 * 60 * 1000

/** The instant before which an expired invitation may be replaced. */
export function invitationReleaseCutoff(now: Date): Date {
  return new Date(now.getTime() - INVITATION_RELEASE_GRACE_MS)
}

/**
 * An invitation into a team that already has an active administrator, expired for more than the
 * grace period: replaceable.
 */
export function isReleasableInvitation(row: AdminEmailHolder, now: Date): boolean {
  return row.organizationHasActiveAdmin && isExpiredInvitation(row, invitationReleaseCutoff(now))
}

/** Same organisation: the person already appears in its own team list. */
export const ADMIN_INVITE_SAME_ORG_ERROR = "Cette adresse fait déjà partie de votre équipe, ou son invitation est encore valable."
/**
 * Invitations an organisation may send per day: every authorised attempt counts, sent or not, so the
 * budget also bounds attempts on addresses that receive nothing (an address held elsewhere gets the
 * same answer as a sent invitation).
 */
export const ADMIN_INVITES_PER_DAY = 20

export type AdminInviteCheck = "free" | "replace" | "same_org" | "unavailable"

/** What an owner's invitation does with the account already holding the address, if any. */
export function adminInviteCheck(holder: AdminEmailHolder | null, organizationId: string, now: Date): AdminInviteCheck {
  if (!holder) return "free"
  if (isReleasableInvitation(holder, now)) return "replace"
  return holder.organizationId === organizationId ? "same_org" : "unavailable"
}
