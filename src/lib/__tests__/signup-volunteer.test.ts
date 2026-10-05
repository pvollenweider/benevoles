// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { describe, it, expect, vi } from "vitest"
import { lockSignupVolunteer, type SignupVolunteerTx } from "../signup-volunteer"

function tx(locked: { id: string; erasedAt: Date | null }[], created = { count: 1, id: "vol-new" }) {
  const queries: string[] = []
  return {
    queries,
    $queryRaw: vi.fn(async (strings: TemplateStringsArray) => {
      queries.push(strings.join("?"))
      return strings.join("?").includes("erasedAt") ? locked : []
    }),
    volunteer: {
      createMany: vi.fn().mockResolvedValue({ count: created.count }),
      findFirstOrThrow: vi.fn().mockResolvedValue({ id: created.id }),
    },
  }
}

const base = { organizationId: "org-1", email: "julie@example.com", create: { firstName: "Julie", lastName: "M" } }

describe("lockSignupVolunteer (#285, #516)", () => {
  it("an existing match, not erased: locked and reused, nothing created", async () => {
    const t = tx([{ id: "vol-1", erasedAt: null }])
    expect(await lockSignupVolunteer(t as unknown as SignupVolunteerTx, { ...base, existingId: "vol-1" })).toEqual({ volunteerId: "vol-1", createdNow: false, matchErased: false })
    expect(t.queries[0]).toMatch(/FOR UPDATE/)
    expect(t.volunteer.createMany).not.toHaveBeenCalled()
  })

  it("a match erased before the lock: treated as no match, a new record is created and locked", async () => {
    const t = tx([{ id: "vol-1", erasedAt: new Date() }])
    expect(await lockSignupVolunteer(t as unknown as SignupVolunteerTx, { ...base, existingId: "vol-1" })).toEqual({ volunteerId: "vol-new", createdNow: true, matchErased: true })
    expect(t.volunteer.createMany).toHaveBeenCalledWith({ data: [expect.objectContaining({ email: "julie@example.com", organizationId: "org-1", firstName: "Julie" })], skipDuplicates: true })
    expect(t.queries.at(-1)).toMatch(/FOR UPDATE/)
  })

  it("no match: creates (or takes a concurrent sign-up's record) and locks it", async () => {
    const t = tx([], { count: 0, id: "vol-concurrent" })
    expect(await lockSignupVolunteer(t as unknown as SignupVolunteerTx, { ...base, existingId: null })).toEqual({ volunteerId: "vol-concurrent", createdNow: false, matchErased: false })
    expect(t.queries).toHaveLength(1)
    expect(t.queries[0]).toMatch(/FOR UPDATE/)
  })
})
