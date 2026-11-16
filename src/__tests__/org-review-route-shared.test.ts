// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { describe, it, expect, vi, beforeEach } from "vitest"

/**
 * The review route delegates the approval to the one shared function (#1371): this file mocks it
 * to prove the route calls it with the operator actor and delivers the returned outbox ids, while
 * the end-to-end behaviour is covered by org-review-api.test.ts with the real function.
 */

const m = vi.hoisted(() => ({
  guard: vi.fn(),
  findUnique: vi.fn(),
  approveOrganization: vi.fn(),
  deliver: vi.fn(),
}))
vi.mock("@/lib/auth-guard", () => ({ requireSuperAdmin: m.guard }))
vi.mock("@/lib/org-approval-server", () => ({ approveOrganization: m.approveOrganization }))
vi.mock("@/lib/notifications/outbox", () => ({ deliverAfterResponse: m.deliver }))
vi.mock("@/lib/prisma", () => ({
  prisma: {
    organization: { findUnique: m.findUnique },
    $transaction: async (fn: (tx: unknown) => unknown) => fn({}),
  },
}))

const pending = { id: "org-fete", name: "Fête du village", slug: "fete-du-village", active: true, suspendedAt: null, publicationApprovedAt: null, outboundEmailApprovedAt: null }
const post = () => new Request("http://localhost/api/super-admin/organizations/org-fete/review", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ decision: "approve" }),
})
const params = { params: Promise.resolve({ id: "org-fete" }) }

describe("POST review delegates the approval", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    m.guard.mockResolvedValue({ db: {}, session: { user: { id: "sa-1", role: "super_admin", name: "Opérateur" } } })
    m.findUnique.mockResolvedValue(pending)
    m.approveOrganization.mockResolvedValue({ approved: true, outboxIds: ["outbox-1"] })
  })

  it("calls approveOrganization with the operator actor and returns the same response", async () => {
    const { POST } = await import("@/app/api/super-admin/organizations/[id]/review/route")
    const res = await POST(post(), params)

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, decision: "approve" })
    expect(m.approveOrganization).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      organizationId: "org-fete",
      actor: { type: "operator", id: "sa-1", label: "Opérateur" },
      now: expect.any(Date),
    }))
    expect(m.deliver).toHaveBeenCalledWith(["outbox-1"])
  })

  it("maps a failed shared grant to today's 409 without delivering anything", async () => {
    m.approveOrganization.mockResolvedValueOnce({ approved: false, reason: "already_approved" })
    const { POST } = await import("@/app/api/super-admin/organizations/[id]/review/route")
    const res = await POST(post(), params)

    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({ error: "Cet espace n'est pas en attente de validation." })
    expect(m.deliver).not.toHaveBeenCalled()
  })
})
