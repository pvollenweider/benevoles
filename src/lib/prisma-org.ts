import { prisma } from "./prisma"

/**
 * Returns a Prisma client extended so every read on a tenant-owned model
 * is automatically constrained to the given organization.
 *
 * Reads (findMany, findFirst, count) are scoped automatically. Mutations
 * (update, delete) on Shift and Registration must still be guarded by the
 * route by first calling a scoped read (e.g. db.shift.findFirst) to verify
 * ownership — Prisma's WhereUniqueInput does not let us inject relation
 * filters on these operations.
 *
 * Type assertions are used inside the callbacks because Prisma's generic
 * argument types don't model runtime injection cleanly: the where/data
 * objects are valid at runtime even when the static types are stricter.
 */
export function getOrgClient(organizationId: string) {
  return prisma.$extends({
    name: "org-scoped",
    query: {
      event: {
        async findMany({ args, query }) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          ;(args.where as any) = { ...args.where, organizationId }
          return query(args)
        },
        async findFirst({ args, query }) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          ;(args.where as any) = { ...args.where, organizationId }
          return query(args)
        },
        async findFirstOrThrow({ args, query }) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          ;(args.where as any) = { ...args.where, organizationId }
          return query(args)
        },
        async count({ args, query }) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          ;(args.where as any) = { ...(args.where ?? {}), organizationId }
          return query(args)
        },
        async create({ args, query }) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          ;(args.data as any) = { ...args.data, organizationId }
          return query(args)
        },
      },
      member: {
        async findMany({ args, query }) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          ;(args.where as any) = { ...args.where, organizationId }
          return query(args)
        },
        async findFirst({ args, query }) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          ;(args.where as any) = { ...args.where, organizationId }
          return query(args)
        },
        async count({ args, query }) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          ;(args.where as any) = { ...(args.where ?? {}), organizationId }
          return query(args)
        },
        async create({ args, query }) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          ;(args.data as any) = { ...args.data, organizationId }
          return query(args)
        },
      },
      shift: {
        async findMany({ args, query }) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const w = (args.where ?? {}) as any
          w.event = { ...(w.event ?? {}), organizationId }
          args.where = w
          return query(args)
        },
        async findFirst({ args, query }) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const w = (args.where ?? {}) as any
          w.event = { ...(w.event ?? {}), organizationId }
          args.where = w
          return query(args)
        },
        async count({ args, query }) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const w = (args.where ?? {}) as any
          w.event = { ...(w.event ?? {}), organizationId }
          args.where = w
          return query(args)
        },
      },
      registration: {
        async findMany({ args, query }) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const w = (args.where ?? {}) as any
          w.event = { ...(w.event ?? {}), organizationId }
          args.where = w
          return query(args)
        },
        async findFirst({ args, query }) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const w = (args.where ?? {}) as any
          w.event = { ...(w.event ?? {}), organizationId }
          args.where = w
          return query(args)
        },
        async count({ args, query }) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const w = (args.where ?? {}) as any
          w.event = { ...(w.event ?? {}), organizationId }
          args.where = w
          return query(args)
        },
      },
      memberInvite: {
        async findMany({ args, query }) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const w = (args.where ?? {}) as any
          w.event = { ...(w.event ?? {}), organizationId }
          args.where = w
          return query(args)
        },
        async findFirst({ args, query }) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const w = (args.where ?? {}) as any
          w.event = { ...(w.event ?? {}), organizationId }
          args.where = w
          return query(args)
        },
        async count({ args, query }) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const w = (args.where ?? {}) as any
          w.event = { ...(w.event ?? {}), organizationId }
          args.where = w
          return query(args)
        },
      },
    },
  })
}

export type OrgScopedPrisma = ReturnType<typeof getOrgClient>
