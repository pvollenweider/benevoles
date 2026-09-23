import { describe, it, expect, vi, beforeEach } from "vitest"

const requireOrgSessionMock = vi.hoisted(() => vi.fn())
vi.mock("@/lib/auth-guard", () => ({ requireOrgSession: requireOrgSessionMock }))

const findFirst = vi.hoisted(() => vi.fn())
const del = vi.hoisted(() => vi.fn())
const logCreate = vi.hoisted(() => vi.fn())
const volunteerFindFirst = vi.hoisted(() => vi.fn())
const volunteerUpdate = vi.hoisted(() => vi.fn())
vi.mock("@/lib/prisma", () => ({
  prisma: {
    sectorLeader: { findFirst, delete: del },
    eventLog: { create: logCreate },
    volunteer: { findFirst: volunteerFindFirst, update: volunteerUpdate },
  },
}))

// sector-leaders.ts (untagVolunteerIfNoLongerResponsable) pulls in notifySectorLeadersOfSignup's
// sendNotification import too — mock it so the real email channel (which reads env vars at
// module load) never loads in this test.
vi.mock("@/lib/notifications", () => ({ sendNotification: vi.fn() }))

function del_() {
  return new Request("http://localhost/api/admin/events/evt-1/sector-leaders/l1", { method: "DELETE" })
}

describe("DELETE /api/admin/events/[id]/sector-leaders/[leaderId]", () => {
  let eventFindFirst: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.clearAllMocks()
    eventFindFirst = vi.fn().mockResolvedValue({ id: "evt-1" })
    requireOrgSessionMock.mockResolvedValue({
      db: { event: { findFirst: eventFindFirst } },
      organizationId: "org-a",
      session: { user: { id: "admin-1" } },
    })
    logCreate.mockResolvedValue({ id: "log-1" })
  })

  it("404s when the event isn't owned by the caller's org", async () => {
    eventFindFirst.mockResolvedValue(null)
    const { DELETE } = await import("@/app/api/admin/events/[id]/sector-leaders/[leaderId]/route")
    const res = await DELETE(del_(), { params: Promise.resolve({ id: "evt-1", leaderId: "l1" }) })
    expect(res.status).toBe(404)
    expect(del).not.toHaveBeenCalled()
  })

  it("404s when the leader doesn't belong to this event", async () => {
    findFirst.mockResolvedValue(null)
    const { DELETE } = await import("@/app/api/admin/events/[id]/sector-leaders/[leaderId]/route")
    const res = await DELETE(del_(), { params: Promise.resolve({ id: "evt-1", leaderId: "l1" }) })
    expect(res.status).toBe(404)
    expect(del).not.toHaveBeenCalled()
  })

  it("removes the leader and logs it, role only, never name/email", async () => {
    findFirst.mockResolvedValueOnce({ id: "l1", eventId: "evt-1", roleName: "Bar", name: "Alice", email: "a@x.com" })
    findFirst.mockResolvedValueOnce(null) // untag check: no other sector-leader role left
    const { DELETE } = await import("@/app/api/admin/events/[id]/sector-leaders/[leaderId]/route")
    const res = await DELETE(del_(), { params: Promise.resolve({ id: "evt-1", leaderId: "l1" }) })
    expect(res.status).toBe(200)
    expect(del).toHaveBeenCalledWith({ where: { id: "l1" } })

    const logged = JSON.stringify(logCreate.mock.calls[0][0])
    expect(logged).not.toContain("Alice")
    expect(logged).not.toContain("a@x.com")
    expect(logged).toContain("Bar")
  })

  it("untags the volunteer when they have no remaining sector-leader role", async () => {
    findFirst.mockResolvedValueOnce({ id: "l1", eventId: "evt-1", roleName: "Bar", name: "Alice", email: "a@x.com" })
    findFirst.mockResolvedValueOnce(null)
    volunteerFindFirst.mockResolvedValue({ id: "vol-1", tags: ["responsable", "cuisine"] })
    const { DELETE } = await import("@/app/api/admin/events/[id]/sector-leaders/[leaderId]/route")
    await DELETE(del_(), { params: Promise.resolve({ id: "evt-1", leaderId: "l1" }) })

    expect(volunteerUpdate).toHaveBeenCalledWith({ where: { id: "vol-1" }, data: { tags: ["cuisine"] } })
  })

  it("keeps the tag when the volunteer still leads another role", async () => {
    findFirst.mockResolvedValueOnce({ id: "l1", eventId: "evt-1", roleName: "Bar", name: "Alice", email: "a@x.com" })
    findFirst.mockResolvedValueOnce({ id: "l2" }) // still leading "Cuisine" elsewhere
    const { DELETE } = await import("@/app/api/admin/events/[id]/sector-leaders/[leaderId]/route")
    await DELETE(del_(), { params: Promise.resolve({ id: "evt-1", leaderId: "l1" }) })

    expect(volunteerUpdate).not.toHaveBeenCalled()
  })
})
