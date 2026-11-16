// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { describe, it, expect, vi, beforeEach } from "vitest"
import { BULK_DELETE_BATCH_SIZE } from "../member-bulk-deletion"
import type { OrgScopedPrisma } from "../prisma-org"

const cancelOutbox = vi.fn()
vi.mock("../outbox-deletion-cancel", () => ({
  cancelOutboxForDeletedMember: (...args: unknown[]) => cancelOutbox(...args),
}))

import { runBulkMemberDeletion } from "../member-deletion-transaction"

const ORG = "org-a"
const ACTOR = { type: "admin" as const, id: "adm-1" }

function transaction(over: {
  members?: Record<string, unknown>[]
  counts?: { volunteerId: string; _count: { _all: number } }[]
  deleted?: string[]
} = {}) {
  const deleted = over.deleted ?? []
  const volunteerDelete = vi.fn(async ({ where }: { where: { id: string } }) => { deleted.push(where.id); return { id: where.id } })
  const volunteerUpdate = vi.fn(async ({ where }: { where: { id: string } }) => ({ id: where.id }))
  const orgLogCreate = vi.fn().mockResolvedValue({ id: "log-1" })
  const tx = {
    $queryRaw: vi.fn().mockResolvedValue([]),
    volunteer: {
      findMany: vi.fn().mockResolvedValue(over.members ?? []),
      delete: volunteerDelete,
      update: volunteerUpdate,
    },
    registration: { groupBy: vi.fn().mockResolvedValue(over.counts ?? []) },
    orgLog: { create: orgLogCreate },
  }
  return { tx, volunteerDelete, volunteerUpdate, orgLogCreate }
}

function dbWith(tx: unknown) {
  const $transaction = vi.fn(async (fn: (client: unknown) => unknown) => fn(tx))
  return { db: { $transaction } as unknown as OrgScopedPrisma, $transaction }
}

describe("runBulkMemberDeletion (#1305)", () => {
  beforeEach(() => {
    cancelOutbox.mockReset()
    cancelOutbox.mockResolvedValue([])
  })

  it("deletes eligible records and reports each skipped one with its reason, logging one entry per deletion", async () => {
    const { tx, volunteerDelete, orgLogCreate } = transaction({
      members: [
        { id: "active", firstName: "Anne", lastName: "Favre", email: "anne@x.ch", active: true, mergedIntoId: null },
        { id: "with-reg", firstName: "Marc", lastName: "Rochat", email: null, active: true, mergedIntoId: null },
        { id: "merged", firstName: "", lastName: "", email: null, active: false, mergedIntoId: "active" },
      ],
      counts: [{ volunteerId: "with-reg", _count: { _all: 2 } }],
    })
    const { db } = dbWith(tx)

    const result = await runBulkMemberDeletion(db, ORG, ACTOR, ["active", "with-reg", "merged", "missing"])

    expect(result).toEqual({
      deleted: ["active"],
      skipped: [
        { id: "with-reg", reason: "registrations", name: "Marc Rochat" },
        { id: "merged", reason: "merged", name: null },
        { id: "missing", reason: "notFound", name: null },
      ],
      deactivated: [],
    })
    expect(volunteerDelete).toHaveBeenCalledTimes(1)
    expect(volunteerDelete).toHaveBeenCalledWith({ where: { id: "active" } })
    expect(cancelOutbox).toHaveBeenCalledWith(expect.anything(), ORG, { volunteerId: "active", email: "anne@x.ch" })
    expect(orgLogCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ organizationId: ORG, action: "member.deleted", entityType: "Member", entityId: "active" }),
    }))
  })

  it("with deactivateKept, deactivates the kept active records in the same transaction, and logs it (#1307)", async () => {
    const { tx, volunteerUpdate, orgLogCreate } = transaction({
      members: [
        { id: "with-reg", firstName: "Marc", lastName: "Rochat", email: null, active: true, mergedIntoId: null },
        { id: "inactive-with-reg", firstName: "Léa", lastName: "Dubois", email: null, active: false, mergedIntoId: null },
      ],
      counts: [
        { volunteerId: "with-reg", _count: { _all: 2 } },
        { volunteerId: "inactive-with-reg", _count: { _all: 1 } },
      ],
    })
    const { db } = dbWith(tx)

    const result = await runBulkMemberDeletion(db, ORG, ACTOR, ["with-reg", "inactive-with-reg"], { deactivateKept: true })

    expect(result).toEqual({
      deleted: [],
      skipped: [
        { id: "with-reg", reason: "registrations", name: "Marc Rochat" },
        { id: "inactive-with-reg", reason: "registrations", name: "Léa Dubois" },
      ],
      deactivated: ["with-reg"],
    })
    // The already inactive kept record is never deactivated a second time.
    expect(volunteerUpdate).toHaveBeenCalledTimes(1)
    expect(volunteerUpdate).toHaveBeenCalledWith({ where: { id: "with-reg" }, data: { active: false } })
    expect(orgLogCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ organizationId: ORG, action: "member.deactivated", entityType: "Member", entityId: "with-reg" }),
    }))
  })

  it("splits a long selection into batches, each in its own transaction", async () => {
    const ids = Array.from({ length: BULK_DELETE_BATCH_SIZE + 1 }, (_, i) => `id-${i}`)
    const { tx } = transaction()
    const { db, $transaction } = dbWith(tx)

    const result = await runBulkMemberDeletion(db, ORG, ACTOR, ids)

    expect($transaction).toHaveBeenCalledTimes(2)
    expect(result.deleted).toEqual([])
    expect(result.skipped).toHaveLength(ids.length)
  })
})
