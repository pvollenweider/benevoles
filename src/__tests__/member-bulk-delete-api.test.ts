// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { describe, it, expect, vi, beforeEach } from "vitest"
import { NextResponse } from "next/server"
import { PERMISSIONS } from "@/lib/permissions"
import { BULK_DELETE_MAX } from "@/lib/member-bulk-deletion"

const requireOrgSession = vi.fn()
const runBulkMemberDeletion = vi.fn()

vi.mock("@/lib/auth-guard", () => ({ requireOrgSession: (...args: unknown[]) => requireOrgSession(...args) }))
vi.mock("@/lib/event-log", () => ({ adminActor: () => ({ type: "admin", id: "adm-1" }) }))
vi.mock("@/lib/member-deletion-transaction", () => ({
  runBulkMemberDeletion: (...args: unknown[]) => runBulkMemberDeletion(...args),
}))
vi.mock("@/lib/rate-limit", () => ({ rateLimit: vi.fn(async () => ({ ok: true, remaining: 59, retryAfter: 0 })) }))

import { POST } from "@/app/api/admin/members/bulk-delete/route"

const call = (body: unknown) => POST(new Request("http://x/api/admin/members/bulk-delete", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
}))

describe("POST /api/admin/members/bulk-delete (#1305)", () => {
  beforeEach(() => {
    requireOrgSession.mockReset()
    runBulkMemberDeletion.mockReset()
    requireOrgSession.mockResolvedValue({ db: {}, organizationId: "org-a", session: { user: { id: "adm-1" } } })
    runBulkMemberDeletion.mockResolvedValue({ deleted: [], skipped: [], deactivated: [] })
  })

  it("is open to organisers and owners, like the single-member deletion", () => {
    expect(PERMISSIONS["members/bulk-delete"]).toEqual({ POST: "organizer" })
  })

  it("refuses without a session (the guard's own answer) and does nothing", async () => {
    requireOrgSession.mockResolvedValue(NextResponse.json({ error: "Non autorisé" }, { status: 401 }))
    const res = await call({ ids: ["a"] })
    expect(res.status).toBe(401)
    expect(runBulkMemberDeletion).not.toHaveBeenCalled()
  })

  it("refuses a missing, empty or malformed selection", async () => {
    for (const body of [{}, { ids: [] }, { ids: "a" }, { ids: [""] }, { ids: [1] }]) {
      const res = await call(body)
      expect(res.status, JSON.stringify(body)).toBe(400)
    }
    expect(runBulkMemberDeletion).not.toHaveBeenCalled()
  })

  it("refuses more than 500 distinct ids with a clear message", async () => {
    const ids = Array.from({ length: BULK_DELETE_MAX + 1 }, (_, i) => `id-${i}`)
    const res = await call({ ids })
    expect(res.status).toBe(400)
    expect((await res.json()).error).toContain("500")
    expect(runBulkMemberDeletion).not.toHaveBeenCalled()
  })

  it("de-duplicates before applying the ceiling", async () => {
    const ids = Array.from({ length: BULK_DELETE_MAX }, (_, i) => `id-${i}`)
    const res = await call({ ids: [...ids, ids[0]] })
    expect(res.status).toBe(200)
    expect(runBulkMemberDeletion).toHaveBeenCalledWith({}, "org-a", { type: "admin", id: "adm-1" }, ids, { deactivateKept: false })
  })

  it("returns the deleted, skipped and deactivated lists from the transaction", async () => {
    const outcome = {
      deleted: ["a", "b"],
      skipped: [
        { id: "c", reason: "registrations", name: "Anne Favre" },
        { id: "d", reason: "merged", name: null },
        { id: "e", reason: "notFound", name: null },
      ],
      deactivated: [],
    }
    runBulkMemberDeletion.mockResolvedValue(outcome)
    const res = await call({ ids: ["a", "b", "c", "d", "e"] })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual(outcome)
  })

  it("forwards deactivateKept to the transaction and returns the deactivated ids (#1307)", async () => {
    const outcome = {
      deleted: ["a"],
      skipped: [{ id: "c", reason: "registrations", name: "Anne Favre" }],
      deactivated: ["c"],
    }
    runBulkMemberDeletion.mockResolvedValue(outcome)
    const res = await call({ ids: ["a", "c"], deactivateKept: true })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual(outcome)
    expect(runBulkMemberDeletion).toHaveBeenCalledWith({}, "org-a", { type: "admin", id: "adm-1" }, ["a", "c"], { deactivateKept: true })
  })

  it("refuses a non-boolean deactivateKept", async () => {
    const res = await call({ ids: ["a"], deactivateKept: "yes" })
    expect(res.status).toBe(400)
    expect(runBulkMemberDeletion).not.toHaveBeenCalled()
  })
})
