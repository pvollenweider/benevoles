import { describe, it, expect, vi, beforeEach } from "vitest"

const requireOrgSessionMock = vi.hoisted(() => vi.fn())
vi.mock("@/lib/auth-guard", () => ({ requireOrgSession: requireOrgSessionMock }))

const findFirst = vi.hoisted(() => vi.fn())
const update = vi.hoisted(() => vi.fn())
const del = vi.hoisted(() => vi.fn())
const logCreate = vi.hoisted(() => vi.fn())
vi.mock("@/lib/prisma", () => ({
  prisma: { eventPage: { findFirst, update, delete: del }, eventLog: { create: logCreate } },
}))

function patch(body: unknown) {
  return new Request("http://localhost/api/admin/events/evt-1/pages/p1", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}
function del_() {
  return new Request("http://localhost/api/admin/events/evt-1/pages/p1", { method: "DELETE" })
}

describe("PATCH/DELETE /api/admin/events/[id]/pages/[pageId]", () => {
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

  it("PATCH 404s when the page doesn't belong to this event", async () => {
    findFirst.mockResolvedValue(null)
    const { PATCH } = await import("@/app/api/admin/events/[id]/pages/[pageId]/route")
    const res = await PATCH(patch({ title: "X" }), { params: Promise.resolve({ id: "evt-1", pageId: "p1" }) })
    expect(res.status).toBe(404)
    expect(update).not.toHaveBeenCalled()
  })

  it("PATCH logs a content change as '(modifié)', never the actual text", async () => {
    findFirst.mockResolvedValue({ id: "p1", eventId: "evt-1", title: "FAQ", content: "old secret content" })
    update.mockResolvedValue({ id: "p1", eventId: "evt-1", title: "FAQ", content: "new secret content" })
    const { PATCH } = await import("@/app/api/admin/events/[id]/pages/[pageId]/route")
    await PATCH(patch({ content: "new secret content" }), { params: Promise.resolve({ id: "evt-1", pageId: "p1" }) })

    const logged = JSON.stringify(logCreate.mock.calls[0][0])
    expect(logged).not.toContain("old secret content")
    expect(logged).not.toContain("new secret content")
    expect(logCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "eventpage.updated",
          changes: { content: { from: "(modifié)", to: "(modifié)" } },
        }),
      }),
    )
  })

  it("PATCH does not log anything when nothing actually changed", async () => {
    findFirst.mockResolvedValue({ id: "p1", eventId: "evt-1", title: "FAQ", content: "same" })
    update.mockResolvedValue({ id: "p1", eventId: "evt-1", title: "FAQ", content: "same" })
    const { PATCH } = await import("@/app/api/admin/events/[id]/pages/[pageId]/route")
    await PATCH(patch({ content: "same" }), { params: Promise.resolve({ id: "evt-1", pageId: "p1" }) })
    expect(logCreate).not.toHaveBeenCalled()
  })

  it("DELETE 404s when the page doesn't belong to this event", async () => {
    findFirst.mockResolvedValue(null)
    const { DELETE } = await import("@/app/api/admin/events/[id]/pages/[pageId]/route")
    const res = await DELETE(del_(), { params: Promise.resolve({ id: "evt-1", pageId: "p1" }) })
    expect(res.status).toBe(404)
    expect(del).not.toHaveBeenCalled()
  })

  it("DELETE removes the page and logs it, title only (not content)", async () => {
    findFirst.mockResolvedValue({ id: "p1", eventId: "evt-1", title: "FAQ", content: "secret content" })
    const { DELETE } = await import("@/app/api/admin/events/[id]/pages/[pageId]/route")
    const res = await DELETE(del_(), { params: Promise.resolve({ id: "evt-1", pageId: "p1" }) })
    expect(res.status).toBe(200)
    expect(del).toHaveBeenCalledWith({ where: { id: "p1" } })
    const logged = JSON.stringify(logCreate.mock.calls[0][0])
    expect(logged).not.toContain("secret content")
    expect(logged).toContain("FAQ")
  })
})
