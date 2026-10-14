import { describe, it, expect, vi, beforeEach } from "vitest"
// Routes reach tenant models through the org-scoped `db` (#268): expose the same model mocks there.
import { prisma as prismaMock } from "@/lib/prisma"

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
      db: { ...prismaMock, event: { findFirst: eventFindFirst } },
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

  it("PATCH changes the title and the due date and logs both (#989)", async () => {
    findFirst.mockResolvedValue({ id: "m1", eventId: "evt-1", title: "Fermer les inscriptions", dueDate: new Date("2026-09-20"), done: false })
    update.mockResolvedValue({ id: "m1", eventId: "evt-1", title: "Clore les inscriptions", dueDate: new Date("2026-09-25"), done: false })
    const { PATCH } = await import("@/app/api/admin/events/[id]/milestones/[milestoneId]/route")
    const res = await PATCH(patch({ title: "Clore les inscriptions", dueDate: "2026-09-25" }), { params: Promise.resolve({ id: "evt-1", milestoneId: "m1" }) })
    expect(res.status).toBe(200)
    expect(update).toHaveBeenCalledWith({ where: { id: "m1" }, data: { title: "Clore les inscriptions", dueDate: new Date("2026-09-25") } })
    expect(logCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "eventmilestone.updated",
          changes: {
            title: { from: "Fermer les inscriptions", to: "Clore les inscriptions" },
            dueDate: { from: new Date("2026-09-20").toISOString(), to: new Date("2026-09-25").toISOString() },
          },
        }),
      }),
    )
  })

  it("PATCH refuses an empty title or a missing date, like creation (#989)", async () => {
    const { PATCH } = await import("@/app/api/admin/events/[id]/milestones/[milestoneId]/route")
    for (const body of [{ title: "" }, { dueDate: "pas une date" }, { title: "a".repeat(141) }]) {
      const res = await PATCH(patch(body), { params: Promise.resolve({ id: "evt-1", milestoneId: "m1" }) })
      expect(res.status).toBe(400)
    }
    expect(update).not.toHaveBeenCalled()
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
