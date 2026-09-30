// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { NextResponse } from "next/server"
import { requireOrgSession } from "@/lib/auth-guard"
// AdminUser isn't tenant-scoped; ownership is checked by organizationId explicitly before the delete.
// eslint-disable-next-line no-restricted-imports
import { prisma } from "@/lib/prisma"
import { adminActor, logOrgEvent } from "@/lib/org-log"
import { z } from "zod"
import { validationError } from "@/lib/api-error"
import { isOwnerRole, lastOwnerProblem, ORG_ROLES, OWNER_ROLE } from "@/lib/permissions"

const patchSchema = z.object({ role: z.enum(ORG_ROLES) })

/**
 * Changes an admin's level (#469), owners only. The organisation keeps at least one active owner;
 * the change applies to the person's open sessions on their next request (the session re-reads
 * the role, see admin-session.ts).
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireOrgSession("owner")
  if (guard instanceof NextResponse) return guard
  const { db, organizationId, session } = guard
  const { id } = await params

  const parsed = patchSchema.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) return validationError(parsed.error)
  const { role } = parsed.data

  const target = await db.adminUser.findFirst({ where: { id, organizationId }, select: { id: true, role: true, isActive: true } })
  if (!target) return NextResponse.json({ error: "Admin introuvable." }, { status: 404 })
  if (target.role === role) return NextResponse.json({ id, role })

  const owners = await db.adminUser.count({ where: { organizationId, isActive: true, role: OWNER_ROLE } })
  const problem = lastOwnerProblem({ targetIsActiveOwner: target.isActive && isOwnerRole(target.role), nextRole: role, owners })
  if (problem) return NextResponse.json({ error: problem }, { status: 400 })

  await prisma.adminUser.update({ where: { id }, data: { role } })
  await logOrgEvent({
    organizationId,
    actor: adminActor(session),
    action: "adminuser.role_changed",
    entityType: "AdminUser",
    entityId: id,
    changes: { role: { from: target.role, to: role } },
  })
  return NextResponse.json({ id, role })
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireOrgSession("owner")
  if (guard instanceof NextResponse) return guard
  const { db, organizationId, session } = guard

  const { id } = await params

  const target = await db.adminUser.findFirst({ where: { id, organizationId } })
  if (!target) return NextResponse.json({ error: "Admin introuvable." }, { status: 404 })

  if (target.email === session.user?.email) {
    return NextResponse.json({ error: "Vous ne pouvez pas vous retirer vous-même." }, { status: 400 })
  }

  const activeCount = await db.adminUser.count({ where: { organizationId, isActive: true } })
  if (target.isActive && activeCount <= 1) {
    return NextResponse.json({ error: "Impossible de retirer le dernier admin actif." }, { status: 400 })
  }
  // The organisation always keeps an active owner (#469).
  const owners = await db.adminUser.count({ where: { organizationId, isActive: true, role: OWNER_ROLE } })
  const ownerProblem = lastOwnerProblem({ targetIsActiveOwner: target.isActive && isOwnerRole(target.role), nextRole: null, owners })
  if (ownerProblem) return NextResponse.json({ error: ownerProblem }, { status: 400 })

  await prisma.adminUser.delete({ where: { id } })

  await logOrgEvent({
    organizationId,
    actor: adminActor(session),
    action: "adminuser.removed",
    entityType: "AdminUser",
    entityId: id,
  })

  return NextResponse.json({ success: true })
}
