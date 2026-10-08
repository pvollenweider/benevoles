// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { prisma } from "@/lib/prisma"
import { countBy, cumulativeRows, currentRows, type UsageRow } from "@/lib/usage-counters"

/**
 * Queries behind the super admin statistics (#805). Server only: client components get the rows
 * from src/lib/usage-counters.ts, never this module (it imports Prisma).
 */

export async function loadPlatformUsage(): Promise<{ cumulative: UsageRow[]; current: UsageRow[] }> {
  const [counters, orgs, admins, members, events, sectorLeaders] = await Promise.all([
    prisma.platformCounter.findMany(),
    prisma.organization.groupBy({ by: ["active"], _count: { _all: true } }),
    prisma.adminUser.groupBy({ by: ["role"], where: { isActive: true }, _count: { _all: true } }),
    prisma.volunteer.groupBy({ by: ["active"], where: { organizationId: { not: null } }, _count: { _all: true } }),
    prisma.event.groupBy({ by: ["publicStatus"], _count: { _all: true } }),
    prisma.sectorLeader.count(),
  ])
  const flag = (groups: { active: boolean; _count: { _all: number } }[]) =>
    countBy(groups.map((g) => ({ key: String(g.active), count: g._count._all })), { active: ["true"], inactive: ["false"] } as const)
  const roles = countBy(admins.map((g) => ({ key: g.role, count: g._count._all })), { owners: ["admin"], organizers: ["organizer"], superAdmins: ["super_admin"] } as const)
  const statuses = countBy(events.map((g) => ({ key: g.publicStatus, count: g._count._all })), { draft: ["draft"], published: ["published"], archived: ["archived"] } as const)

  return {
    cumulative: cumulativeRows(counters, "platform"),
    current: currentRows({ organizations: flag(orgs), admins: roles, sectorLeaders, members: flag(members), events: statuses }),
  }
}

/** An organisation's cumulative counters (its current counts are already on its detail page). */
export async function loadOrganizationCumulative(organizationId: string): Promise<UsageRow[]> {
  const counters = await prisma.organizationCounter.findMany({ where: { organizationId }, select: { metric: true, value: true } })
  return cumulativeRows(counters, "organization")
}
