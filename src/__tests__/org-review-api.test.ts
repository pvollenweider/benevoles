import { describe, it, expect, vi, beforeEach } from "vitest"
import { NextResponse } from "next/server"
import { COLETTE, ELODIE, SAMI, adminsMatching, teamOf } from "@/__tests__/helpers/front-desk-accounts"

const m = vi.hoisted(() => ({
  guard: vi.fn(),
  findUnique: vi.fn(),
  txFindUnique: vi.fn(),
  queryRaw: vi.fn(),
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
    $queryRaw: m.queryRaw,
    organization: { updateManyAndReturn: m.orgUpdate, findUnique: m.txFindUnique, delete: m.orgDelete },
    adminUser: { deleteMany: m.adminDeleteMany, findMany: m.adminFindMany },
    orgLog: { create: m.logCreate },
    operatorLog: { create: m.operatorLogCreate },
  }
  return { prisma: { organization: { findUnique: m.findUnique }, $transaction: async (fn: (t: typeof tx) => unknown) => fn(tx) } }
})

const pending = { id: "org-1", name: "Fête", slug: "fete", active: true, suspendedAt: null, publicationApprovedAt: null, outboundEmailApprovedAt: null }
const approved = { ...pending, publicationApprovedAt: new Date(), outboundEmailApprovedAt: new Date() }
const post = (decision: unknown) => new Request("http://localhost/api/super-admin/organizations/org-1/review", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ decision }) })
const params = { params: Promise.resolve({ id: "org-1" }) }

