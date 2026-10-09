// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { prisma } from "@/lib/prisma"
import { countBy, cumulativeRows, currentRows, type UsageRow } from "@/lib/usage-counters"
import { INDICATOR_DAYS, UNUSED_AFTER_DAYS, type SignupFacts } from "@/lib/signup-indicators"
import { PENDING_ORG_WHERE } from "@/lib/org-review"
import { DAY_MS } from "@/lib/retention"

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

/** Adds one to a platform counter from the application (#810: emails held or dropped by a limit). Never throws. */
export async function bumpPlatformCounter(metric: string): Promise<void> {
  try {
    await prisma.platformCounter.upsert({ where: { metric }, create: { metric, value: 1 }, update: { value: { increment: 1 } } })
  } catch {
    // A statistic: never a reason to fail a send.
  }
}

/** The facts behind the sign-up indicators (#810, src/lib/signup-indicators.ts). */
export async function loadSignupFacts(now: Date = new Date()): Promise<SignupFacts> {
  const since = new Date(now.getTime() - INDICATOR_DAYS * DAY_MS)
  const unusedBefore = new Date(now.getTime() - UNUSED_AFTER_DAYS * DAY_MS)
  const [counters, approved, refused, validated, pending, unused, suspended] = await Promise.all([
    prisma.platformCounter.findMany({ where: { metric: { in: ["signup_requests", "signup_spaces", "emails_held", "emails_dropped"] } } }),
    prisma.operatorLog.count({ where: { action: "organization.approved", createdAt: { gte: since } } }),
    prisma.operatorLog.count({ where: { action: "organization.refused", createdAt: { gte: since } } }),
    prisma.organization.findMany({ where: { signupAt: { not: null }, publicationApprovedAt: { gte: since } }, select: { signupAt: true, publicationApprovedAt: true } }),
    prisma.organization.count({ where: PENDING_ORG_WHERE }),
    prisma.organization.count({ where: { signupAt: { lt: unusedBefore }, events: { none: {} } } }),
    prisma.organization.count({ where: { suspendedAt: { not: null } } }),
  ])
  const counter = (metric: string) => Number(counters.find((c) => c.metric === metric)?.value ?? 0)
  return {
    requests: counter("signup_requests"),
    spaces: counter("signup_spaces"),
    approved,
    refused,
    validationDelays: validated.map((o) => o.publicationApprovedAt!.getTime() - o.signupAt!.getTime()),
    pending,
    unused,
    held: counter("emails_held"),
    dropped: counter("emails_dropped"),
    suspended,
  }
}
