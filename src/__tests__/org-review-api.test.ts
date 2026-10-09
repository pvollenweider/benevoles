import { describe, it, expect, vi, beforeEach } from "vitest"
import { NextResponse } from "next/server"

const m = vi.hoisted(() => ({
  guard: vi.fn(),
  findUnique: vi.fn(),
  orgUpdate: vi.fn(),
  orgDelete: vi.fn(),
  adminDeleteMany: vi.fn(),
  adminFindMany: vi.fn(),
  logCreate: vi.fn(),
  operatorLogCreate: vi.fn(),
  enqueue: vi.fn(),
  deliver: vi.fn(),
}))
vi.mock("@/lib/auth-guard", () => ({ requireSuperAdmin: m.guard }))
vi.mock("@/lib/notifications/outbox", () => ({ enqueueNotifications: m.enqueue, deliverAfterResponse: m.deliver }))
vi.mock("@/lib/prisma", () => {
  const tx = {
    organization: { update: m.orgUpdate, delete: m.orgDelete },
    adminUser: { deleteMany: m.adminDeleteMany, findMany: m.adminFindMany },
    orgLog: { create: m.logCreate },
    operatorLog: { create: m.operatorLogCreate },
  }
  return { prisma: { organization: { findUnique: m.findUnique }, $transaction: async (fn: (t: typeof tx) => unknown) => fn(tx) } }
})

const pending = { id: "org-1", name: "Fête", slug: "fete", active: true, suspendedAt: null, publicationApprovedAt: null, outboundEmailApprovedAt: null }
const post = (decision: unknown) => new Request("http://localhost/api/super-admin/organizations/org-1/review", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ decision }) })
const params = { params: Promise.resolve({ id: "org-1" }) }

describe("POST /api/super-admin/organizations/[id]/review (#810, part 4c)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    m.guard.mockResolvedValue({ db: {}, session: { user: { id: "sa-1", role: "super_admin", name: "Opérateur" } } })
    m.findUnique.mockResolvedValue(pending)
    m.adminFindMany.mockResolvedValue([{ email: "owner@example.org", name: "Camille" }])
    m.enqueue.mockResolvedValue(["o1"])
  })

  it("is for the super admin only", async () => {
    m.guard.mockResolvedValueOnce(NextResponse.json({ error: "Non autorisé" }, { status: 403 }))
    const { POST } = await import("@/app/api/super-admin/organizations/[id]/review/route")
    expect((await POST(post("approve"), params)).status).toBe(403)
    expect(m.findUnique).not.toHaveBeenCalled()
  })

  it("approves: both grants, logged, administrators emailed", async () => {
    const { POST } = await import("@/app/api/super-admin/organizations/[id]/review/route")
    const res = await POST(post("approve"), params)
    expect(res.status).toBe(200)
    const data = m.orgUpdate.mock.calls[0][0].data
    expect(data.publicationApprovedAt).toBeInstanceOf(Date)
    expect(data.outboundEmailApprovedAt).toBeInstanceOf(Date)
    expect(m.logCreate).toHaveBeenCalledWith({ data: expect.objectContaining({ action: "organization.approved", actorId: "sa-1", organizationId: "org-1" }) })
    expect(m.operatorLogCreate).toHaveBeenCalledWith({ data: expect.objectContaining({ action: "organization.approved", actorId: "sa-1", actorLabel: "Opérateur", target: "Fête (fete)" }) })
    expect(m.enqueue.mock.calls[0][0]).toEqual([expect.objectContaining({ kind: "space_approved", organizationId: "org-1", recipient: { email: "owner@example.org", name: "Camille" } })])
    expect(m.deliver).toHaveBeenCalledWith(["o1"])
  })

  it("refuses: deleted with its accounts, nothing sent", async () => {
    const { POST } = await import("@/app/api/super-admin/organizations/[id]/review/route")
    const res = await POST(post("refuse"), params)
    expect(res.status).toBe(200)
    expect(m.adminDeleteMany).toHaveBeenCalledWith({ where: { organizationId: "org-1" } })
    expect(m.orgDelete).toHaveBeenCalledWith({ where: { id: "org-1" } })
    expect(m.enqueue).not.toHaveBeenCalled()
    // The organisation's own log is gone with it: the refusal stays in the operator's log.
    expect(m.operatorLogCreate).toHaveBeenCalledWith({ data: expect.objectContaining({ action: "organization.refused", entityId: "org-1", target: "Fête (fete)" }) })
  })

  it("refuses an unknown organisation, an unknown decision and a space not pending", async () => {
    const { POST } = await import("@/app/api/super-admin/organizations/[id]/review/route")
    m.findUnique.mockResolvedValueOnce(null)
    expect((await POST(post("approve"), params)).status).toBe(404)
    expect((await POST(post("delete"), params)).status).toBe(400)
    m.findUnique.mockResolvedValueOnce({ ...pending, publicationApprovedAt: new Date(), outboundEmailApprovedAt: new Date() })
    expect((await POST(post("refuse"), params)).status).toBe(409)
    expect(m.orgDelete).not.toHaveBeenCalled()
    expect(m.orgUpdate).not.toHaveBeenCalled()
  })
})
