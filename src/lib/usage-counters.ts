// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Super admin usage figures (#805). Two kinds, shown side by side:
 * - cumulative counters, « depuis le début »: how many rows of each kind were ever created, kept in
 *   PlatformCounter / OrganizationCounter by AFTER INSERT triggers (migration
 *   20261008150000_usage_counters) and never lowered by a deletion. A deleted organisation's counts
 *   stay in the platform totals; its own rows go with it.
 * - current counts, « en ce moment »: what the database holds right now.
 *
 * Pure and Prisma-free: OrgDetail (a client component) renders these rows too. The queries are in
 * src/lib/usage-stats.ts.
 */

/** The metrics the triggers count; `key` is the `metric` column, set by the migration. */
export const USAGE_METRICS = [
  { key: "organizations", label: "Organisations créées", platformOnly: true },
  { key: "events", label: "Événements créés", platformOnly: false },
  { key: "shifts", label: "Créneaux créés", platformOnly: false },
  { key: "registrations", label: "Inscriptions enregistrées", platformOnly: false },
  { key: "members", label: "Membres ajoutés", platformOnly: false },
  { key: "admins", label: "Comptes administrateurs créés", platformOnly: false },
  { key: "sector_leaders", label: "Responsables de secteur désignés", platformOnly: false },
  { key: "member_invites", label: "Invitations envoyées", platformOnly: false },
] as const

export type UsageMetricKey = (typeof USAGE_METRICS)[number]["key"]

export type UsageRow = { key: string; label: string; value: number }

/**
 * The cumulative rows in the order of USAGE_METRICS, 0 for a metric not counted yet, unknown metrics
 * ignored; the organisation scope leaves out the platform-only ones.
 */
export function cumulativeRows(counters: readonly { metric: string; value: bigint | number }[], scope: "platform" | "organization"): UsageRow[] {
  const byMetric = new Map(counters.map((c) => [c.metric, Number(c.value)]))
  return USAGE_METRICS.filter((m) => scope === "platform" || !m.platformOnly).map((m) => ({
    key: m.key,
    label: m.label,
    value: byMetric.get(m.key) ?? 0,
  }))
}

export type CurrentCounts = {
  organizations: { active: number; inactive: number }
  /** Organisation accounts by role (`admin` = Propriétaire, `organizer` = Organisateur), active ones only. */
  admins: { owners: number; organizers: number; superAdmins: number }
  sectorLeaders: number
  members: { active: number; inactive: number }
  events: { draft: number; published: number; archived: number }
}

/** The « en ce moment » rows of the platform page, in reading order. */
export function currentRows(c: CurrentCounts): UsageRow[] {
  return [
    { key: "organizations_active", label: "Organisations actives", value: c.organizations.active },
    { key: "organizations_inactive", label: "Organisations désactivées", value: c.organizations.inactive },
    { key: "events_published", label: "Événements publiés", value: c.events.published },
    { key: "events_draft", label: "Événements en brouillon", value: c.events.draft },
    { key: "events_archived", label: "Événements archivés", value: c.events.archived },
    { key: "members_active", label: "Membres actifs", value: c.members.active },
    { key: "members_inactive", label: "Membres désactivés", value: c.members.inactive },
    { key: "admins_owners", label: "Propriétaires", value: c.admins.owners },
    { key: "admins_organizers", label: "Organisateurs", value: c.admins.organizers },
    { key: "admins_super", label: "Super admins", value: c.admins.superAdmins },
    { key: "sector_leaders", label: "Responsables de secteur", value: c.sectorLeaders },
  ]
}

/** Counts of a `groupBy` on one column, folded into named buckets (unknown values ignored). */
export function countBy<K extends string>(groups: readonly { key: string | null; count: number }[], buckets: Record<K, readonly string[]>): Record<K, number> {
  const out = Object.fromEntries(Object.keys(buckets).map((k) => [k, 0])) as Record<K, number>
  for (const g of groups) {
    for (const [bucket, values] of Object.entries(buckets) as [K, readonly string[]][]) {
      if (g.key !== null && values.includes(g.key)) out[bucket] += g.count
    }
  }
  return out
}

/** A count in French: 12 345 with a narrow no-break space. */
export function formatCount(n: number): string {
  return new Intl.NumberFormat("fr-FR").format(n)
}
