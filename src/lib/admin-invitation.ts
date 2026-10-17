// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * When an admin address is free again (#1053). `AdminUser.email` is unique across the platform,
 * and an invitation is an inactive account until its link is used: without this rule, an
 * invitation nobody accepted kept the address until the nightly cleanup, blocking the person's
 * own sign-up or their organisation's invitation.
 *
 * An invitation whose 7-day link has expired, never activated, no longer holds the address: an
 * invitation or a sign-up for it replaces that row (src/lib/admin-invitation-server.ts). Active
 * accounts and invitations still valid are never touched. Pure and Prisma-free.
 */

export type AdminEmailHolder = {
  organizationId: string | null
  isActive: boolean
  setupTokenHash: string | null
  setupTokenExpiresAt: Date | null
}

/**
 * Never activated and its setup link expired. An activated account has no setup token (cleared
 * by accept-invite) and is never made inactive again (admins are removed, not deactivated).
 */
export function isExpiredInvitation(row: AdminEmailHolder, now: Date): boolean {
  return !row.isActive && row.setupTokenHash != null && row.setupTokenExpiresAt != null && row.setupTokenExpiresAt.getTime() < now.getTime()
}

/** Same organisation: the person already appears in its own team list. */
export const ADMIN_INVITE_SAME_ORG_ERROR = "Cette adresse fait déjà partie de votre équipe, ou son invitation est encore valable."
/** Any other holder: says nothing about where the address is used. */
export const ADMIN_INVITE_UNAVAILABLE_ERROR = "Impossible d'inviter cette adresse pour le moment."

export type AdminInviteCheck = "free" | "replace" | "same_org" | "unavailable"

/** What an owner's invitation does with the account already holding the address, if any. */
export function adminInviteCheck(holder: AdminEmailHolder | null, organizationId: string, now: Date): AdminInviteCheck {
  if (!holder) return "free"
  if (isExpiredInvitation(holder, now)) return "replace"
  return holder.organizationId === organizationId ? "same_org" : "unavailable"
}
