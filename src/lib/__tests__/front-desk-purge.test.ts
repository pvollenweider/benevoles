import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("../prisma", () => ({ prisma: {} }))
const report = vi.hoisted(() => vi.fn())
vi.mock("../report-error", () => ({ reportError: (context: string) => (error: unknown) => report(context, error) }))

import { FRONT_DESK_PURGE_BATCH, frontDeskPurgeCandidateWhere, purgeDueFrontDeskAccounts, type FrontDeskPurgeCandidate, type FrontDeskPurgeDb, type FrontDeskPurgeTx } from "../front-desk-purge"
import { frontDeskInviteDedupeKey, frontDeskInviteDedupePrefix } from "../front-desk-access"

const NOW = new Date("2027-09-20T12:00:00Z")
const day = (iso: string) => new Date(`${iso}T00:00:00Z`)
const at = (iso: string) => new Date(iso)

/** An account due now: its only event ended in June 2027, more than 90 days before NOW. */
function dueCandidate(over: Partial<FrontDeskPurgeCandidate> = {}): FrontDeskPurgeCandidate {
  return {
    id: "adm-due",
    organizationId: "org-fete",
    createdAt: at("2027-01-01T00:00:00Z"),
    organization: { timeZone: "Europe/Zurich" },
    eventAccesses: [{ revokedAt: null, expiresAt: null, event: { endDate: day("2027-06-20"), title: "Fête du village" } }],
    ...over,
  }
}

/** The same account, kept: its access ended 10 days ago (its event is still ahead). */
function keptCandidate(over: Partial<FrontDeskPurgeCandidate> = {}): FrontDeskPurgeCandidate {
  return dueCandidate({
    id: "adm-kept",
    eventAccesses: [{ revokedAt: at("2027-09-10T12:00:00Z"), expiresAt: null, event: { endDate: day("2028-06-20"), title: "Fête à venir" } }],
    ...over,
  })
}

type OutboxRow = { id: string; organizationId: string; dedupeKey: string | null }

type TxDoubles = {
  tx: FrontDeskPurgeTx
  queryRaw: ReturnType<typeof vi.fn>
  findFirst: ReturnType<typeof vi.fn>
  deleteMany: ReturnType<typeof vi.fn>
  outboxDeleteMany: ReturnType<typeof vi.fn>
  orgLogCreate: ReturnType<typeof vi.fn>
}

function txDoubles(candidate: FrontDeskPurgeCandidate | null, deleteCount = 1, outboxRows: OutboxRow[] = []): TxDoubles {
  const queryRaw = vi.fn().mockResolvedValue(candidate ? [{ id: candidate.id }] : [])
  const findFirst = vi.fn().mockResolvedValue(candidate)
  const deleteMany = vi.fn().mockResolvedValue({ count: deleteCount })
  const orgLogCreate = vi.fn().mockResolvedValue({ id: "log-1" })
  // Behaves like the SQL: delete the rows of this organisation whose key starts with the prefix.
  const outboxDeleteMany = vi.fn(async ({ where }: { where: { organizationId: string; dedupeKey: { startsWith: string } } }) => {
    const before = outboxRows.length
    for (let i = outboxRows.length - 1; i >= 0; i--) {
      const row = outboxRows[i]
      if (row.organizationId === where.organizationId && row.dedupeKey?.startsWith(where.dedupeKey.startsWith)) outboxRows.splice(i, 1)
    }
    return { count: before - outboxRows.length }
  })
  return {
    tx: {
      $queryRaw: queryRaw as unknown as FrontDeskPurgeTx["$queryRaw"],
      adminUser: { findFirst: findFirst as unknown as FrontDeskPurgeTx["adminUser"]["findFirst"], deleteMany: deleteMany as unknown as FrontDeskPurgeTx["adminUser"]["deleteMany"] },
      notificationOutbox: { deleteMany: outboxDeleteMany as unknown as FrontDeskPurgeTx["notificationOutbox"]["deleteMany"] },
      orgLog: { create: orgLogCreate as unknown as FrontDeskPurgeTx["orgLog"]["create"] },
    },
    queryRaw,
    findFirst,
    deleteMany,
    outboxDeleteMany,
    orgLogCreate,
  }
}

function dbWith(candidates: FrontDeskPurgeCandidate[][], tx: FrontDeskPurgeTx) {
  const findMany = vi.fn()
  for (const batch of candidates) findMany.mockResolvedValueOnce(batch)
  findMany.mockResolvedValue([])
  const db = {
    adminUser: { findMany: findMany as unknown as FrontDeskPurgeDb["adminUser"]["findMany"] },
    $transaction: (async (fn: (t: FrontDeskPurgeTx) => Promise<unknown>) => fn(tx)) as FrontDeskPurgeDb["$transaction"],
  }
  return { db, findMany }
}

beforeEach(() => vi.clearAllMocks())

