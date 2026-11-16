// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { describe, it, expect, vi } from "vitest"

/**
 * The statistics count approvals from the operator log by action only (#1371): a manual approval
 * and an automatic one share `organization.approved`, so both are counted without another query.
 */

const m = vi.hoisted(() => ({
  operatorLogCount: vi.fn(),
  platformCounterFindMany: vi.fn(),
  orgFindMany: vi.fn(),
  orgCount: vi.fn(),
}))

vi.mock("../prisma", () => ({
  prisma: {
    platformCounter: { findMany: m.platformCounterFindMany },
    operatorLog: { count: m.operatorLogCount },
    organization: { findMany: m.orgFindMany, count: m.orgCount },
  },
}))

import { loadSignupFacts } from "../usage-stats"
import { INDICATOR_DAYS } from "../signup-indicators"
import { DAY_MS } from "../retention"

const NOW = new Date("2026-11-17T12:00:00Z")

describe("loadSignupFacts: approvals from either actor", () => {
  it("counts every organization.approved entry, without filtering on the source or the actor", async () => {
    m.platformCounterFindMany.mockResolvedValue([])
    m.operatorLogCount.mockImplementation(async ({ where }: { where: { action: string } }) => where.action === "organization.approved" ? 2 : 0)
    m.orgFindMany.mockResolvedValue([])
    m.orgCount.mockResolvedValue(0)

    const facts = await loadSignupFacts(NOW)

    const approvalCall = m.operatorLogCount.mock.calls.find(([args]) => args.where.action === "organization.approved")
    expect(approvalCall?.[0].where).toEqual({
      action: "organization.approved",
      createdAt: { gte: new Date(NOW.getTime() - INDICATOR_DAYS * DAY_MS) },
    })
    expect(approvalCall?.[0].where).not.toHaveProperty("source")
    expect(approvalCall?.[0].where).not.toHaveProperty("actorId")
    expect(facts.approved).toBe(2)
  })
})
