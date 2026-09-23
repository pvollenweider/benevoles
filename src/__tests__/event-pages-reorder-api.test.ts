import { describe, it, expect, vi, beforeEach } from "vitest"

const requireOrgSessionMock = vi.hoisted(() => vi.fn())
vi.mock("@/lib/auth-guard", () => ({ requireOrgSession: requireOrgSessionMock }))

const updateMany = vi.hoisted(() => vi.fn())
vi.mock("@/lib/prisma", () => ({ prisma: { eventPage: { updateMany } } }))

function post(body: unknown) {
  return new Request("http://localhost/api/admin/events/evt-1/pages/reorder", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

describe("POST /api/admin/events/[id]/pages/reorder", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    requireOrgSessionMock.mockResolvedValue({
      db: { event: { findFirst: vi.fn().mockResolvedValue({ id: "evt-1" }) } },
      organizationId: "org-a",
      session: { user: { id: "admin-1" } },
    })
    updateMany.mockResolvedValue({ count: 1 })
  })

  it("rejects a non-array body", async () => {
    const { POST } = await import("@/app/api/admin/events/[id]/pages/reorder/route")
    const res = await POST(post({ pageIds: "not-an-array" }), { params: Promise.resolve({ id: "evt-1" }) })
    expect(res.status).toBe(400)
    expect(updateMany).not.toHaveBeenCalled()
  })

  it("sets displayOrder to the array index, scoped to the event", async () => {
    const { POST } = await import("@/app/api/admin/events/[id]/pages/reorder/route")
    const res = await POST(post({ pageIds: ["p2", "p1", "p3"] }), { params: Promise.resolve({ id: "evt-1" }) })
    expect(res.status).toBe(200)
    expect(updateMany).toHaveBeenCalledWith({ where: { id: "p2", eventId: "evt-1" }, data: { displayOrder: 0 } })
    expect(updateMany).toHaveBeenCalledWith({ where: { id: "p1", eventId: "evt-1" }, data: { displayOrder: 1 } })
    expect(updateMany).toHaveBeenCalledWith({ where: { id: "p3", eventId: "evt-1" }, data: { displayOrder: 2 } })
  })
})
