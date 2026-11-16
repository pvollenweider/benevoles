// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { describe, it, expect, vi, beforeEach } from "vitest"

const m = vi.hoisted(() => ({
  findFirst: vi.fn(),
  count: vi.fn(),
  updateMany: vi.fn(),
  occurrenceUpdateMany: vi.fn(),
  executeRaw: vi.fn(),
  transaction: vi.fn(),
}))

vi.mock("../prisma", () => ({
  prisma: { $transaction: m.transaction },
}))
vi.mock("../env", () => ({ env: {} }))
vi.mock("../notifications/index", () => ({ sendNotification: vi.fn() }))
vi.mock("../report-error", () => ({ reportError: () => () => {} }))

import { retryOutboxRow } from "../outbox-data"

beforeEach(() => {
  for (const fn of Object.values(m)) fn.mockReset()
  m.transaction.mockImplementation(async (step: (tx: unknown) => Promise<unknown>) => step({
    notificationOutbox: { findFirst: m.findFirst, count: m.count, updateMany: m.updateMany },
    reminderOccurrence: { updateMany: m.occurrenceUpdateMany },
    $executeRaw: m.executeRaw,
  }))
  m.findFirst.mockResolvedValue({ dedupeKey: null, createdAt: new Date("2030-01-01T00:00:00Z") })
  m.updateMany.mockResolvedValue({ count: 1 })
  m.occurrenceUpdateMany.mockResolvedValue({ count: 1 })
})

describe("retryOutboxRow: a failed custom reminder (#1139)", () => {
  it("reopens the failed occurrence with its outbox row, same transaction and same outbox id", async () => {
    expect(await retryOutboxRow("row-1", "org-1")).toBe(true)

    expect(m.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ id: "row-1", organizationId: "org-1", status: "failed" }),
      data: expect.objectContaining({ status: "pending", attempts: 0, claimedAt: null }),
    }))
    expect(m.occurrenceUpdateMany).toHaveBeenCalledWith({
      where: { outboxId: "row-1", status: "failed", volunteer: { erasedAt: null } },
      data: { status: "queued", sentAt: null, lastError: null },
    })
  })

  it("still succeeds when there is no occurrence left (a merge, an erasure or a deleted event)", async () => {
    m.occurrenceUpdateMany.mockResolvedValue({ count: 0 })
    expect(await retryOutboxRow("row-1", "org-1")).toBe(true)
    // The row itself was put back, like any other kind: nothing else to report.
    expect(m.updateMany).toHaveBeenCalledOnce()
  })

  it("never reopens an occurrence when the row itself is not put back (cancelled, merged or deleted)", async () => {
    m.updateMany.mockResolvedValue({ count: 0 })
    expect(await retryOutboxRow("row-1", "org-1")).toBe(false)
    expect(m.occurrenceUpdateMany).not.toHaveBeenCalled()
  })
})
