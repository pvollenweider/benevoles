// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import type { Prisma } from "@/generated/prisma/client"
import { isExpiredInvitation, isReleasableInvitation, type AdminEmailHolder } from "@/lib/admin-invitation"

/**
 * Database side of the expired-invitation rule (#1053, src/lib/admin-invitation.ts): finding the
 * account holding an address, and replacing it when it is an invitation whose link has expired.
 * Server only. Runs on the caller's transaction, so the replacement and the new account commit
 * together or not at all.
 */

type AdminUserDb = { adminUser: Pick<Prisma.TransactionClient["adminUser"], "findFirst" | "count" | "deleteMany"> }

export type AdminEmailHolderRow = AdminEmailHolder & { id: string }

/**
 * The account holding this address, compared like the case-insensitive unique index, and whether
 * its organisation has an active administrator (only looked up for an expired invitation).
 */
export async function findAdminEmailHolder(db: AdminUserDb, email: string, now: Date = new Date()): Promise<AdminEmailHolderRow | null> {
  const row = await db.adminUser.findFirst({
    where: { email: { equals: email.trim(), mode: "insensitive" } },
    select: { id: true, organizationId: true, isActive: true, setupTokenHash: true, setupTokenExpiresAt: true },
  })
  if (!row) return null
  const expired = isExpiredInvitation({ ...row, organizationHasActiveAdmin: false }, now)
  const organizationHasActiveAdmin = expired && row.organizationId != null
    ? (await db.adminUser.count({ where: { organizationId: row.organizationId, isActive: true } })) > 0
    : false
  return { ...row, organizationHasActiveAdmin }
}

/**
 * Deletes the row only if it is a replaceable invitation (src/lib/admin-invitation.ts) and still
 * the same expired, never-activated one as when it was read: an activation or a new link sent
 * meanwhile keeps it. Whether it was deleted; the caller treats false as a conflict and creates
 * nothing.
 */
export async function releaseExpiredInvitation(db: AdminUserDb, row: AdminEmailHolderRow, now: Date): Promise<boolean> {
  if (!isReleasableInvitation(row, now)) return false
  const { count } = await db.adminUser.deleteMany({
    where: {
      id: row.id,
      isActive: false,
      setupTokenHash: row.setupTokenHash,
      setupTokenExpiresAt: { lt: now },
    },
  })
  return count === 1
}
