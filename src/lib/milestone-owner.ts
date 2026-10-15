// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Server side of a milestone's owner (#985): the check the milestone routes run before saving an
 * owner. The rule itself is pure, in src/lib/milestones.ts (also used by the client form).
 */
import { NextResponse } from "next/server"
import type { OrgScopedPrisma } from "./prisma-org"
import { eligibleOwnerWhere, isEligibleMilestoneOwner, MILESTONE_OWNER_UNAVAILABLE } from "./milestones"

/** What the routes return with a milestone: its owner's id and name, never the email. */
export const MILESTONE_OWNER_SELECT = { select: { id: true, name: true } } as const

/**
 * Null when `ownerId` is an active admin account of `organizationId`; otherwise the 422 answer.
 * AdminUser is not a tenant model of the org-scoped client: the organisation is filtered here
 * explicitly, and the row checked again (another organisation's id behaves like an unknown one).
 */
export async function checkMilestoneOwner(db: OrgScopedPrisma, organizationId: string, ownerId: string): Promise<NextResponse | null> {
  const candidate = await db.adminUser.findFirst({
    where: { id: ownerId, ...eligibleOwnerWhere(organizationId) },
    select: { organizationId: true, isActive: true },
  })
  if (isEligibleMilestoneOwner(candidate, organizationId)) return null
  return NextResponse.json({ error: MILESTONE_OWNER_UNAVAILABLE, field: "ownerId" }, { status: 422 })
}
