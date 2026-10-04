// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { describe, it, expect, vi } from "vitest"
import { loadMemberActivity } from "../member-activity-data"
import type { OrgScopedPrisma } from "../prisma-org"

function mockDb(overrides: Record<string, unknown> = {}) {
  return {
    volunteer: { findFirst: vi.fn(), findMany: vi.fn().mockResolvedValue([]) },
    memberInvite: { findMany: vi.fn().mockResolvedValue([]) },
    registration: { findMany: vi.fn().mockResolvedValue([]) },
    sectorLeader: { findMany: vi.fn().mockResolvedValue([]) },
    orgLog: { findMany: vi.fn().mockResolvedValue([]) },
    ...overrides,
  } as unknown as OrgScopedPrisma
}

describe("loadMemberActivity — merged members (#600)", () => {
  it("also reads OrgLog entries kept under an absorbed record's own id", async () => {
    const orgLogFindMany = vi.fn().mockResolvedValue([])
    const db = mockDb({
      volunteer: {
        findFirst: vi.fn().mockResolvedValue({ id: "keep-1", firstName: "A", lastName: "B", email: "a@x.ch", active: true }),
        findMany: vi.fn().mockResolvedValue([{ id: "absorbed-1" }]),
      },
      orgLog: { findMany: orgLogFindMany },
    })

    await loadMemberActivity(db, "keep-1")

    expect(orgLogFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { entityType: "Member", entityId: { in: ["keep-1", "absorbed-1"] } } }),
    )
  })

  it("only reads its own id when no record was ever merged into it", async () => {
    const orgLogFindMany = vi.fn().mockResolvedValue([])
    const db = mockDb({
      volunteer: {
        findFirst: vi.fn().mockResolvedValue({ id: "keep-1", firstName: "A", lastName: "B", email: null, active: true }),
        findMany: vi.fn().mockResolvedValue([]),
      },
      orgLog: { findMany: orgLogFindMany },
    })

    await loadMemberActivity(db, "keep-1")

    expect(orgLogFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { entityType: "Member", entityId: { in: ["keep-1"] } } }),
    )
  })

  it("returns null for a member not found (cross-tenant or missing)", async () => {
    const db = mockDb({ volunteer: { findFirst: vi.fn().mockResolvedValue(null), findMany: vi.fn() } })
    expect(await loadMemberActivity(db, "ghost")).toBeNull()
  })
})