describe("POST /api/super-admin/organizations/[id]/review (#810, part 4c)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    m.guard.mockResolvedValue({ db: {}, session: { user: { id: "sa-1", role: "super_admin", name: "Opérateur" } } })
    m.findUnique.mockResolvedValue(pending)
    m.txFindUnique.mockResolvedValue(pending)
    m.queryRaw.mockResolvedValue([{ id: "org-1" }])
    m.orgUpdate.mockResolvedValue([pending])
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
    // #1371: the organisation row is locked first, before the conditional grant.
    expect(m.queryRaw).toHaveBeenCalledTimes(1)
    expect(m.queryRaw.mock.invocationCallOrder[0]).toBeLessThan(m.orgUpdate.mock.invocationCallOrder[0])
  })

  // #1371 fix round: a space is pending as soon as ONE grant is missing. It is approved as the
  // route did before the branch, writing both timestamps and sending the emails.
  const halfGranted = [
    { name: "publication granted, outbound email not", org: { ...pending, publicationApprovedAt: new Date("2026-01-01T00:00:00Z") } },
    { name: "outbound email granted, publication not", org: { ...pending, outboundEmailApprovedAt: new Date("2026-01-01T00:00:00Z") } },
  ]
  for (const c of halfGranted) {
    it(`approves a space with ${c.name}: both timestamps, logs and emails`, async () => {
      m.findUnique.mockResolvedValueOnce(c.org)
      m.orgUpdate.mockResolvedValueOnce([c.org])
      const { POST } = await import("@/app/api/super-admin/organizations/[id]/review/route")
      const res = await POST(post("approve"), params)

      expect(res.status).toBe(200)
      expect(await res.json()).toEqual({ ok: true, decision: "approve" })
      const data = m.orgUpdate.mock.calls[0][0].data
      expect(data.publicationApprovedAt).toBeInstanceOf(Date)
      expect(data.outboundEmailApprovedAt).toBeInstanceOf(Date)
      expect(m.orgUpdate.mock.calls[0][0].where).toMatchObject({
        active: true,
        suspendedAt: null,
        OR: [{ publicationApprovedAt: null }, { outboundEmailApprovedAt: null }],
      })
      expect(m.logCreate).toHaveBeenCalledWith({ data: expect.objectContaining({ action: "organization.approved", actorId: "sa-1" }) })
      expect(m.operatorLogCreate).toHaveBeenCalledWith({ data: expect.objectContaining({ action: "organization.approved", target: "Fête (fete)" }) })
      expect(m.enqueue).toHaveBeenCalledTimes(1)
      const [payloads] = m.enqueue.mock.calls[0] as [{ recipient: { email: string } }[]]
      expect(payloads.map((p) => p.recipient.email)).toEqual(["owner@example.org"])
      expect(m.deliver).toHaveBeenCalledWith(["o1"])
    })
  }

  it("refuses: deleted with its accounts, nothing sent", async () => {
    const { POST } = await import("@/app/api/super-admin/organizations/[id]/review/route")
    const res = await POST(post("refuse"), params)
    expect(res.status).toBe(200)
    expect(m.adminDeleteMany).toHaveBeenCalledWith({ where: { organizationId: "org-1" } })
    expect(m.orgDelete).toHaveBeenCalledWith({ where: { id: "org-1" } })
    expect(m.enqueue).not.toHaveBeenCalled()
    // The organisation's own log is gone with it: the refusal stays in the operator's log.
    expect(m.operatorLogCreate).toHaveBeenCalledWith({ data: expect.objectContaining({ action: "organization.refused", entityId: "org-1", target: "Fête (fete)" }) })
    // Same lock order as account activation: the AdminUser rows first, then the organisation.
    const locks = m.queryRaw.mock.calls.map((call) => String((call[0] as TemplateStringsArray).join(" ")))
    expect(locks[0]).toContain('"AdminUser"')
    expect(locks[1]).toContain('"Organization"')
    expect(m.queryRaw.mock.invocationCallOrder[0]).toBeLessThan(m.queryRaw.mock.invocationCallOrder[1])
    expect(m.queryRaw.mock.invocationCallOrder[1]).toBeLessThan(m.txFindUnique.mock.invocationCallOrder[0])
    expect(m.txFindUnique.mock.invocationCallOrder[0]).toBeLessThan(m.orgDelete.mock.invocationCallOrder[0])
  })

  it("a refusal decided before a concurrent approval deletes nothing: the approval won", async () => {
    m.txFindUnique.mockResolvedValueOnce(approved)
    const { POST } = await import("@/app/api/super-admin/organizations/[id]/review/route")
    const res = await POST(post("refuse"), params)
    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({ error: "Cet espace n'est pas en attente de validation." })
    expect(m.orgDelete).not.toHaveBeenCalled()
    expect(m.adminDeleteMany).not.toHaveBeenCalled()
  })

  it("a concurrent approval that finds the space already granted answers 409, without a second email", async () => {
    m.orgUpdate.mockResolvedValueOnce([])
    m.txFindUnique.mockResolvedValueOnce(approved)
    const { POST } = await import("@/app/api/super-admin/organizations/[id]/review/route")
    const res = await POST(post("approve"), params)
    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({ error: "Cet espace n'est pas en attente de validation." })
    expect(m.enqueue).not.toHaveBeenCalled()
    expect(m.deliver).not.toHaveBeenCalled()
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

// Front desk (#1142): the validation of a space is announced to its administrators only.
describe("POST review and a front-desk account", () => {
  it("emails the owner and the organiser, never the front-desk account of the organisation", async () => {
    vi.clearAllMocks()
    m.guard.mockResolvedValue({ db: {}, session: { user: { id: "sa-1", role: "super_admin", name: "Opérateur" } } })
    m.findUnique.mockResolvedValue(pending)
    m.txFindUnique.mockResolvedValue(pending)
    m.queryRaw.mockResolvedValue([{ id: "org-1" }])
    m.orgUpdate.mockResolvedValue([pending])
    m.enqueue.mockResolvedValue(["o1"])
    m.adminFindMany.mockImplementation(async ({ where }: { where: unknown }) => adminsMatching(where, teamOf("org-1")))
    const { POST } = await import("@/app/api/super-admin/organizations/[id]/review/route")
    expect((await POST(post("approve"), params)).status).toBe(200)
    const recipients = (m.enqueue.mock.calls[0][0] as { recipient: { email: string } }[]).map((p) => p.recipient.email)
    expect(recipients).toEqual([ELODIE.email, SAMI.email])
    expect(recipients).not.toContain(COLETTE.email)
  })
})
