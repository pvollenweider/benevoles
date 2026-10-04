// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { describe, it, expect, vi } from "vitest"
import { cancelOutboxForMergedMember, matchesAbsorbedRecipient, MERGED_MEMBER_CANCEL_REASON, type OutboxMergeCancelDb } from "../outbox-merge-cancel"

vi.mock("@/lib/env", () => ({ env: { AUTH_SECRET: "a".repeat(32) } }))

describe("matchesAbsorbedRecipient", () => {
  const absorbed = { volunteerId: "vol-absorbed", email: "wrong@example.com" }

  it("matches by volunteerId when the payload carries one, ignoring the email entirely", () => {
    expect(matchesAbsorbedRecipient({ volunteerId: "vol-absorbed", recipient: { email: "someone-else@example.com" } }, absorbed)).toBe(true)
    expect(matchesAbsorbedRecipient({ volunteerId: "vol-other", recipient: { email: "wrong@example.com" } }, absorbed)).toBe(false)
  })

  it("falls back to a normalized email match when the payload has no volunteerId", () => {
    expect(matchesAbsorbedRecipient({ volunteerId: null, recipient: { email: "Wrong@Example.com  " } }, absorbed)).toBe(true)
    expect(matchesAbsorbedRecipient({ volunteerId: undefined, recipient: { email: "someone-else@example.com" } }, absorbed)).toBe(false)
  })

  it("never matches when there's nothing to compare", () => {
    expect(matchesAbsorbedRecipient({ volunteerId: null, recipient: {} }, absorbed)).toBe(false)
    expect(matchesAbsorbedRecipient({ volunteerId: null, recipient: { email: "wrong@example.com" } }, { volunteerId: "vol-absorbed", email: null })).toBe(false)
  })
})

function mockDb(rows: { id: string; payload: unknown }[]): { db: OutboxMergeCancelDb; updateMany: ReturnType<typeof vi.fn> } {
  const updateMany = vi.fn().mockResolvedValue({ count: rows.length })
  return {
    db: {
      notificationOutbox: {
        findMany: vi.fn().mockResolvedValue(rows),
        updateMany,
      },
    },
    updateMany,
  }
}

describe("cancelOutboxForMergedMember", () => {
  it("cancels only the rows matching the absorbed member, by volunteerId or email", async () => {
    const { db, updateMany } = mockDb([
      { id: "row-1", payload: { kind: "reminder_j2", volunteerId: "vol-absorbed", recipient: {} } },
      { id: "row-2", payload: { kind: "reminder_j2", volunteerId: null, recipient: { email: "wrong@example.com" } } },
      { id: "row-3", payload: { kind: "reminder_j2", volunteerId: "vol-someone-else", recipient: {} } },
    ])
    const ids = await cancelOutboxForMergedMember(db, "org-1", { volunteerId: "vol-absorbed", email: "wrong@example.com" })
    expect(ids.sort()).toEqual(["row-1", "row-2"])
    expect(updateMany).toHaveBeenCalledWith({ where: { id: { in: ["row-1", "row-2"] } }, data: { status: "failed", lastError: MERGED_MEMBER_CANCEL_REASON } })
  })

  it("queries only pending rows of the organization", async () => {
    const { db } = mockDb([])
    await cancelOutboxForMergedMember(db, "org-1", { volunteerId: "vol-absorbed", email: null })
    expect(db.notificationOutbox.findMany).toHaveBeenCalledWith({ where: { organizationId: "org-1", status: "pending" }, select: { id: true, payload: true } })
  })

  it("does nothing and never calls updateMany when nothing matches", async () => {
    const { db, updateMany } = mockDb([{ id: "row-1", payload: { kind: "reminder_j2", volunteerId: "vol-other", recipient: {} } }])
    const ids = await cancelOutboxForMergedMember(db, "org-1", { volunteerId: "vol-absorbed", email: null })
    expect(ids).toEqual([])
    expect(updateMany).not.toHaveBeenCalled()
  })

  it("skips a row it can't open (key rotated away) instead of throwing", async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 0 })
    const db: OutboxMergeCancelDb = {
      notificationOutbox: {
        findMany: vi.fn().mockResolvedValue([{ id: "row-1", payload: { enc: "v2:unknown-key:aa:bb:cc" } }]),
        updateMany,
      },
    }
    const ids = await cancelOutboxForMergedMember(db, "org-1", { volunteerId: "vol-absorbed", email: null })
    expect(ids).toEqual([])
    expect(updateMany).not.toHaveBeenCalled()
  })
})
