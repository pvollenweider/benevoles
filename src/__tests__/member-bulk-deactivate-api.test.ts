// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { describe, it, expect, vi, beforeEach } from "vitest"
import { NextResponse } from "next/server"
import { PERMISSIONS } from "@/lib/permissions"
import { BULK_DEACTIVATE_MAX } from "@/lib/member-bulk-deactivation"

const requireOrgSession = vi.fn()
const runBulkMemberDeactivation = vi.fn()
const rateLimit = vi.fn()

vi.mock("@/lib/auth-guard", () => ({ requireOrgSession: (...args: unknown[]) => requireOrgSession(...args) }))
vi.mock("@/lib/event-log", () => ({ adminActor: () => ({ type: "admin", id: "adm-1" }) }))
vi.mock("@/lib/member-deactivation-transaction", () => ({
  runBulkMemberDeactivation: (...args: unknown[]) => runBulkMemberDeactivation(...args),
}))
vi.mock("@/lib/rate-limit", () => ({ rateLimit: (...args: unknown[]) => rateLimit(...args) }))

import { POST } from "@/app/api/admin/members/bulk-deactivate/route"

const call = (body: unknown) => POST(new Request("http://x/api/admin/members/bulk-deactivate", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
}))

describe("POST /api/admin/members/bulk-deactivate (#1307)", () => {
  beforeEach(() => {
    requireOrgSession.mockReset()
    runBulkMemberDeactivation.mockReset()
    rateLimit.mockReset()
    requireOrgSession.mockResolvedValue({ db: {}, organizationId: "org-a", session: { user: { id: "adm-1" } } })
    runBulkMemberDeactivation.mockResolvedValue({ deactivated: [], skipped: [] })
    rateLimit.mockResolvedValue({ ok: true, remaining: 59, retryAfter: 0 })
  })

  it("is open to organisers and owners, like the single-member deactivation", () => {
    expect(PERMISSIONS["members/bulk-deactivate"]).toEqual({ POST: "organizer" })
  })

  it("refuses without a session (the guard's own answer) and does nothing", async () => {
    requireOrgSession.mockResolvedValue(NextResponse.json({ error: "Non autorisé" }, { status: 401 }))
    const res = await call({ ids: ["a"] })
    expect(res.status).toBe(401)
    expect(runBulkMemberDeactivation).not.toHaveBeenCalled()
  })

  it("refuses a missing, empty or malformed selection", async () => {
    for (const body of [{}, { ids: [] }, { ids: "a" }, { ids: [""] }, { ids: [1] }]) {
      const res = await call(body)
      expect(res.status, JSON.stringify(body)).toBe(400)
    }
    expect(runBulkMemberDeactivation).not.toHaveBeenCalled()
  })

  it("refuses more than 500 distinct ids with a clear message", async () => {
    const ids = Array.from({ length: BULK_DEACTIVATE_MAX + 1 }, (_, i) => `id-${i}`)
    const res = await call({ ids })
    expect(res.status).toBe(400)
    expect((await res.json()).error).toContain("500")
    expect(runBulkMemberDeactivation).not.toHaveBeenCalled()
  })

  it("de-duplicates before applying the ceiling", async () => {
    const ids = Array.from({ length: BULK_DEACTIVATE_MAX }, (_, i) => `id-${i}`)
    const res = await call({ ids: [...ids, ids[0]] })
    expect(res.status).toBe(200)
    expect(runBulkMemberDeactivation).toHaveBeenCalledWith({}, "org-a", { type: "admin", id: "adm-1" }, ids)
  })

  it("returns the deactivated and skipped lists from the transaction", async () => {
    const outcome = {
      deactivated: ["a", "b"],
      skipped: [
        { id: "c", reason: "inactive", name: "Anne Favre" },
        { id: "d", reason: "merged", name: null },
        { id: "e", reason: "notFound", name: null },
      ],
    }
    runBulkMemberDeactivation.mockResolvedValue(outcome)
    const res = await call({ ids: ["a", "b", "c", "d", "e"] })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual(outcome)
  })

  it("is rate limited like the bulk deletion", async () => {
    rateLimit.mockResolvedValue({ ok: false, remaining: 0, retryAfter: 120 })
    const res = await call({ ids: ["a"] })
    expect(res.status).toBe(429)
    expect(res.headers.get("Retry-After")).toBe("120")
    expect(rateLimit).toHaveBeenCalledWith("org:org-a", "member-bulk-deactivate", 60, 60 * 60 * 1000)
    expect(runBulkMemberDeactivation).not.toHaveBeenCalled()
  })
})
