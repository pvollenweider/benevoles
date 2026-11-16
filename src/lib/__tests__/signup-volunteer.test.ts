// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { describe, it, expect, vi } from "vitest"
import { lockSignupVolunteer, SignupMatchMovedError, type SignupVolunteerTx } from "../signup-volunteer"

type Row = { id: string; erasedAt: Date | null; email: string | null }

/** Volunteer rows by id, as the locking reads see them once the lock is granted. */
function tx(rows: Row[], created: { count: number; id: string | null } = { count: 1, id: "vol-new" }) {
  const byId = new Map(rows.map((r) => [r.id, r]))
  if (created.id && !byId.has(created.id)) byId.set(created.id, { id: created.id, erasedAt: null, email: "julie@example.com" })
  const queries: string[] = []
  return {
    queries,
    byId,
    $queryRaw: vi.fn(async (strings: TemplateStringsArray, ...values: unknown[]) => {
      const sql = strings.join("?")
      queries.push(sql)
      const row = byId.get(values[0] as string)
      if (!row) return []
      // The fallback's lock: only while the row still holds the address and is not erased.
      if (sql.includes("email = ?")) return row.email === values[1] && !row.erasedAt ? [{ id: row.id }] : []
      return [row]
    }),
    volunteer: {
      createMany: vi.fn().mockResolvedValue({ count: created.count }),
      findFirstOrThrow: created.id
        ? vi.fn().mockResolvedValue({ id: created.id })
        : vi.fn().mockRejectedValue(Object.assign(new Error("No Volunteer found"), { code: "P2025" })),
    },
  }
}

const base = { organizationId: "org-1", email: "julie@example.com", create: { firstName: "Julie", lastName: "M" } }
const run = (t: ReturnType<typeof tx>, existingId: string | null) => lockSignupVolunteer(t as unknown as SignupVolunteerTx, { ...base, existingId })

describe("lockSignupVolunteer (#285, #516)", () => {
  it("an existing match, not erased: locked and reused, nothing created", async () => {
    const t = tx([{ id: "vol-1", erasedAt: null, email: "julie@example.com" }])
    expect(await run(t, "vol-1")).toEqual({ volunteerId: "vol-1", createdNow: false, matchErased: false })
    expect(t.queries[0]).toMatch(/FOR UPDATE/)
    expect(t.volunteer.createMany).not.toHaveBeenCalled()
  })

  it("an address stored with capitals (before #310) is still the same match", async () => {
    const t = tx([{ id: "vol-1", erasedAt: null, email: "Julie@Example.com" }])
    expect(await run(t, "vol-1")).toEqual({ volunteerId: "vol-1", createdNow: false, matchErased: false })
    expect(t.volunteer.createMany).not.toHaveBeenCalled()
  })

  it("a match erased before the lock: treated as no match, a new record is created and locked", async () => {
    const t = tx([{ id: "vol-1", erasedAt: new Date(), email: null }])
    expect(await run(t, "vol-1")).toEqual({ volunteerId: "vol-new", createdNow: true, matchErased: true })
    expect(t.volunteer.createMany).toHaveBeenCalledWith({ data: [expect.objectContaining({ email: "julie@example.com", organizationId: "org-1", firstName: "Julie" })], skipDuplicates: true })
    expect(t.queries.at(-1)).toMatch(/FOR UPDATE/)
  })

  it("no match: creates (or takes a concurrent sign-up's record) and locks it", async () => {
    const t = tx([], { count: 0, id: "vol-concurrent" })
    expect(await run(t, null)).toEqual({ volunteerId: "vol-concurrent", createdNow: false, matchErased: false })
    expect(t.queries).toHaveLength(1)
    expect(t.queries[0]).toMatch(/FOR UPDATE/)
  })
})

// #1138 follow-up: an address corrected between the lookup and the lock.
describe("lockSignupVolunteer: a match that lost the address", () => {
  it("corrected or removed before the lock: throws, creates nothing, locks no other member", async () => {
    for (const email of ["julie.corrected@example.com", null]) {
      const t = tx([{ id: "vol-1", erasedAt: null, email }])
      await expect(run(t, "vol-1")).rejects.toBeInstanceOf(SignupMatchMovedError)
      expect(t.volunteer.createMany).not.toHaveBeenCalled()
      expect(t.queries).toHaveLength(1)
    }
  })

  it("the record holding the address loses it before its lock: throws instead of locking it", async () => {
    const t = tx([{ id: "vol-other", erasedAt: null, email: "julie.moved@example.com" }], { count: 0, id: "vol-other" })
    await expect(run(t, null)).rejects.toBeInstanceOf(SignupMatchMovedError)
    expect(t.queries.at(-1)).toMatch(/email = \?[\s\S]*FOR UPDATE/)
  })

  it("the record holding the address is erased before its lock: throws", async () => {
    const t = tx([{ id: "vol-other", erasedAt: new Date(), email: null }], { count: 0, id: "vol-other" })
    await expect(run(t, null)).rejects.toBeInstanceOf(SignupMatchMovedError)
  })

  it("the address left its record between the insert and the read: throws; another read error is kept", async () => {
    await expect(run(tx([], { count: 0, id: null }), null)).rejects.toBeInstanceOf(SignupMatchMovedError)
    const t = tx([])
    t.volunteer.findFirstOrThrow.mockRejectedValue(new Error("connection lost"))
    await expect(run(t, null)).rejects.toThrow("connection lost")
  })
})
