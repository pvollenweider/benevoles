import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("../prisma", () => ({ prisma: {} }))

import { FRONT_DESK_PURGE_BATCH, frontDeskPurgeCandidateWhere, purgeDueFrontDeskAccounts, type FrontDeskPurgeCandidate, type FrontDeskPurgeDb, type FrontDeskPurgeTx } from "../front-desk-purge"

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

type TxDoubles = {
  tx: FrontDeskPurgeTx
  queryRaw: ReturnType<typeof vi.fn>
  findFirst: ReturnType<typeof vi.fn>
  deleteMany: ReturnType<typeof vi.fn>
  orgLogCreate: ReturnType<typeof vi.fn>
}

function txDoubles(candidate: FrontDeskPurgeCandidate | null, deleteCount = 1): TxDoubles {
  const queryRaw = vi.fn().mockResolvedValue(candidate ? [{ id: candidate.id }] : [])
  const findFirst = vi.fn().mockResolvedValue(candidate)
  const deleteMany = vi.fn().mockResolvedValue({ count: deleteCount })
  const orgLogCreate = vi.fn().mockResolvedValue({ id: "log-1" })
  return {
    tx: {
      $queryRaw: queryRaw as unknown as FrontDeskPurgeTx["$queryRaw"],
      adminUser: { findFirst: findFirst as unknown as FrontDeskPurgeTx["adminUser"]["findFirst"], deleteMany: deleteMany as unknown as FrontDeskPurgeTx["adminUser"]["deleteMany"] },
      orgLog: { create: orgLogCreate as unknown as FrontDeskPurgeTx["orgLog"]["create"] },
    },
    queryRaw,
    findFirst,
    deleteMany,
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

    await expect(purgeDueFrontDeskAccounts(NOW, db)).resolves.toEqual({ deleted: 1 })

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

    await expect(purgeDueFrontDeskAccounts(NOW, db)).resolves.toEqual({ deleted: 1 })
    expect(deleteMany).toHaveBeenCalledTimes(1)
    expect(deleteMany).toHaveBeenCalledWith({ where: { id: due.id, role: "front_desk" } })
  })

  it("deletes nothing when the account was re-opened between the batch read and the lock", async () => {
    const read = dueCandidate()
    // Under the lock, the grant has been re-opened: its event now ends in the future.
    const reopened = dueCandidate({
      eventAccesses: [{ revokedAt: null, expiresAt: null, event: { endDate: day("2028-06-20"), title: "Fête du village" } }],
    })
    const { tx, deleteMany, orgLogCreate } = txDoubles(reopened)
    const { db } = dbWith([[read]], tx)

    await expect(purgeDueFrontDeskAccounts(NOW, db)).resolves.toEqual({ deleted: 0 })
    expect(deleteMany).not.toHaveBeenCalled()
    expect(orgLogCreate).not.toHaveBeenCalled()
  })

  it("never logs a deletion the conditional delete did not make (role changed under the lock)", async () => {
    const candidate = dueCandidate()
    const { tx, orgLogCreate } = txDoubles(candidate, 0)
    const { db } = dbWith([[candidate]], tx)

    await expect(purgeDueFrontDeskAccounts(NOW, db)).resolves.toEqual({ deleted: 0 })
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
    await expect(purgeDueFrontDeskAccounts(NOW, db)).resolves.toEqual({ deleted: 1 })
  })

  it("reads bounded batches and stops, never the whole table at once", async () => {
    const kept = Array.from({ length: FRONT_DESK_PURGE_BATCH }, (_, i) => keptCandidate({ id: `adm-kept-${String(i).padStart(3, "0")}` }))
    const { tx } = txDoubles(kept[0])
    const { db, findMany } = dbWith([kept], tx)

    await expect(purgeDueFrontDeskAccounts(NOW, db)).resolves.toEqual({ deleted: 0 })
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
    expect(Object.keys(result)).toEqual(["deleted"])
    expect(JSON.stringify(result)).not.toMatch(/Colette|colette@example\.org/)
  })
})
