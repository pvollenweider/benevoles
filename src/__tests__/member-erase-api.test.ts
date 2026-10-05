// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { describe, it, expect, vi, beforeEach } from "vitest"

const runMemberErasure = vi.fn()
const reported = vi.fn()
const requireOrgSession = vi.fn()

vi.mock("@/lib/auth-guard", () => ({ requireOrgSession: (...args: unknown[]) => requireOrgSession(...args) }))
vi.mock("@/lib/event-log", () => ({ adminActor: () => ({ type: "admin", id: "adm-1" }) }))
vi.mock("@/lib/member-erasure-transaction", () => ({
  runMemberErasure: (...args: unknown[]) => runMemberErasure(...args),
  MemberErasureConflictError: class MemberErasureConflictError extends Error {
    constructor(message: string, readonly status: 404 | 409 = 409) { super(message) }
  },
}))
vi.mock("@/lib/report-error", () => ({ reportError: (context: string) => (e: unknown) => reported(context, e) }))

import { POST } from "@/app/api/admin/members/[id]/erase/route"
import { MemberErasureConflictError } from "@/lib/member-erasure-transaction"
import { PERMISSIONS } from "@/lib/permissions"

const call = () => POST(new Request("http://x/api/admin/members/vol-1/erase", { method: "POST" }), { params: Promise.resolve({ id: "vol-1" }) })

describe("POST /api/admin/members/[id]/erase (#516)", () => {
  beforeEach(() => {
    runMemberErasure.mockReset()
    reported.mockReset()
    requireOrgSession.mockReset()
    requireOrgSession.mockResolvedValue({ db: {}, organizationId: "org-1", session: { user: { id: "adm-1" } } })
  })

  it("is open to owners and organizers (owner decision), checked at organizer level", async () => {
    expect(PERMISSIONS["members/[id]/erase"]).toEqual({ POST: "organizer" })
    runMemberErasure.mockResolvedValue({ id: "vol-1", alreadyErased: false, erasedAt: new Date("2026-10-05T10:00:00Z") })
    await call()
    expect(requireOrgSession).toHaveBeenCalledWith()
  })

  it("erases through the transaction with the admin as actor, and answers success", async () => {
    runMemberErasure.mockResolvedValue({ id: "vol-1", alreadyErased: false, erasedAt: new Date("2026-10-05T10:00:00Z") })
    const res = await call()
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ success: true, alreadyErased: false, erasedAt: "2026-10-05T10:00:00.000Z" })
    expect(runMemberErasure).toHaveBeenCalledWith({}, "org-1", { type: "admin", id: "adm-1" }, "vol-1")
  })

  it("says so when the record was already erased (idempotent)", async () => {
    runMemberErasure.mockResolvedValue({ id: "vol-1", alreadyErased: true, erasedAt: new Date("2026-10-01T10:00:00Z") })
    expect(await (await call()).json()).toEqual({ success: true, alreadyErased: true, erasedAt: "2026-10-01T10:00:00.000Z" })
  })

  it("maps a refusal to its status and message (404 another organisation's or missing, 409 a tombstone)", async () => {
    runMemberErasure.mockRejectedValueOnce(new MemberErasureConflictError("Non trouvé", 404))
    expect((await call()).status).toBe(404)
    runMemberErasure.mockRejectedValueOnce(new MemberErasureConflictError("C'est une fiche fusionnée dans une autre.", 409))
    const res = await call()
    expect(res.status).toBe(409)
    expect((await res.json()).error).toMatch(/fusionnée/)
  })

  it("answers JSON saying nothing was changed, and reports the error, when the transaction fails", async () => {
    const error = new Error("boom")
    runMemberErasure.mockRejectedValue(error)
    const res = await call()
    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ error: "L'effacement n'a pas pu être fait. Rien n'a été modifié.", notApplied: true })
    expect(reported).toHaveBeenCalledWith("member.erase", error)
  })

  it("refuses without a session (the guard's own answer)", async () => {
    const { NextResponse } = await import("next/server")
    requireOrgSession.mockResolvedValue(NextResponse.json({ error: "Non autorisé" }, { status: 401 }))
    expect((await call()).status).toBe(401)
    expect(runMemberErasure).not.toHaveBeenCalled()
  })
})