describe("frontDeskPurgeCandidateWhere", () => {
  it("asks for front-desk accounts only, in an organisation, with no access that could still be recent", () => {
    const where = frontDeskPurgeCandidateWhere(NOW)
    expect(where.role).toBe("front_desk")
    expect(where.organizationId).toEqual({ not: null })
    const none = (where.eventAccesses as { none: Record<string, unknown> }).none
    expect(none.revokedAt).toBeNull()
    // An access is possibly recent when it is not revoked, not expired before the cutoff, and its
    // event may still end after it.
    expect(none.OR).toEqual([{ expiresAt: null }, { expiresAt: { gt: expect.any(Date) } }])
    expect((none.event as { endDate: { gte: Date } }).endDate.gte).toBeInstanceOf(Date)
    // Two days of margin on the stored UTC midnight of the last day.
    const cutoff = (none.OR as { expiresAt?: { gt: Date } }[])[1].expiresAt!.gt
    expect(cutoff.getTime() - (none.event as { endDate: { gte: Date } }).endDate.gte.getTime()).toBe(2 * 86_400_000)
  })
})

describe("purgeDueFrontDeskAccounts", () => {
  it("deletes a due account with a conditional delete on id and role, logs the event's title, and counts it", async () => {
    const candidate = dueCandidate()
    const { tx, deleteMany, orgLogCreate, queryRaw } = txDoubles(candidate)
    const { db, findMany } = dbWith([[candidate]], tx)

    await expect(purgeDueFrontDeskAccounts(NOW, db)).resolves.toEqual({ deleted: 1, failed: 0 })

    // Candidates: bounded, front-desk role, batch by batch.
    const findArgs = findMany.mock.calls[0][0] as { where: { role: string }; take: number }
    expect(findArgs.where.role).toBe("front_desk")
    expect(findArgs.take).toBe(FRONT_DESK_PURGE_BATCH)
    // The account row is locked before the re-read, the same lock as the invitation routes.
    const sql = (queryRaw.mock.calls[0][0] as TemplateStringsArray).join(" ")
    expect(sql).toContain('FROM "AdminUser"')
    expect(sql).toContain("FOR UPDATE")
    // The role condition is in the delete statement itself, on the account's id.
    expect(deleteMany).toHaveBeenCalledWith({ where: { id: candidate.id, role: "front_desk" } })
    // One system entry, no name and no address; the event's title is what it says about the access.
    expect(orgLogCreate).toHaveBeenCalledTimes(1)
    expect(orgLogCreate.mock.calls[0][0]).toEqual({
      data: {
        organizationId: "org-fete",
        actorType: "system",
        actorId: null,
        action: "frontdesk.account_purged",
        entityType: "AdminUser",
        entityId: candidate.id,
        changes: { eventTitle: { from: null, to: "Fête du village" } },
      },
    })
    const logged = JSON.stringify(orgLogCreate.mock.calls[0][0])
    expect(logged).not.toContain("Colette")
    expect(logged).not.toContain("colette@example.org")
  })

  it("keeps an account whose latest access ended less than 90 days ago", async () => {
    const due = dueCandidate()
    const kept = keptCandidate()
    const { tx, deleteMany } = txDoubles(due)
    const { db } = dbWith([[due, kept]], tx)

    await expect(purgeDueFrontDeskAccounts(NOW, db)).resolves.toEqual({ deleted: 1, failed: 0 })
    expect(deleteMany).toHaveBeenCalledTimes(1)
    expect(deleteMany).toHaveBeenCalledWith({ where: { id: due.id, role: "front_desk" } })
  })

  it("goes on when one account's transaction fails: the others are deleted, the failure is counted and reported", async () => {
    const first = dueCandidate({ id: "adm-1" })
    const broken = dueCandidate({ id: "adm-2" })
    const third = dueCandidate({ id: "adm-3" })
    const byId = new Map([first, broken, third].map((candidate) => [candidate.id, candidate]))
    const deletedIds: string[] = []
    const tx = {
      // A deadlock, timeout or failed log insert aborts one account's transaction only.
      $queryRaw: (async (_sql: TemplateStringsArray, id: string) => {
        if (id === broken.id) throw new Error("deadlock detected")
        return [{ id }]
      }) as unknown as FrontDeskPurgeTx["$queryRaw"],
      adminUser: {
        findFirst: (async ({ where }: { where: { id: string } }) => byId.get(where.id) ?? null) as unknown as FrontDeskPurgeTx["adminUser"]["findFirst"],
        deleteMany: (async ({ where }: { where: { id: string } }) => {
          deletedIds.push(where.id)
          return { count: 1 }
        }) as unknown as FrontDeskPurgeTx["adminUser"]["deleteMany"],
      },
      notificationOutbox: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
      orgLog: { create: vi.fn().mockResolvedValue({ id: "log" }) },
    } as unknown as FrontDeskPurgeTx
    const { db } = dbWith([[first, broken, third]], tx)

    await expect(purgeDueFrontDeskAccounts(NOW, db)).resolves.toEqual({ deleted: 2, failed: 1 })
    expect(deletedIds).toEqual(["adm-1", "adm-3"])
    expect(report).toHaveBeenCalledWith("frontdesk.account_purge", expect.any(Error))
  })

  it("deletes the purged account's queued invitations, scoped to its organisation and kind", async () => {
    const candidate = dueCandidate()
    const rows: OutboxRow[] = [
      { id: "row-due-pending", organizationId: "org-fete", dedupeKey: frontDeskInviteDedupeKey("org-fete", candidate.id, "token-hash-due") },
      { id: "row-due-resent", organizationId: "org-fete", dedupeKey: frontDeskInviteDedupeKey("org-fete", candidate.id, "token-hash-resent") },
      { id: "row-same-kind-other-account", organizationId: "org-fete", dedupeKey: frontDeskInviteDedupeKey("org-fete", "adm-kept", "token-hash-kept") },
      { id: "row-other-org", organizationId: "org-autre", dedupeKey: frontDeskInviteDedupeKey("org-autre", candidate.id, "token-hash-other-org") },
      { id: "row-other-kind", organizationId: "org-fete", dedupeKey: `admin_invite:org-fete:${candidate.id}:abc` },
    ]
    const { tx, outboxDeleteMany } = txDoubles(candidate, 1, rows)
    const { db } = dbWith([[candidate]], tx)

    await expect(purgeDueFrontDeskAccounts(NOW, db)).resolves.toEqual({ deleted: 1, failed: 0 })

    // Pending and resent invitations of the purged account are gone; another account's rows of the
    // same kind, another organisation's, and another kind stay.
    expect(rows.map((row) => row.id)).toEqual(["row-same-kind-other-account", "row-other-org", "row-other-kind"])
    expect(outboxDeleteMany).toHaveBeenCalledWith({
      where: {
        organizationId: "org-fete",
        dedupeKey: { startsWith: frontDeskInviteDedupePrefix("org-fete", candidate.id) },
      },
    })
  })

  it("narrows the candidates to the given organisations when asked", async () => {
    const { tx } = txDoubles(null)
    const { db, findMany } = dbWith([[]], tx)

    await expect(purgeDueFrontDeskAccounts(NOW, db, ["org-fete"])).resolves.toEqual({ deleted: 0, failed: 0 })
    expect((findMany.mock.calls[0][0] as { where: { organizationId: unknown } }).where.organizationId).toEqual({ in: ["org-fete"] })
  })

  it("deletes nothing when the account was re-opened between the batch read and the lock", async () => {
    const read = dueCandidate()
    // Under the lock, the grant has been re-opened: its event now ends in the future.
    const reopened = dueCandidate({
      eventAccesses: [{ revokedAt: null, expiresAt: null, event: { endDate: day("2028-06-20"), title: "Fête du village" } }],
    })
    const { tx, deleteMany, orgLogCreate } = txDoubles(reopened)
    const { db } = dbWith([[read]], tx)

    await expect(purgeDueFrontDeskAccounts(NOW, db)).resolves.toEqual({ deleted: 0, failed: 0 })
    expect(deleteMany).not.toHaveBeenCalled()
    expect(orgLogCreate).not.toHaveBeenCalled()
  })

  it("never logs a deletion the conditional delete did not make (role changed under the lock)", async () => {
    const candidate = dueCandidate()
    const { tx, orgLogCreate } = txDoubles(candidate, 0)
    const { db } = dbWith([[candidate]], tx)

    await expect(purgeDueFrontDeskAccounts(NOW, db)).resolves.toEqual({ deleted: 0, failed: 0 })
    expect(orgLogCreate).not.toHaveBeenCalled()
  })

  it("counts an account with no access from its creation", async () => {
    const empty = dueCandidate({
      id: "adm-empty",
      createdAt: at("2027-01-01T00:00:00Z"),
      eventAccesses: [],
    })
    const { tx } = txDoubles(empty)
    const { db } = dbWith([[empty]], tx)
    await expect(purgeDueFrontDeskAccounts(NOW, db)).resolves.toEqual({ deleted: 1, failed: 0 })
  })

  it("reads bounded batches and stops, never the whole table at once", async () => {
    const kept = Array.from({ length: FRONT_DESK_PURGE_BATCH }, (_, i) => keptCandidate({ id: `adm-kept-${String(i).padStart(3, "0")}` }))
    const { tx } = txDoubles(kept[0])
    const { db, findMany } = dbWith([kept], tx)

    await expect(purgeDueFrontDeskAccounts(NOW, db)).resolves.toEqual({ deleted: 0, failed: 0 })
    expect(findMany).toHaveBeenCalledTimes(2)
    for (const call of findMany.mock.calls) expect((call[0] as { take: number }).take).toBe(FRONT_DESK_PURGE_BATCH)
    // The next batch starts after the last id read, so a kept account is never read twice.
    expect((findMany.mock.calls[1][0] as { where: { id: { gt: string } } }).where.id.gt).toBe(kept[kept.length - 1].id)
  })

  it("returns a count only, never a name or an address", async () => {
    const candidate = dueCandidate()
    const { tx } = txDoubles(candidate)
    const { db } = dbWith([[candidate]], tx)
    const result = await purgeDueFrontDeskAccounts(NOW, db)
    expect(Object.keys(result)).toEqual(["deleted", "failed"])
    expect(JSON.stringify(result)).not.toMatch(/Colette|colette@example\.org/)
  })
})
