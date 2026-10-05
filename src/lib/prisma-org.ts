// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { prisma } from "./prisma"

/**
 * Returns a Prisma client extended so every operation on a tenant-owned model is constrained
 * to the given organization — reads, writes and deletes alike (#268). Routes under /admin get it
 * from requireOrgSession()/getOrgContext() and must not import the raw client (ESLint
 * no-restricted-imports enforces it, with a justified per-file exception where a route really
 * works across tenants or on non-tenant models).
 *
 * How each operation is constrained:
 * - multi-row (findMany, findFirst, count, aggregate, groupBy, updateMany, deleteMany): the org
 *   filter is AND-ed into `where`, so rows of other orgs are simply never matched;
 * - by unique key (findUnique, update, delete, upsert): the target row's owner is read first and
 *   the operation refused (findUnique: null; others: TenantAccessError) if it belongs elsewhere —
 *   a unique `where` (e.g. a compound key) can't always be combined with an arbitrary filter;
 * - create/createMany: direct models get `organizationId` forced; event-owned models must point
 *   to an event of this org.
 *
 * A row of another org therefore behaves exactly like a row that doesn't exist.
 */

/** Models carrying organizationId themselves. */
const DIRECT = ["event", "volunteer", "orgLog", "orgSlugHistory", "targetedMessage", "messageTemplate", "duplicateDismissal", "organizationLogo"] as const
/** Models owned through their event (eventId → Event.organizationId). */
const EVENT_OWNED = ["shift", "registration", "memberInvite", "eventPage", "sectorLeader", "eventMilestone", "eventLog", "eventQuestion", "questionAnswer"] as const

type DirectModel = (typeof DIRECT)[number]
type EventOwnedModel = (typeof EVENT_OWNED)[number]
type ScopedModel = DirectModel | EventOwnedModel

const MULTI_ROW_OPS = ["findMany", "findFirst", "findFirstOrThrow", "count", "aggregate", "groupBy", "updateMany", "deleteMany", "updateManyAndReturn"]
const UNIQUE_OPS = ["findUnique", "findUniqueOrThrow", "update", "delete", "upsert"]
const CREATE_OPS = ["create", "createMany", "createManyAndReturn"]

export class TenantAccessError extends Error {
  // Same code as Prisma's "record not found", so a caller treating P2025 as a 404 handles a
  // cross-tenant id the same way.
  readonly code = "P2025"
  constructor(model: string, operation: string) {
    super(`${model}.${operation}: record not found in this organization`)
    this.name = "TenantAccessError"
  }
}

const isDirect = (m: string): m is DirectModel => (DIRECT as readonly string[]).includes(m)
const isEventOwned = (m: string): m is EventOwnedModel => (EVENT_OWNED as readonly string[]).includes(m)

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyArgs = Record<string, any>
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const delegate = (model: ScopedModel): any => (prisma as any)[model]

function orgFilter(model: ScopedModel, organizationId: string): AnyArgs {
  return isDirect(model) ? { organizationId } : { event: { organizationId } }
}

async function ownerOf(model: ScopedModel, where: AnyArgs): Promise<string | null | undefined> {
  if (isDirect(model)) {
    const row = await delegate(model).findUnique({ where, select: { organizationId: true } })
    return row ? row.organizationId : undefined
  }
  const row = await delegate(model).findUnique({ where, select: { event: { select: { organizationId: true } } } })
  return row ? row.event.organizationId : undefined
}

function eventIdOf(data: AnyArgs): string | undefined {
  return data.eventId ?? data.event?.connect?.id
}

async function assertEventsOwned(eventIds: (string | undefined)[], organizationId: string, model: string, operation: string) {
  const ids = [...new Set(eventIds)]
  if (ids.some((id) => !id)) throw new TenantAccessError(model, operation)
  const count = await prisma.event.count({ where: { id: { in: ids as string[] }, organizationId } })
  if (count !== ids.length) throw new TenantAccessError(model, operation)
}

export function getOrgClient(organizationId: string) {
  return prisma.$extends({
    name: "org-scoped",
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          const m = (model.charAt(0).toLowerCase() + model.slice(1)) as ScopedModel
          if (!isDirect(m) && !isEventOwned(m)) return query(args)
          const a = (args ?? {}) as AnyArgs

          if (MULTI_ROW_OPS.includes(operation)) {
            a.where = a.where ? { AND: [a.where, orgFilter(m, organizationId)] } : orgFilter(m, organizationId)
            return query(a)
          }

          if (UNIQUE_OPS.includes(operation)) {
            const owner = await ownerOf(m, a.where)
            if (owner === organizationId) return query(a)
            if (owner === undefined && operation === "upsert") {
              // Row doesn't exist yet: the upsert will create it — same rules as create.
              if (isDirect(m)) a.create = { ...a.create, organizationId }
              else await assertEventsOwned([eventIdOf(a.create)], organizationId, model, operation)
              return query(a)
            }
            if (operation === "findUnique") return null
            throw new TenantAccessError(model, operation)
          }

          if (CREATE_OPS.includes(operation)) {
            const rows: AnyArgs[] = Array.isArray(a.data) ? a.data : [a.data]
            if (isDirect(m)) {
              const forced = rows.map((d) => ({ ...d, organizationId }))
              a.data = Array.isArray(a.data) ? forced : forced[0]
            } else {
              await assertEventsOwned(rows.map(eventIdOf), organizationId, model, operation)
            }
            return query(a)
          }

          // Any other operation on a tenant model is refused rather than silently unscoped.
          throw new TenantAccessError(model, operation)
        },
      },
    },
  })
}

export type OrgScopedPrisma = ReturnType<typeof getOrgClient>
