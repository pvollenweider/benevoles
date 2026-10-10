// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { prisma } from "@/lib/prisma"
import { assessInactivity, type InactivityAssessment } from "@/lib/org-inactivity"

/**
 * The organisations the periodic check of #811 would deal with soon, read only: what
 * `ORG_INACTIVITY=report` lists. Server only (Prisma).
 */

/** Organisations whose first email is due within this many days are listed too. */
export const SOON_DAYS = 90

export type InactivityReportRow = {
  id: string
  name: string
  slug: string
  lastActivityAt: Date | null
  lastEventEnd: Date | null
  everUsed: boolean
  activeAdmins: number
  postponedUntil: Date | null
  assessment: Extract<InactivityAssessment, { state: "active" | "due" }>
}

export async function loadInactivityReport(now: Date = new Date()): Promise<InactivityReportRow[]> {
  const startOfToday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  const orgs = await prisma.organization.findMany({
    where: { active: true, suspendedAt: null },
    select: {
      id: true, name: true, slug: true, active: true, suspendedAt: true, createdAt: true,
      lastMeaningfulActivityAt: true, lastRetentionConfirmedAt: true, inactivityPostponedUntil: true, inactivityExempt: true,
      events: { select: { endDate: true, publicStatus: true }, orderBy: { endDate: "desc" }, take: 1 },
      _count: { select: { admins: { where: { isActive: true } } } },
    },
  })
  if (orgs.length === 0) return []
  const ids = orgs.map((o) => o.id)
  const [upcoming, published, registered] = await Promise.all([
    prisma.event.groupBy({ by: ["organizationId"], where: { organizationId: { in: ids }, endDate: { gte: startOfToday } }, _count: { _all: true } }),
    prisma.event.groupBy({ by: ["organizationId"], where: { organizationId: { in: ids }, publicStatus: { in: ["published", "archived"] } }, _count: { _all: true } }),
    prisma.event.groupBy({ by: ["organizationId"], where: { organizationId: { in: ids }, registrations: { some: {} } }, _count: { _all: true } }),
  ])
  const has = (groups: { organizationId: string }[]) => new Set(groups.map((g) => g.organizationId))
  const withUpcoming = has(upcoming)
  const used = new Set([...has(published), ...has(registered)])
  const soon = now.getTime() + SOON_DAYS * 24 * 60 * 60 * 1000

  const rows: InactivityReportRow[] = []
  for (const o of orgs) {
    const assessment = assessInactivity({
      lastActivityAt: o.lastMeaningfulActivityAt,
      lastRetentionConfirmedAt: o.lastRetentionConfirmedAt,
      hasUpcomingEvent: withUpcoming.has(o.id),
      everUsed: used.has(o.id),
      suspended: o.suspendedAt !== null,
      active: o.active,
      postponedUntil: o.inactivityPostponedUntil,
      exempt: o.inactivityExempt,
    }, now, o.createdAt)
    if (assessment.state === "excluded") continue
    if (assessment.state === "active" && assessment.firstEmailAt.getTime() > soon) continue
    rows.push({
      id: o.id, name: o.name, slug: o.slug,
      lastActivityAt: o.lastMeaningfulActivityAt,
      lastEventEnd: o.events[0]?.endDate ?? null,
      everUsed: used.has(o.id),
      activeAdmins: o._count.admins,
      postponedUntil: o.inactivityPostponedUntil,
      assessment,
    })
  }
  return rows.sort((a, b) => a.assessment.firstEmailAt.getTime() - b.assessment.firstEmailAt.getTime())
}

/** The organisations the operator excluded for good (« Ne jamais désactiver automatiquement »). */
export async function loadExemptOrganizations(): Promise<{ id: string; name: string; slug: string }[]> {
  return prisma.organization.findMany({
    where: { inactivityExempt: true },
    select: { id: true, name: true, slug: true },
    orderBy: { name: "asc" },
  })
}

/** Where one organisation stands in the check, for its page in the super admin space. */
export async function loadOrganizationInactivity(orgId: string, now: Date = new Date()) {
  const startOfToday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  const o = await prisma.organization.findUnique({
    where: { id: orgId },
    select: {
      active: true, suspendedAt: true, createdAt: true,
      lastMeaningfulActivityAt: true, lastRetentionConfirmedAt: true, inactivityPostponedUntil: true, inactivityExempt: true,
    },
  })
  if (!o) return null
  const [upcoming, used] = await Promise.all([
    prisma.event.count({ where: { organizationId: orgId, endDate: { gte: startOfToday } } }),
    prisma.event.count({ where: { organizationId: orgId, OR: [{ publicStatus: { in: ["published", "archived"] } }, { registrations: { some: {} } }] } }),
  ])
  const assessment = assessInactivity({
    lastActivityAt: o.lastMeaningfulActivityAt,
    lastRetentionConfirmedAt: o.lastRetentionConfirmedAt,
    hasUpcomingEvent: upcoming > 0,
    everUsed: used > 0,
    suspended: o.suspendedAt !== null,
    active: o.active,
    postponedUntil: o.inactivityPostponedUntil,
    exempt: o.inactivityExempt,
  }, now, o.createdAt)
  return {
    lastActivityAt: o.lastMeaningfulActivityAt,
    postponedUntil: o.inactivityPostponedUntil,
    exempt: o.inactivityExempt,
    assessment,
  }
}
