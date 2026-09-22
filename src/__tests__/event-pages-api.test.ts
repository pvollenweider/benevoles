import { describe, it, expect, vi, beforeEach } from "vitest"

const requireOrgSessionMock = vi.hoisted(() => vi.fn())
vi.mock("@/lib/auth-guard", () => ({ requireOrgSession: requireOrgSessionMock }))

const findMany = vi.hoisted(() => vi.fn())
const create = vi.hoisted(() => vi.fn())
const logCreate = vi.hoisted(() => vi.fn())
vi.mock("@/lib/prisma", () => ({
  prisma: { eventPage: { findMany, create }, eventLog: { create: logCreate } },
}))

function get() {
  return new Request("http://localhost/api/admin/events/evt-1/pages")
}
function post(body: unknown) {
  return new Request("http://localhost/api/admin/events/evt-1/pages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

describe("GET/POST /api/admin/events/[id]/pages", () => {
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
    const { GET } = await import("@/app/api/admin/events/[id]/pages/route")
    const res = await GET(get(), { params: Promise.resolve({ id: "evt-1" }) })
    expect(res.status).toBe(404)
  })

  it("GET lists pages ordered by displayOrder", async () => {
    findMany.mockResolvedValue([{ id: "p1", slug: "faq", title: "FAQ", displayOrder: 0 }])
    const { GET } = await import("@/app/api/admin/events/[id]/pages/route")
    const res = await GET(get(), { params: Promise.resolve({ id: "evt-1" }) })
    expect(res.status).toBe(200)
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { eventId: "evt-1" }, orderBy: { displayOrder: "asc" } }))
  })

  it("POST rejects a missing title", async () => {
    const { POST } = await import("@/app/api/admin/events/[id]/pages/route")
    const res = await POST(post({ content: "hello" }), { params: Promise.resolve({ id: "evt-1" }) })
    expect(res.status).toBe(400)
    expect(create).not.toHaveBeenCalled()
  })

  it("POST slugifies the title and assigns the next displayOrder", async () => {
    findMany.mockResolvedValue([{ slug: "faq", displayOrder: 0 }])
    create.mockResolvedValue({ id: "p2", eventId: "evt-1", slug: "reglement", title: "Règlement", content: "x", displayOrder: 1 })
    const { POST } = await import("@/app/api/admin/events/[id]/pages/route")
    const res = await POST(post({ title: "Règlement", content: "x" }), { params: Promise.resolve({ id: "evt-1" }) })
    expect(res.status).toBe(201)
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ slug: "reglement", displayOrder: 1 }) }),
    )
  })

  it("POST dedupes a slug collision with the same title", async () => {
    findMany.mockResolvedValue([{ slug: "faq", displayOrder: 0 }])
    create.mockResolvedValue({ id: "p3", eventId: "evt-1", slug: "faq-2", title: "FAQ", content: "x", displayOrder: 1 })
    const { POST } = await import("@/app/api/admin/events/[id]/pages/route")
    await POST(post({ title: "FAQ", content: "x" }), { params: Promise.resolve({ id: "evt-1" }) })
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ slug: "faq-2" }) }))
  })

  it("POST logs the creation without including the page content in changes", async () => {
    findMany.mockResolvedValue([])
    create.mockResolvedValue({ id: "p4", eventId: "evt-1", slug: "infos", title: "Infos", content: "secret-looking text", displayOrder: 0 })
    const { POST } = await import("@/app/api/admin/events/[id]/pages/route")
    await POST(post({ title: "Infos", content: "secret-looking text" }), { params: Promise.resolve({ id: "evt-1" }) })
    const logged = JSON.stringify(logCreate.mock.calls[0][0])
    expect(logged).not.toContain("secret-looking text")
    expect(logCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: "eventpage.created", entityType: "EventPage" }) }),
    )
  })
})
