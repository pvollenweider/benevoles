// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { NextResponse } from "next/server"
import { requireOrgSession } from "@/lib/auth-guard"
import { adminActor, logOrgEvent } from "@/lib/org-log"
import { z } from "zod"
import { validationError } from "@/lib/api-error"
import { ORG_ROLES } from "@/lib/permissions"
import { changeAdminRole, removeOrgAdmin } from "@/lib/admin-team-changes"

const patchSchema = z.object({ role: z.enum(ORG_ROLES) })

/**
 * Changes an admin's level (#469), owners only. The organisation keeps at least one active owner,
 * checked and written under a lock (src/lib/admin-team-changes.ts); the change applies to the
 * person's open sessions on their next request (the session re-reads the role, see admin-session.ts).
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireOrgSession("owner")
  if (guard instanceof NextResponse) return guard
  const { organizationId, session } = guard
  const { id } = await params

  const parsed = patchSchema.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) return validationError(parsed.error)
  const { role } = parsed.data

  const result = await changeAdminRole(organizationId, id, role)
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
  if (result.changed) {
    await logOrgEvent({
      organizationId,
      actor: adminActor(session),
      action: "adminuser.role_changed",
      entityType: "AdminUser",
      entityId: id,
      changes: { role: { from: result.from, to: role } },
    })
  }
  return NextResponse.json({ id, role })
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireOrgSession("owner")
  if (guard instanceof NextResponse) return guard
  const { organizationId, session } = guard
  const { id } = await params

  // Never oneself, never the last active admin, and the organisation always keeps an active owner (#469).
  const result = await removeOrgAdmin(organizationId, id, session.user?.email)
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })

  await logOrgEvent({
    organizationId,
    actor: adminActor(session),
    action: "adminuser.removed",
    entityType: "AdminUser",
    entityId: id,
  })

  return NextResponse.json({ success: true })
}
