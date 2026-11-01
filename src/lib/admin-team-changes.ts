// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

// AdminUser isn't tenant-scoped: every read and write below is filtered by organizationId.
import { prisma } from "./prisma"
import { isOwnerRole, lastOwnerProblem, OWNER_ROLE, type OrgRole } from "./permissions"

/**
 * Changes to an organisation's team that can take away an owner (#469): a level change and a
 * removal. The organisation keeps at least one active owner, and two owners acting at the same
 * moment (each demoting or removing the other) must not both pass that check: each change locks
 * the organisation's row first, then reads the target and counts the owners, then writes, all in
 * one transaction. The second change waits for the first to commit and counts what it left.
 */

export type TeamChangeRefusal = { ok: false; status: 400 | 404; error: string }

export type RoleChangeResult = { ok: true; from: string; changed: boolean } | TeamChangeRefusal
export type RemovalResult = { ok: true } | TeamChangeRefusal

export const ADMIN_NOT_FOUND = "Admin introuvable."
export const CANNOT_REMOVE_SELF = "Vous ne pouvez pas vous retirer vous-même."
export const LAST_ACTIVE_ADMIN = "Impossible de retirer le dernier organisateur actif."

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Tx = any

async function lockOrganization(tx: Tx, organizationId: string): Promise<void> {
  await tx.$queryRaw`SELECT 1 FROM "Organization" WHERE "id" = ${organizationId} FOR UPDATE`
}

const countOwners = (tx: Tx, organizationId: string): Promise<number> =>
  tx.adminUser.count({ where: { organizationId, isActive: true, role: OWNER_ROLE } })

export async function changeAdminRole(
  organizationId: string,
  id: string,
  role: OrgRole,
): Promise<RoleChangeResult> {
  return prisma.$transaction(async (tx: Tx): Promise<RoleChangeResult> => {
    await lockOrganization(tx, organizationId)
    const target = await tx.adminUser.findFirst({ where: { id, organizationId }, select: { id: true, role: true, isActive: true } })
    if (!target) return { ok: false, status: 404, error: ADMIN_NOT_FOUND }
    if (target.role === role) return { ok: true, from: target.role, changed: false }
    const problem = lastOwnerProblem({ targetIsActiveOwner: target.isActive && isOwnerRole(target.role), nextRole: role, owners: await countOwners(tx, organizationId) })
    if (problem) return { ok: false, status: 400, error: problem }
    await tx.adminUser.update({ where: { id }, data: { role } })
    return { ok: true, from: target.role, changed: true }
  })
}

export async function removeOrgAdmin(
  organizationId: string,
  id: string,
  actorEmail: string | null | undefined,
): Promise<RemovalResult> {
  return prisma.$transaction(async (tx: Tx): Promise<RemovalResult> => {
    await lockOrganization(tx, organizationId)
    const target = await tx.adminUser.findFirst({ where: { id, organizationId }, select: { id: true, email: true, role: true, isActive: true } })
    if (!target) return { ok: false, status: 404, error: ADMIN_NOT_FOUND }
    if (actorEmail && target.email === actorEmail) return { ok: false, status: 400, error: CANNOT_REMOVE_SELF }
    if (target.isActive && (await tx.adminUser.count({ where: { organizationId, isActive: true } })) <= 1) {
      return { ok: false, status: 400, error: LAST_ACTIVE_ADMIN }
    }
    const problem = lastOwnerProblem({ targetIsActiveOwner: target.isActive && isOwnerRole(target.role), nextRole: null, owners: await countOwners(tx, organizationId) })
    if (problem) return { ok: false, status: 400, error: problem }
    await tx.adminUser.delete({ where: { id } })
    return { ok: true }
  })
}
