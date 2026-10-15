import { describe, it, expect, vi, beforeEach } from "vitest"
// Routes reach tenant models through the org-scoped `db` (#268): expose the same model mocks there.
import { prisma as prismaMock } from "@/lib/prisma"

const requireOrgSessionMock = vi.hoisted(() => vi.fn())
vi.mock("@/lib/auth-guard", () => ({ requireOrgSession: requireOrgSessionMock }))

const findMany = vi.hoisted(() => vi.fn())
const create = vi.hoisted(() => vi.fn())
const logCreate = vi.hoisted(() => vi.fn())
const adminFindFirst = vi.hoisted(() => vi.fn())
vi.mock("@/lib/prisma", () => ({
  prisma: { eventMilestone: { findMany, create }, eventLog: { create: logCreate }, adminUser: { findFirst: adminFindFirst } },
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
      db: { ...prismaMock, event: { findFirst: eventFindFirst } },
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

  it("POST creates a milestone with an active admin of the organisation as owner, and logs its id (#985)", async () => {
    adminFindFirst.mockResolvedValue({ organizationId: "org-a", isActive: true })
    create.mockResolvedValue({ id: "m3", eventId: "evt-1", title: "Louer la tente", dueDate: new Date("2026-09-20"), done: false, ownerId: "adm-2", owner: { id: "adm-2", name: "Samira Diallo" } })
    const { POST } = await import("@/app/api/admin/events/[id]/milestones/route")
    const res = await POST(post({ title: "Louer la tente", dueDate: "2026-09-20", ownerId: "adm-2" }), { params: Promise.resolve({ id: "evt-1" }) })
    expect(res.status).toBe(201)
    expect(create).toHaveBeenCalledWith({
      data: { eventId: "evt-1", title: "Louer la tente", dueDate: new Date("2026-09-20"), ownerId: "adm-2" },
      include: { owner: { select: { id: true, name: true } } },
    })
    expect(logCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ changes: expect.objectContaining({ ownerId: { from: null, to: "adm-2" } }) }),
    }))
  })

  it("POST refuses an owner who is not an active admin of the organisation (#985)", async () => {
    adminFindFirst.mockResolvedValue({ organizationId: "org-a", isActive: false })
    const { POST } = await import("@/app/api/admin/events/[id]/milestones/route")
    const res = await POST(post({ title: "Louer la tente", dueDate: "2026-09-20", ownerId: "adm-off" }), { params: Promise.resolve({ id: "evt-1" }) })
    expect(res.status).toBe(422)
    expect(create).not.toHaveBeenCalled()
  })

  it("POST without an owner checks no one and stores none (#985)", async () => {
    create.mockResolvedValue({ id: "m4", eventId: "evt-1", title: "Rappels", dueDate: new Date("2026-09-20"), done: false, ownerId: null, owner: null })
    const { POST } = await import("@/app/api/admin/events/[id]/milestones/route")
    const res = await POST(post({ title: "Rappels", dueDate: "2026-09-20", ownerId: null }), { params: Promise.resolve({ id: "evt-1" }) })
    expect(res.status).toBe(201)
    expect(adminFindFirst).not.toHaveBeenCalled()
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ ownerId: null }) }))
  })
})
