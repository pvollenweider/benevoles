import { describe, it, expect, vi, beforeEach } from "vitest"

const requireOrgSessionMock = vi.hoisted(() => vi.fn())
vi.mock("@/lib/auth-guard", () => ({ requireOrgSession: requireOrgSessionMock }))

const volunteerFindFirst = vi.hoisted(() => vi.fn())
const volunteerCreate = vi.hoisted(() => vi.fn())
const volunteerUpdate = vi.hoisted(() => vi.fn())
const orgLogCreate = vi.hoisted(() => vi.fn())
vi.mock("@/lib/prisma", () => ({
  prisma: { volunteer: { findFirst: volunteerFindFirst, update: volunteerUpdate }, orgLog: { create: orgLogCreate } },
}))

function dbFindFirst(result: unknown) {
  return vi.fn().mockResolvedValue(result)
}

function setupGuard(volunteerFindFirstImpl: ReturnType<typeof vi.fn>, volunteerCreateImpl?: ReturnType<typeof vi.fn>) {
  requireOrgSessionMock.mockResolvedValue({
    db: { volunteer: { findFirst: volunteerFindFirstImpl, create: volunteerCreateImpl ?? volunteerCreate } },
    organizationId: "org-a",
    session: { user: { id: "admin-1" } },
  })
}

describe("POST /api/admin/members — activity log", () => {
  beforeEach(() => vi.clearAllMocks())

  it("logs member.created with no PII in the payload", async () => {
    setupGuard(dbFindFirst(null), vi.fn().mockResolvedValue({ id: "mem-1", firstName: "Alice", lastName: "L", email: "a@x.com" }))
    orgLogCreate.mockResolvedValue({ id: "log-1" })
    const { POST } = await import("@/app/api/admin/members/route")
    const res = await POST(new Request("http://localhost/api/admin/members", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ firstName: "Alice", lastName: "L", email: "a@x.com" }),
    }))
    expect(res.status).toBe(201)
    expect(orgLogCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: "member.created", entityType: "Member", entityId: "mem-1" }) }),
    )
    const logged = JSON.stringify(orgLogCreate.mock.calls[0][0])
    expect(logged).not.toContain("Alice")
    expect(logged).not.toContain("a@x.com")
  })
})

describe("PATCH/DELETE /api/admin/members/[id] — activity log", () => {
  beforeEach(() => vi.clearAllMocks())

  it("PATCH logs member.deactivated (not member.updated) when active flips to false", async () => {
    setupGuard(dbFindFirst({ id: "mem-1", firstName: "Alice", lastName: "L", email: "a@x.com", phone: null, tags: [], notes: null, active: true }))
    volunteerUpdate.mockResolvedValue({ id: "mem-1", firstName: "Alice", lastName: "L", email: "a@x.com", phone: null, tags: [], notes: null, active: false })
    const { PATCH } = await import("@/app/api/admin/members/[id]/route")
    await PATCH(
      new Request("http://localhost/api/admin/members/mem-1", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ active: false }) }),
      { params: Promise.resolve({ id: "mem-1" }) },
    )
    expect(orgLogCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: "member.deactivated" }) }),
    )
    expect(orgLogCreate).toHaveBeenCalledTimes(1)
  })

  it("PATCH logs member.updated with redacted field values, never the actual name/email", async () => {
    setupGuard(dbFindFirst({ id: "mem-1", firstName: "Alice", lastName: "L", email: "a@x.com", phone: null, tags: [], notes: null, active: true }))
    volunteerUpdate.mockResolvedValue({ id: "mem-1", firstName: "Alicia", lastName: "L", email: "a@x.com", phone: null, tags: [], notes: null, active: true })
    const { PATCH } = await import("@/app/api/admin/members/[id]/route")
    await PATCH(
      new Request("http://localhost/api/admin/members/mem-1", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ firstName: "Alicia" }) }),
      { params: Promise.resolve({ id: "mem-1" }) },
    )
    const call = orgLogCreate.mock.calls[0][0]
    expect(call.data.action).toBe("member.updated")
    expect(call.data.changes).toEqual({ firstName: { from: "(modifié)", to: "(modifié)" } })
    const logged = JSON.stringify(call)
    expect(logged).not.toContain("Alicia")
  })

  it("PATCH logs nothing when no field actually changed", async () => {
    setupGuard(dbFindFirst({ id: "mem-1", firstName: "Alice", lastName: "L", email: "a@x.com", phone: null, tags: [], notes: null, active: true }))
    volunteerUpdate.mockResolvedValue({ id: "mem-1", firstName: "Alice", lastName: "L", email: "a@x.com", phone: null, tags: [], notes: null, active: true })
    const { PATCH } = await import("@/app/api/admin/members/[id]/route")
    await PATCH(
      new Request("http://localhost/api/admin/members/mem-1", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ firstName: "Alice" }) }),
      { params: Promise.resolve({ id: "mem-1" }) },
    )
    expect(orgLogCreate).not.toHaveBeenCalled()
  })

  it("DELETE (soft delete) logs member.deactivated", async () => {
    setupGuard(dbFindFirst({ id: "mem-1" }))
    const { DELETE } = await import("@/app/api/admin/members/[id]/route")
    await DELETE(new Request("http://localhost/api/admin/members/mem-1", { method: "DELETE" }), { params: Promise.resolve({ id: "mem-1" }) })
    expect(orgLogCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: "member.deactivated", entityType: "Member", entityId: "mem-1" }) }),
    )
  })
})
