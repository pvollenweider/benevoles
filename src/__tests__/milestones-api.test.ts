import { describe, it, expect, vi, beforeEach } from "vitest"

const requireOrgSessionMock = vi.hoisted(() => vi.fn())
vi.mock("@/lib/auth-guard", () => ({ requireOrgSession: requireOrgSessionMock }))

const findMany = vi.hoisted(() => vi.fn())
const create = vi.hoisted(() => vi.fn())
const logCreate = vi.hoisted(() => vi.fn())
vi.mock("@/lib/prisma", () => ({
  prisma: { eventMilestone: { findMany, create }, eventLog: { create: logCreate } },
}))

function get() {
  return new Request("http://localhost/api/admin/events/evt-1/milestones")
}
function post(body: unknown) {
  return new Request("http://localhost/api/admin/events/evt-1/milestones", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

describe("GET/POST /api/admin/events/[id]/milestones", () => {
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

  it("GET 404s when the event isn't owned by the caller's org", async () => {
    eventFindFirst.mockResolvedValue(null)
    const { GET } = await import("@/app/api/admin/events/[id]/milestones/route")
    const res = await GET(get(), { params: Promise.resolve({ id: "evt-1" }) })
    expect(res.status).toBe(404)
  })

  it("GET lists milestones ordered by due date", async () => {
    findMany.mockResolvedValue([{ id: "m1", title: "Fermer les inscriptions", dueDate: new Date("2026-09-20") }])
    const { GET } = await import("@/app/api/admin/events/[id]/milestones/route")
    const res = await GET(get(), { params: Promise.resolve({ id: "evt-1" }) })
    expect(res.status).toBe(200)
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { eventId: "evt-1" }, orderBy: [{ dueDate: "asc" }, { createdAt: "asc" }] }),
    )
  })

  it("POST rejects a missing title", async () => {
    const { POST } = await import("@/app/api/admin/events/[id]/milestones/route")
    const res = await POST(post({ dueDate: "2026-09-20" }), { params: Promise.resolve({ id: "evt-1" }) })
    expect(res.status).toBe(400)
    expect(create).not.toHaveBeenCalled()
  })

  it("POST rejects an invalid date", async () => {
    const { POST } = await import("@/app/api/admin/events/[id]/milestones/route")
    const res = await POST(post({ title: "Fermer les inscriptions", dueDate: "not-a-date" }), { params: Promise.resolve({ id: "evt-1" }) })
    expect(res.status).toBe(400)
    expect(create).not.toHaveBeenCalled()
  })

  it("POST creates a milestone and logs it", async () => {
    create.mockResolvedValue({ id: "m2", eventId: "evt-1", title: "Fermer les inscriptions", dueDate: new Date("2026-09-20"), done: false })
    const { POST } = await import("@/app/api/admin/events/[id]/milestones/route")
    const res = await POST(post({ title: "Fermer les inscriptions", dueDate: "2026-09-20" }), { params: Promise.resolve({ id: "evt-1" }) })
    expect(res.status).toBe(201)
    expect(logCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: "eventmilestone.created", entityType: "EventMilestone" }) }),
    )
  })
})
