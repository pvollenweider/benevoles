/**
 * Read side of OrgLog: query with filters, resolve actor display names at render time (never
 * stored — see org-log.ts). Simpler than event-log-read.ts on purpose: a flat filtered list, no
 * causal chain, no narrative/replay modes.
 */
import { prisma } from "./prisma"

export interface OrgLogEntry {
  id: string
  actorType: string
  actorId: string | null
  actorLabel: string
  action: string
  entityType: string
  entityId: string
  changes: Record<string, { from: unknown; to: unknown }> | null
  createdAt: Date
}

export interface OrgLogFilters {
  entityType?: string
  /** action or action prefix, e.g. "member" matches "member.created", "member.updated", ... */
  action?: string
  cursor?: string
  limit?: number
}

const GENERIC_LABEL: Record<string, string> = {
  admin: "Admin (compte supprimé)",
  system: "Système",
}

const ENTITY_TYPE_LABEL: Record<string, string> = {
  Member: "Membre",
  AdminUser: "Compte admin",
}

export function entityTypeLabel(entityType: string): string {
  return ENTITY_TYPE_LABEL[entityType] ?? entityType
}

export async function listOrgLogs(organizationId: string, filters: OrgLogFilters = {}): Promise<{
  entries: OrgLogEntry[]
  nextCursor: string | null
}> {
  const limit = Math.min(filters.limit ?? 50, 200)

  const where: Record<string, unknown> = { organizationId }
  if (filters.entityType) where.entityType = filters.entityType
  if (filters.action) where.action = { startsWith: filters.action }

  const rows = await prisma.orgLog.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: limit + 1,
    ...(filters.cursor ? { cursor: { id: filters.cursor }, skip: 1 } : {}),
  })

  const hasMore = rows.length > limit
  const page = hasMore ? rows.slice(0, limit) : rows

  const adminIds = [...new Set(page.filter((r) => r.actorType === "admin" && r.actorId).map((r) => r.actorId!))]
  const admins = adminIds.length
    ? await prisma.adminUser.findMany({ where: { id: { in: adminIds } }, select: { id: true, name: true } })
    : []
  const adminNames = new Map(admins.map((a) => [a.id, a.name]))

  const entries: OrgLogEntry[] = page.map((row) => ({
    id: row.id,
    actorType: row.actorType,
    actorId: row.actorId,
    actorLabel: (row.actorType === "admin" && row.actorId && adminNames.get(row.actorId)) || GENERIC_LABEL[row.actorType] || row.actorType,
    action: row.action,
    entityType: row.entityType,
    entityId: row.entityId,
    changes: row.changes as OrgLogEntry["changes"],
    createdAt: row.createdAt,
  }))

  return { entries, nextCursor: hasMore ? page[page.length - 1].id : null }
}
