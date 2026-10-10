// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { prisma } from "@/lib/prisma"
import { assessInactivity, type InactivityAssessment } from "@/lib/org-inactivity"
import { adminReachability, type AdminReachability } from "@/lib/admin-reachability"
import { addressHash } from "@/lib/notifications/smtp-outcome"
import { env } from "@/lib/env"
import { RETENTION_DAYS } from "@/lib/retention"

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
  /** Active administrators and how many of their addresses are « à vérifier » (#598, #599). */
  reachability: AdminReachability
  postponedUntil: Date | null
  /** The procedure under way with `ORG_INACTIVITY=on`: first email sent on, emails sent so far. */
  noticeAt: Date | null
  emailsSent: number
  assessment: InactivityAssessment
}

/**
 * Every active, non-suspended organisation with where it stands in the check: what the report
 * lists, and what the nightly procedure acts on.
 */
export async function assessActiveOrganizations(now: Date = new Date(), only?: string[]): Promise<InactivityReportRow[]> {
  const startOfToday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  const orgs = await prisma.organization.findMany({
    where: { active: true, suspendedAt: null, ...(only ? { id: { in: only } } : {}) },
    select: {
      id: true, name: true, slug: true, active: true, suspendedAt: true, createdAt: true,
      lastMeaningfulActivityAt: true, lastRetentionConfirmedAt: true, inactivityPostponedUntil: true, inactivityExempt: true,
      inactivityNoticeAt: true, inactivityEmailsSent: true,
      events: { select: { endDate: true, publicStatus: true }, orderBy: { endDate: "desc" }, take: 1 },
      admins: { where: { isActive: true }, select: { email: true } },
    },
  })
  if (orgs.length === 0) return []
  const ids = orgs.map((o) => o.id)
  const adminHashes = new Map(orgs.map((o) => [o.id, o.admins.map((a) => addressHash(a.email, env.AUTH_SECRET))]))
  const allHashes = [...new Set([...adminHashes.values()].flat())]
  const outcomeCutoff = new Date(now.getTime() - RETENTION_DAYS.deliveryOutcome * 24 * 60 * 60 * 1000)
  const [upcoming, published, registered, outcomes] = await Promise.all([
    prisma.event.groupBy({ by: ["organizationId"], where: { organizationId: { in: ids }, endDate: { gte: startOfToday } }, _count: { _all: true } }),
    prisma.event.groupBy({ by: ["organizationId"], where: { organizationId: { in: ids }, publicStatus: { in: ["published", "archived"] } }, _count: { _all: true } }),
    prisma.event.groupBy({ by: ["organizationId"], where: { organizationId: { in: ids }, registrations: { some: {} } }, _count: { _all: true } }),
    // Any organisation's outcomes for these addresses: a refused mailbox is a fact about the address.
    allHashes.length === 0 ? [] : prisma.deliveryOutcome.findMany({
      where: { addressHash: { in: allHashes }, createdAt: { gte: outcomeCutoff } },
      select: { addressHash: true, outcome: true, createdAt: true },
    }),
  ])
  const has = (groups: { organizationId: string }[]) => new Set(groups.map((g) => g.organizationId))
  const withUpcoming = has(upcoming)
  const used = new Set([...has(published), ...has(registered)])

  return orgs.map((o) => ({
    id: o.id, name: o.name, slug: o.slug,
    lastActivityAt: o.lastMeaningfulActivityAt,
    lastEventEnd: o.events[0]?.endDate ?? null,
    everUsed: used.has(o.id),
    activeAdmins: o.admins.length,
    reachability: adminReachability(adminHashes.get(o.id) ?? [], outcomes, now),
    postponedUntil: o.inactivityPostponedUntil,
    noticeAt: o.inactivityNoticeAt,
    emailsSent: o.inactivityEmailsSent,
    assessment: assessInactivity({
      lastActivityAt: o.lastMeaningfulActivityAt,
      lastRetentionConfirmedAt: o.lastRetentionConfirmedAt,
      hasUpcomingEvent: withUpcoming.has(o.id),
      everUsed: used.has(o.id),
      suspended: o.suspendedAt !== null,
      active: o.active,
      postponedUntil: o.inactivityPostponedUntil,
      exempt: o.inactivityExempt,
    }, now, o.createdAt),
  }))
}

export type ListedInactivityRow = InactivityReportRow & { assessment: Extract<InactivityAssessment, { state: "active" | "due" }> }

/** The report: organisations due within SOON_DAYS or already due, the nearest first. */
export async function loadInactivityReport(now: Date = new Date()): Promise<ListedInactivityRow[]> {
  const soon = now.getTime() + SOON_DAYS * 24 * 60 * 60 * 1000
  return (await assessActiveOrganizations(now))
    .filter((r): r is ListedInactivityRow => r.assessment.state === "due" || (r.assessment.state === "active" && r.assessment.firstEmailAt.getTime() <= soon))
    .sort((a, b) => a.assessment.firstEmailAt.getTime() - b.assessment.firstEmailAt.getTime())
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
      inactivityNoticeAt: true, inactivityEmailsSent: true, inactivityDeactivatedAt: true,
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
    noticeAt: o.inactivityNoticeAt,
    emailsSent: o.inactivityEmailsSent,
    deactivatedAt: o.inactivityDeactivatedAt,
    assessment,
  }
}

/** The spaces the check deactivated (no answer), the latest first. */
export async function loadDeactivatedForInactivity(): Promise<{ id: string; name: string; slug: string; inactivityDeactivatedAt: Date | null }[]> {
  return prisma.organization.findMany({
    where: { active: false, suspendedAt: null, inactivityDeactivatedAt: { not: null } },
    select: { id: true, name: true, slug: true, inactivityDeactivatedAt: true },
    orderBy: { inactivityDeactivatedAt: "desc" },
  })
}
