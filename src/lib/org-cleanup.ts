// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import type { Prisma } from "@/generated/prisma/client"
import { abandonedSignupSpaceWhere, expiredDeactivatedOrgWhere } from "./org-review"

/**
 * The nightly cleanup's deletion of organisations (#486, #810). Server only.
 *
 * The organisations are read first, then deleted: between the two, one can be reactivated, or its
 * owner can activate it. So the delete applies the retention condition again, and everything that
 * follows (its administrators, the counts reported) is about the organisations it actually
 * removed, never the list read first. An organisation that stopped being due is left alone.
 */

type OrgFilter = Prisma.OrganizationWhereInput

async function deleteDueOrganizations(
  tx: Prisma.TransactionClient,
  due: OrgFilter,
  adminFilter: Prisma.AdminUserWhereInput,
): Promise<{ deletedOrgs: { count: number }; deletedOrgAdmins: { count: number } }> {
  const orgs = await tx.organization.findMany({ where: due, select: { id: true } })
  const orgIds = orgs.map((o) => o.id)
  if (orgIds.length === 0) return { deletedOrgs: { count: 0 }, deletedOrgAdmins: { count: 0 } }
  // Read before the delete: the organisation's deletion only SETs NULL their link.
  const admins = await tx.adminUser.findMany({ where: { ...adminFilter, organizationId: { in: orgIds } }, select: { id: true, organizationId: true } })
  const deletedOrgs = await tx.organization.deleteMany({ where: { AND: [{ id: { in: orgIds } }, due] } })
  if (deletedOrgs.count === 0) return { deletedOrgs, deletedOrgAdmins: { count: 0 } }
  let gone = new Set(orgIds)
  if (deletedOrgs.count < orgIds.length) {
    const left = await tx.organization.findMany({ where: { id: { in: orgIds } }, select: { id: true } })
    gone = new Set(orgIds.filter((id) => !left.some((o) => o.id === id)))
  }
  const adminIds = admins.filter((a) => a.organizationId && gone.has(a.organizationId)).map((a) => a.id)
  const deletedOrgAdmins = adminIds.length === 0 ? { count: 0 } : await tx.adminUser.deleteMany({ where: { id: { in: adminIds } } })
  return { deletedOrgs, deletedOrgAdmins }
}

/**
 * Deactivated organisations past their retention. Their administrators go with them, active ones
 * included (AdminUser.organizationId is only SET NULL, an active admin would outlive them).
 */
export function deleteExpiredDeactivatedOrgs(tx: Prisma.TransactionClient, orgCutoff: Date) {
  return deleteDueOrganizations(tx, expiredDeactivatedOrgWhere(orgCutoff), {})
}

/** Sign-up spaces never activated (#810), deleted with their inactive accounts. */
export function deleteAbandonedSignupSpaces(tx: Prisma.TransactionClient, adminCutoff: Date) {
  return deleteDueOrganizations(tx, abandonedSignupSpaceWhere(adminCutoff), { isActive: false })
}
