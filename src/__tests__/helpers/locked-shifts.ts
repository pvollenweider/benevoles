/**
 * The public sign-up reads the submitted shifts again once it holds their lock (AUTHZ-05): status,
 * capacity, options and hours as they are then. Route tests that mock Prisma answer that read with
 * the shifts the route read before the lock (the rows of the top-level `shift.findMany` that
 * includes the registrations), open, unless a test changes them with `override`.
 */
type Args = { where?: { id?: { in?: string[] } }; select?: Record<string, unknown>; include?: Record<string, unknown> } | undefined
type Row = { id: string } & Record<string, unknown>

export function lockedShiftReads() {
  let seen: Row[] = []
  let changes: Record<string, Partial<Row>> = {}
  return {
    /** Wraps the top-level `prisma.shift.findMany` mock: remembers the submitted shifts. */
    top: (fn: (args: Args) => unknown) => async (args: Args) => {
      const rows = await fn(args)
      if (args?.include?.registrations && Array.isArray(rows)) seen = rows as Row[]
      return rows
    },
    /** Wraps the transaction's `shift.findMany` mock: the read under the lock answers those shifts. */
    tx: (fn: (args: Args) => unknown) => async (args: Args) => {
      if (args?.select?.capacity === undefined || !args?.where?.id?.in) return fn(args)
      const ids = args.where.id.in
      return seen.filter((r) => ids.includes(r.id)).map((r) => ({ status: "open", ...r, ...changes[r.id] }))
    },
    /** What changed on a shift between the early read and the lock (closed, capacity lowered…). */
    override: (id: string, change: Partial<Row>) => { changes[id] = { ...changes[id], ...change } },
    reset: () => { seen = []; changes = {} },
  }
}
