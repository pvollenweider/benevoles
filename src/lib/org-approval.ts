// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * What an organisation awaiting the operator's validation may do (#810). Two separate grants,
 * not one « validated » flag, so a later risk-based validation can give them one by one:
 * - `publicationApprovedAt`: its events can be published and its public pages answer;
 * - `outboundEmailApprovedAt`: it can email anyone, and invite more administrators; until then,
 *   only its own owner account created by the sign-up confirmation, once active (address proved
 *   by the emailed confirmation link, `signupOwnerEmails`, #1045), for tests and its notifications.
 * Preparing everything else (events, shifts, members, preview) needs neither.
 *
 * Both are granted by default at creation (database default): every path that creates an
 * organisation (super admin, seeds, scripts) keeps a usable one; only the self-service sign-up
 * sets both to null. Pure and Prisma-free.
 */

export type OrgApprovals = { publicationApprovedAt: Date | string | null; outboundEmailApprovedAt: Date | string | null }

export function canPublish(org: Pick<OrgApprovals, "publicationApprovedAt">): boolean {
  return !!org.publicationApprovedAt
}

export function canEmailThirdParties(org: Pick<OrgApprovals, "outboundEmailApprovedAt">): boolean {
  return !!org.outboundEmailApprovedAt
}

/** Prisma filter of an organisation whose public pages may answer: active and allowed to publish. */
export const PUBLIC_ORG_WHERE = { active: true, publicationApprovedAt: { not: null } } as const

/** Shown when a space awaiting validation asks for the publication (#810), with no promised delay. */
export const PUBLICATION_REQUESTED_MESSAGE =
  "Votre espace est prêt ! Vous pouvez immédiatement préparer votre événement. Sa publication et l'envoi d'invitations seront possibles après une courte vérification de votre inscription. Vous recevrez un email dès que votre espace sera activé."

export const PUBLICATION_PENDING_ERROR =
  "Votre espace est en attente de validation : la publication sera possible dès qu'il sera activé. Vous recevrez un email."

/**
 * Whether a pending organisation may email this address: only one of the addresses the caller
 * passes, its active owner account created by the sign-up (`signupOwnerEmails`, #1045).
 */
export function pendingRecipientAllowed(recipientEmail: string | null | undefined, adminEmails: readonly string[]): boolean {
  if (!recipientEmail) return false
  const r = recipientEmail.trim().toLowerCase()
  return adminEmails.some((e) => e.trim().toLowerCase() === r)
}

/**
 * How close to the organisation an account must have been created to be its sign-up owner: both
 * are written by the same transaction of the sign-up confirmation (src/lib/signup-server.ts).
 */
export const SIGNUP_OWNER_WINDOW_MS = 10_000

/**
 * The addresses a pending organisation may email (#1045): its accounts created together with it,
 * by the sign-up confirmation, whose emailed link proved the address. Never an account added
 * later, even active: activating an invitation never proved the address, since the owner who
 * issued it used to see its link. Since a pending organisation can no longer invite anyone, only
 * accounts invited before this rule can be in that case. Pure.
 */
export function signupOwnerEmails(orgCreatedAt: Date | string, admins: readonly { email: string; createdAt: Date | string }[]): string[] {
  const created = new Date(orgCreatedAt).getTime()
  return admins.filter((a) => Math.abs(new Date(a.createdAt).getTime() - created) <= SIGNUP_OWNER_WINDOW_MS).map((a) => a.email)
}

/**
 * Inviting another administrator waits for the outbound email approval (#1045): the invitation
 * email could not reach a third-party address before it anyway, and the setup link is never shown
 * to the owner, so a pending space has no way to bring in an address it does not control.
 */
export function canInviteAdmins(org: Pick<OrgApprovals, "outboundEmailApprovedAt">): boolean {
  return canEmailThirdParties(org)
}

export const ADMIN_INVITE_PENDING_ERROR =
  "Votre espace est en attente de validation. Vous pourrez inviter d'autres organisateurs une fois qu'il sera validé ; vous recevrez un email."
