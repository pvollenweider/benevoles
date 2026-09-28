import { describe, it, expect, vi, beforeEach } from "vitest"

// POST /api/admin/events/[id]/registrations/bulk (#292): one request for a whole selection,
// all-or-nothing on ownership.

const requireOrgSessionMock = vi.hoisted(() => vi.fn())
vi.mock("@/lib/auth-guard", () => ({ requireOrgSession: requireOrgSessionMock }))

const actions = vi.hoisted(() => ({
  cancelRegistrations: vi.fn(),
  addSectorLeader: vi.fn(),
  resendManagementLinks: vi.fn(),
}))
vi.mock("@/lib/admin-registration-actions", () => actions)
vi.mock("@/lib/event-log", () => ({ adminActor: () => ({ type: "admin", id: "admin-1" }) }))

const event = { id: "evt-1", title: "Festival", organization: { slug: "a" } }
const reg = (id: string, over: Record<string, unknown> = {}) => ({
  id, eventId: "evt-1", shiftId: "s1", status: "active", editToken: `tok-${id}`,
  volunteer: { id: `v-${id}`, firstName: "A", lastName: id, email: `${id}@x.com` },
  shift: { roleName: "Bar" },
  ...over,
})

let regFindMany: ReturnType<typeof vi.fn>

function post(body: unknown) {
  return new Request("http://localhost/api/admin/events/evt-1/registrations/bulk", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  })
}
const params = { params: Promise.resolve({ id: "evt-1" }) }

beforeEach(() => {
  vi.clearAllMocks()
  regFindMany = vi.fn()
  requireOrgSessionMock.mockResolvedValue({
    db: { event: { findFirst: vi.fn().mockResolvedValue(event) }, registration: { findMany: regFindMany } },
    organizationId: "org-a",
    session: { user: { id: "admin-1" } },
  })
})

describe("POST /api/admin/events/[id]/registrations/bulk", () => {
  it("does nothing if any id isn't a registration of this event (other org, other event, unknown)", async () => {
    regFindMany.mockResolvedValue([reg("r1")]) // r2 not found through the scoped client
    const { POST } = await import("@/app/api/admin/events/[id]/registrations/bulk/route")
    const res = await POST(post({ action: "cancel", registrationIds: ["r1", "r2"] }), params)
    expect(res.status).toBe(404)
    expect(regFindMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: { in: ["r1", "r2"] }, eventId: "evt-1" } }))
    expect(actions.cancelRegistrations).not.toHaveBeenCalled()
  })

  it("rejects an unknown action and an empty selection", async () => {
    const { POST } = await import("@/app/api/admin/events/[id]/registrations/bulk/route")
    expect((await POST(post({ action: "delete_all", registrationIds: ["r1"] }), params)).status).toBe(400)
    expect((await POST(post({ action: "cancel", registrationIds: [] }), params)).status).toBe(400)
  })

  it("cancel: only active rows, duplicates in the selection counted once", async () => {
    regFindMany.mockResolvedValue([reg("r1"), reg("r2", { status: "cancelled" })])
    actions.cancelRegistrations.mockResolvedValue(["r1"])
    const { POST } = await import("@/app/api/admin/events/[id]/registrations/bulk/route")
    const res = await POST(post({ action: "cancel", registrationIds: ["r1", "r2", "r1"] }), params)
    expect(res.status).toBe(200)
    expect(actions.cancelRegistrations).toHaveBeenCalledWith(expect.anything(), expect.anything(), [expect.objectContaining({ id: "r1" })])
    expect(await res.json()).toEqual({ done: 1, cancelledIds: ["r1"], skipped: 1 })
  })

  it("make_leader: one leader per (role, email), rows without email skipped", async () => {
    regFindMany.mockResolvedValue([
      reg("r1"),
      reg("r2", { volunteer: { id: "v-r1", firstName: "A", lastName: "r1", email: "r1@x.com" } }), // same person, same role
      reg("r3", { volunteer: { id: "v-r3", firstName: "C", lastName: "r3", email: null } }),
    ])
    actions.addSectorLeader.mockResolvedValue({ status: "created" })
    const { POST } = await import("@/app/api/admin/events/[id]/registrations/bulk/route")
    const res = await POST(post({ action: "make_leader", registrationIds: ["r1", "r2", "r3"] }), params)
    expect(actions.addSectorLeader).toHaveBeenCalledTimes(1)
    expect(await res.json()).toEqual({ done: 1, alreadyLeader: 0, skipped: 1 })
  })

  it("resend_link: only active rows are passed on", async () => {
    regFindMany.mockResolvedValue([reg("r1"), reg("r2", { status: "waiting" })])
    actions.resendManagementLinks.mockResolvedValue({ sent: 1, failed: 0, skipped: 0 })
    const { POST } = await import("@/app/api/admin/events/[id]/registrations/bulk/route")
    const res = await POST(post({ action: "resend_link", registrationIds: ["r1", "r2"] }), params)
    expect(actions.resendManagementLinks.mock.calls[0][0]).toHaveLength(1)
    expect(await res.json()).toEqual({ done: 1, failed: 0, skipped: 1 })
  })
})
