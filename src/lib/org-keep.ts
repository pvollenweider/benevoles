// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * « Conserver mon organisation » (#811): the link of the periodic check's emails. It gives access
 * to no data; it only records that the space is wanted, which stops the procedure and starts the
 * 18 months over. Pure, Prisma-free.
 */

export const INVALID_KEEP_LINK = "Ce lien a expiré ou a déjà servi."

/** Whether a stored link still works: before expiry, for a space still active and not suspended. */
export function keepLinkValid(
  link: { expiresAt: Date; organization: { active: boolean; suspendedAt: Date | null } },
  now: Date,
): boolean {
  return link.expiresAt > now && link.organization.active && link.organization.suspendedAt === null
}

/** What the confirmation writes: confirmed today, procedure stopped. */
export function keepUpdate(now: Date) {
  return { lastRetentionConfirmedAt: now, inactivityNoticeAt: null, inactivityEmailsSent: 0 }
}
