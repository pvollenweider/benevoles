// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { describe, it, expect, vi } from "vitest"
import { cancelOutboxForDeletedMember, MEMBER_DELETED_CANCEL_REASON, type OutboxDeletionCancelDb } from "../outbox-deletion-cancel"

vi.mock("@/lib/env", () => ({ env: { AUTH_SECRET: "a".repeat(32) } }))

function mockDb(rows: { id: string; payload: unknown }[]): { db: OutboxDeletionCancelDb; updateMany: ReturnType<typeof vi.fn> } {
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

describe("cancelOutboxForDeletedMember (#667)", () => {
  it("cancels only the rows matching the deleted member, by volunteerId or email", async () => {
    const { db, updateMany } = mockDb([
      { id: "row-1", payload: { kind: "reminder_j2", volunteerId: "vol-deleted", recipient: {} } },
      { id: "row-2", payload: { kind: "reminder_j2", volunteerId: null, recipient: { email: "gone@example.com" } } },
      { id: "row-3", payload: { kind: "reminder_j2", volunteerId: "vol-someone-else", recipient: {} } },
    ])
    const ids = await cancelOutboxForDeletedMember(db, "org-1", { volunteerId: "vol-deleted", email: "gone@example.com" })
    expect(ids.sort()).toEqual(["row-1", "row-2"])
    expect(updateMany).toHaveBeenCalledWith({ where: { id: { in: ["row-1", "row-2"] } }, data: { status: "failed", lastError: MEMBER_DELETED_CANCEL_REASON } })
  })

  it("queries only pending rows of the organization", async () => {
    const { db } = mockDb([])
    await cancelOutboxForDeletedMember(db, "org-1", { volunteerId: "vol-deleted", email: null })
    expect(db.notificationOutbox.findMany).toHaveBeenCalledWith({ where: { organizationId: "org-1", status: "pending" }, select: { id: true, payload: true } })
  })

  it("does nothing and never calls updateMany when nothing matches", async () => {
    const { db, updateMany } = mockDb([{ id: "row-1", payload: { kind: "reminder_j2", volunteerId: "vol-other", recipient: {} } }])
    const ids = await cancelOutboxForDeletedMember(db, "org-1", { volunteerId: "vol-deleted", email: null })
    expect(ids).toEqual([])
    expect(updateMany).not.toHaveBeenCalled()
  })

  it("skips a row it cannot open (key rotated away) rather than failing the whole deletion", async () => {
    const { db, updateMany } = mockDb([{ id: "row-1", payload: { enc: "not-valid-ciphertext" } }])
    const ids = await cancelOutboxForDeletedMember(db, "org-1", { volunteerId: "vol-deleted", email: null })
    expect(ids).toEqual([])
    expect(updateMany).not.toHaveBeenCalled()
  })
})
