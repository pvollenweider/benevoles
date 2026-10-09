import { describe, it, expect, vi, beforeEach } from "vitest"

// The operator's log (#810): every decision of the super admin space leaves an entry, kept apart
// from the organisation's own log so a refused or deleted space still leaves a trace.
const m = vi.hoisted(() => ({
  guard: vi.fn(),
  operatorLogCreate: vi.fn(),
  orgFindUnique: vi.fn(),
  orgUpdate: vi.fn(),
  orgDelete: vi.fn(),
  blockUpsert: vi.fn(),
  blockFindUnique: vi.fn(),
  blockDelete: vi.fn(),
  cancel: vi.fn(),
}))
vi.mock("@/lib/auth-guard", () => ({ requireSuperAdmin: m.guard }))
vi.mock("@/lib/notifications/org-send-guard", () => ({ cancelPendingOutboxForOrganization: m.cancel }))
vi.mock("@/lib/prisma", () => {
  const tx = {
    operatorLog: { create: m.operatorLogCreate },
    orgLog: { create: vi.fn() },
    organization: { update: m.orgUpdate, delete: m.orgDelete },
    orgSlugHistory: { deleteMany: vi.fn(), create: vi.fn() },
    volunteer: { findMany: vi.fn().mockResolvedValue([]), deleteMany: vi.fn() },
    adminUser: { findMany: vi.fn().mockResolvedValue([]), deleteMany: vi.fn() },
    signupBlock: { upsert: m.blockUpsert, findUnique: m.blockFindUnique, delete: m.blockDelete },
  }
  return { prisma: { ...tx, organization: { ...tx.organization, findUnique: m.orgFindUnique }, $transaction: async (fn: (t: typeof tx) => unknown) => fn(tx) } }
})

const json = (method: string, body: unknown) => new Request("http://localhost/x", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
const params = (id: string) => ({ params: Promise.resolve({ id }) })
const logged = () => m.operatorLogCreate.mock.calls.map(([a]) => a.data)

beforeEach(() => {
  vi.clearAllMocks()
  m.guard.mockResolvedValue({ db: {}, session: { user: { id: "sa-1", role: "super_admin", name: "Opérateur", email: "ops@example.org" } } })
  m.orgUpdate.mockResolvedValue({ id: "org-1" })
})

describe("operator log: organisations", () => {
  const org = { id: "org-1", name: "Fête", slug: "fete", active: true, suspendedAt: null }

  it("logs a suspension with its reason, then its lifting", async () => {
    const { PATCH } = await import("@/app/api/super-admin/organizations/[id]/route")
    m.orgFindUnique.mockResolvedValueOnce(org)
    expect((await PATCH(json("PATCH", { suspended: true, suspensionReason: "Envoi de spam" }), params("org-1"))).status).toBe(200)
    m.orgFindUnique.mockResolvedValueOnce({ ...org, active: false, suspendedAt: new Date() })
    expect((await PATCH(json("PATCH", { suspended: false }), params("org-1"))).status).toBe(200)
    expect(logged()).toEqual([
      expect.objectContaining({ action: "organization.suspended", target: "Fête (fete)", detail: "Envoi de spam", actorId: "sa-1", actorLabel: "Opérateur" }),
      expect.objectContaining({ action: "organization.suspension_lifted", detail: null }),
    ])
  })

  it("logs a deactivation and a reactivation, never a rename", async () => {
    const { PATCH } = await import("@/app/api/super-admin/organizations/[id]/route")
    m.orgFindUnique.mockResolvedValueOnce(org)
    await PATCH(json("PATCH", { active: false }), params("org-1"))
    m.orgFindUnique.mockResolvedValueOnce({ ...org, active: false })
    await PATCH(json("PATCH", { active: true }), params("org-1"))
    m.orgFindUnique.mockResolvedValueOnce(org)
    await PATCH(json("PATCH", { name: "Fête du village" }), params("org-1"))
    expect(logged().map((d) => d.action)).toEqual(["organization.deactivated", "organization.reactivated"])
  })

  it("logs a deletion, with the name the organisation had", async () => {
    const { DELETE } = await import("@/app/api/super-admin/organizations/[id]/route")
    m.orgFindUnique.mockResolvedValueOnce({ ...org, active: false })
    expect((await DELETE(json("DELETE", { confirmSlug: "fete" }), params("org-1"))).status).toBe(200)
    expect(logged()).toEqual([expect.objectContaining({ action: "organization.deleted", entityId: "org-1", target: "Fête (fete)" })])
  })
})

describe("operator log: sign-up block list", () => {
  it("logs an entry added, with its label and reason, never an IP in clear", async () => {
    const { POST } = await import("@/app/api/super-admin/blocklist/route")
    m.blockUpsert.mockImplementation(async ({ create }) => ({ id: "b1", kind: create.kind, label: create.label, reason: create.reason, expiresAt: create.expiresAt, createdAt: new Date() }))
    expect((await POST(json("POST", { kind: "ip", value: "203.0.113.45", reason: "Rafale de demandes" }))).status).toBe(201)
    const [entry] = logged()
    expect(entry).toMatchObject({ action: "blocklist.added", entityType: "SignupBlock", entityId: "b1", detail: "Rafale de demandes" })
    expect(entry.target).not.toContain("203.0.113.45")
  })

  it("logs an entry removed, and nothing for an unknown one", async () => {
    const { DELETE } = await import("@/app/api/super-admin/blocklist/[id]/route")
    m.blockFindUnique.mockResolvedValueOnce({ id: "b1", label: "spam@example.org" })
    expect((await DELETE(new Request("http://localhost/x", { method: "DELETE" }), params("b1"))).status).toBe(200)
    m.blockFindUnique.mockResolvedValueOnce(null)
    expect((await DELETE(new Request("http://localhost/x", { method: "DELETE" }), params("nope"))).status).toBe(404)
    expect(logged()).toEqual([expect.objectContaining({ action: "blocklist.removed", target: "spam@example.org" })])
    expect(m.blockDelete).toHaveBeenCalledTimes(1)
  })
})
