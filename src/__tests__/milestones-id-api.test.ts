import { describe, it, expect, vi, beforeEach } from "vitest"

const requireOrgSessionMock = vi.hoisted(() => vi.fn())
vi.mock("@/lib/auth-guard", () => ({ requireOrgSession: requireOrgSessionMock }))

const findFirst = vi.hoisted(() => vi.fn())
const update = vi.hoisted(() => vi.fn())
const del = vi.hoisted(() => vi.fn())
const logCreate = vi.hoisted(() => vi.fn())
vi.mock("@/lib/prisma", () => ({
  prisma: { eventMilestone: { findFirst, update, delete: del }, eventLog: { create: logCreate } },
}))

function patch(body: unknown) {
  return new Request("http://localhost/api/admin/events/evt-1/milestones/m1", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}
function del_() {
  return new Request("http://localhost/api/admin/events/evt-1/milestones/m1", { method: "DELETE" })
}

describe("PATCH/DELETE /api/admin/events/[id]/milestones/[milestoneId]", () => {
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

  it("PATCH 404s when the milestone doesn't belong to this event", async () => {
    findFirst.mockResolvedValue(null)
    const { PATCH } = await import("@/app/api/admin/events/[id]/milestones/[milestoneId]/route")
    const res = await PATCH(patch({ done: true }), { params: Promise.resolve({ id: "evt-1", milestoneId: "m1" }) })
    expect(res.status).toBe(404)
    expect(update).not.toHaveBeenCalled()
  })

  it("PATCH toggles done and logs the change", async () => {
    findFirst.mockResolvedValue({ id: "m1", eventId: "evt-1", title: "Fermer les inscriptions", dueDate: new Date("2026-09-20"), done: false })
    update.mockResolvedValue({ id: "m1", eventId: "evt-1", title: "Fermer les inscriptions", dueDate: new Date("2026-09-20"), done: true })
    const { PATCH } = await import("@/app/api/admin/events/[id]/milestones/[milestoneId]/route")
    const res = await PATCH(patch({ done: true }), { params: Promise.resolve({ id: "evt-1", milestoneId: "m1" }) })
    expect(res.status).toBe(200)
    expect(logCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "eventmilestone.updated",
          changes: { done: { from: false, to: true } },
        }),
      }),
    )
  })

  it("PATCH doesn't log anything when nothing changed", async () => {
    findFirst.mockResolvedValue({ id: "m1", eventId: "evt-1", title: "Fermer les inscriptions", dueDate: new Date("2026-09-20"), done: false })
    update.mockResolvedValue({ id: "m1", eventId: "evt-1", title: "Fermer les inscriptions", dueDate: new Date("2026-09-20"), done: false })
    const { PATCH } = await import("@/app/api/admin/events/[id]/milestones/[milestoneId]/route")
    await PATCH(patch({ done: false }), { params: Promise.resolve({ id: "evt-1", milestoneId: "m1" }) })
    expect(logCreate).not.toHaveBeenCalled()
  })

  it("DELETE 404s when the milestone doesn't belong to this event", async () => {
    findFirst.mockResolvedValue(null)
    const { DELETE } = await import("@/app/api/admin/events/[id]/milestones/[milestoneId]/route")
    const res = await DELETE(del_(), { params: Promise.resolve({ id: "evt-1", milestoneId: "m1" }) })
    expect(res.status).toBe(404)
    expect(del).not.toHaveBeenCalled()
  })

  it("DELETE removes the milestone and logs it", async () => {
    findFirst.mockResolvedValue({ id: "m1", eventId: "evt-1", title: "Fermer les inscriptions", dueDate: new Date("2026-09-20"), done: false })
    const { DELETE } = await import("@/app/api/admin/events/[id]/milestones/[milestoneId]/route")
    const res = await DELETE(del_(), { params: Promise.resolve({ id: "evt-1", milestoneId: "m1" }) })
    expect(res.status).toBe(200)
    expect(del).toHaveBeenCalledWith({ where: { id: "m1" } })
    expect(logCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: "eventmilestone.deleted" }) }),
    )
  })
})
