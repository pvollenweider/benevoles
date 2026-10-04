// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import type { OrgScopedPrisma } from "./prisma-org"
import type { ActivitySources } from "./member-activity"

/**
 * The sources of a member's chronology (#488), all through the organisation-scoped client, so a
 * member of another organisation is simply not found. Sector leaders are matched by email, as
 * everywhere else (case-insensitive).
 */
export async function loadMemberActivity(db: OrgScopedPrisma, volunteerId: string): Promise<{ member: { id: string; firstName: string; lastName: string; email: string | null; active: boolean }; sources: ActivitySources } | null> {
  const member = await db.volunteer.findFirst({ where: { id: volunteerId }, select: { id: true, firstName: true, lastName: true, email: true, active: true } })
  if (!member) return null
  const event = { select: { id: true, title: true } }
  const [invites, registrations, leaders, orgLog] = await Promise.all([
    db.memberInvite.findMany({ where: { volunteerId }, select: { sentAt: true, usedAt: true, declinedAt: true, event } }),
    db.registration.findMany({ where: { volunteerId }, select: { createdAt: true, updatedAt: true, status: true, checkedInAt: true, shift: { select: { roleName: true, label: true, date: true } }, event } }),
    member.email
      ? db.sectorLeader.findMany({ where: { email: { equals: member.email, mode: "insensitive" } }, select: { createdAt: true, roleName: true, event } })
      : Promise.resolve([]),
    db.orgLog.findMany({ where: { entityType: "Member", entityId: volunteerId }, select: { createdAt: true, action: true } }),
  ])
  return { member, sources: { invites, registrations, leaders, orgLog } }
}
