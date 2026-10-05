// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { describe, it, expect, vi, beforeEach } from "vitest"

const runMemberMerge = vi.fn()
const reported = vi.fn()

vi.mock("@/lib/auth-guard", () => ({ requireOrgSession: async () => ({ db: {}, organizationId: "org-1", session: { user: { id: "adm-1" } } }) }))
vi.mock("@/lib/event-log", () => ({ adminActor: () => ({ type: "admin", id: "adm-1" }) }))
vi.mock("@/lib/member-merge-transaction", () => ({
  runMemberMerge: (...args: unknown[]) => runMemberMerge(...args),
  MergeConflictError: class MergeConflictError extends Error { status = 409 },
}))
vi.mock("@/lib/notifications", () => ({ sendNotification: vi.fn() }))
vi.mock("@/lib/notification-helpers", () => ({ sendMemberInvite: vi.fn() }))
vi.mock("@/lib/report-error", () => ({ reportError: (context: string) => (e: unknown) => reported(context, e) }))

import { POST } from "@/app/api/admin/members/[id]/merge/route"

const call = () =>
  POST(new Request("http://x/api/admin/members/keep/merge", { method: "POST", body: JSON.stringify({ otherId: "absorb", choices: { fields: { email: "absorb" } } }) }), {
    params: Promise.resolve({ id: "keep" }),
  })

describe("POST /api/admin/members/[id]/merge — unexpected failure", () => {
  beforeEach(() => {
    runMemberMerge.mockReset()
    reported.mockReset()
  })

  it("answers JSON saying nothing was changed, and reports the error, when the transaction throws (regression: HTML 500 read as a cut connection)", async () => {
    const error = Object.assign(new Error("Unique constraint failed on the constraint: `Volunteer_organizationId_email_key`"), { code: "P2002" })
    runMemberMerge.mockRejectedValue(error)

    const res = await call()

    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ error: "La fusion n'a pas pu être faite. Rien n'a été modifié.", notApplied: true })
    expect(reported).toHaveBeenCalledWith("member.merge", error)
  })
})
