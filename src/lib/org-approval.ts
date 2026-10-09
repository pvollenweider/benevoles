// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * What an organisation awaiting the operator's validation may do (#810). Two separate grants,
 * not one « validated » flag, so a later risk-based validation can give them one by one:
 * - `publicationApprovedAt`: its events can be published and its public pages answer;
 * - `outboundEmailApprovedAt`: it can email anyone; until then, only its own administrator
 *   accounts (verified at sign-up), for tests and its own notifications.
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

export const PUBLICATION_PENDING_ERROR =
  "Votre espace est en attente de validation : la publication sera possible dès qu'il sera activé. Vous recevrez un email."

/** Whether a pending organisation may email this address: only one of its own **active** administrator accounts (the caller passes those only). */
export function pendingRecipientAllowed(recipientEmail: string | null | undefined, adminEmails: readonly string[]): boolean {
  if (!recipientEmail) return false
  const r = recipientEmail.trim().toLowerCase()
  return adminEmails.some((e) => e.trim().toLowerCase() === r)
}
