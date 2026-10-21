import { describe, it, expect, vi, beforeEach } from "vitest"

const requireOrgSessionMock = vi.hoisted(() => vi.fn())
vi.mock("@/lib/auth-guard", () => ({ requireOrgSession: requireOrgSessionMock }))
vi.mock("@/lib/prisma", () => ({ prisma: {} }))

const create = vi.hoisted(() => vi.fn())
const findFirst = vi.hoisted(() => vi.fn())

const post = (url: string, body: unknown) =>
  new Request(`http://localhost${url}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })

// An event whose title gives one of the site's own addresses (/tarifs, /pour-qui, /admin…) would
// never be reachable: refused, nothing created (src/lib/event-slug.ts).
describe("event creation with a reserved slug", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    create.mockResolvedValue({ id: "evt-new" })
    findFirst.mockResolvedValue(null)
    requireOrgSessionMock.mockResolvedValue({ db: { organization: { findUnique: vi.fn().mockResolvedValue({ shiftRosterDefault: true }) }, event: { create, findFirst } }, organizationId: "org-a", session: {} })
  })

  it("POST /api/admin/events refuses « Tarifs » with a French message, and creates nothing", async () => {
    const { POST } = await import("@/app/api/admin/events/route")
    const res = await POST(post("/api/admin/events", { title: "Tarifs", startDate: "2026-08-01", endDate: "2026-08-01" }))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toContain("« /tarifs », réservée par le service")
    expect(create).not.toHaveBeenCalled()
  })

  it("POST /api/admin/events/from-template refuses « Pour qui ? » and « Admin »", async () => {
    const { POST } = await import("@/app/api/admin/events/from-template/route")
    for (const title of ["Pour qui ?", "Admin"]) {
      const res = await POST(post("/api/admin/events/from-template", { templateId: "buvette", title, startDate: "2026-08-01" }))
      expect(res.status, title).toBe(400)
    }
    expect(create).not.toHaveBeenCalled()
  })

  it("still creates « Tarifs 2027 »", async () => {
    const { POST } = await import("@/app/api/admin/events/from-template/route")
    const res = await POST(post("/api/admin/events/from-template", { templateId: "buvette", title: "Tarifs 2027", startDate: "2026-08-01" }))
    expect(res.status).toBe(201)
    expect(create.mock.calls[0][0].data.slug).toBe("tarifs-2027")
  })
})
