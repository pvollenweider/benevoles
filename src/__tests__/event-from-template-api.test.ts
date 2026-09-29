import { describe, it, expect, vi, beforeEach } from "vitest"

const requireOrgSessionMock = vi.hoisted(() => vi.fn())
vi.mock("@/lib/auth-guard", () => ({ requireOrgSession: requireOrgSessionMock }))
vi.mock("@/lib/prisma", () => ({ prisma: {} }))

const create = vi.hoisted(() => vi.fn())
const findFirst = vi.hoisted(() => vi.fn())

const post = (body: unknown) =>
  new Request("http://localhost/api/admin/events/from-template", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })

// Event templates (#395): a draft with the template's shifts, through the org-scoped client.
describe("POST /api/admin/events/from-template", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    create.mockResolvedValue({ id: "evt-new" })
    findFirst.mockResolvedValue(null)
    requireOrgSessionMock.mockResolvedValue({ db: { event: { create, findFirst } }, organizationId: "org-a", session: {} })
  })

  it("creates the draft and its shifts in one nested create", async () => {
    const { POST } = await import("@/app/api/admin/events/from-template/route")
    const res = await POST(post({ templateId: "buvette", title: "Buvette du 1er août", startDate: "2026-08-01" }))
    expect(res.status).toBe(201)
    expect(await res.json()).toEqual({ id: "evt-new", shiftCount: 10 })
    const data = create.mock.calls[0][0].data
    expect(data).toMatchObject({ title: "Buvette du 1er août", slug: "buvette-du-1er-aout", organizationId: "org-a", publicStatus: "draft" })
    expect(data.startDate.toISOString()).toBe("2026-08-01T00:00:00.000Z")
    expect(data.endDate.toISOString()).toBe("2026-08-01T00:00:00.000Z")
    expect(data.shifts.create).toHaveLength(10)
    expect(data.shifts.create[1]).toMatchObject({ roleName: "Bar", label: "Bar", startTime: "10:00", endTime: "13:00", capacity: 3, status: "open", displayOrder: 100 })
    expect(data.shifts.create[1].date.toISOString()).toBe("2026-08-01T00:00:00.000Z")
  })

  it("suffixes the slug when it's taken and defaults the title to the template's", async () => {
    findFirst.mockResolvedValue({ id: "evt-old" })
    const { POST } = await import("@/app/api/admin/events/from-template/route")
    const res = await POST(post({ templateId: "sport", startDate: "2026-09-12" }))
    expect(res.status).toBe(201)
    const data = create.mock.calls[0][0].data
    expect(data.title).toBe("Course populaire")
    expect(data.slug).toMatch(/^course-populaire-\d+$/)
  })

  it("refuses an unknown template or a bad date without creating anything", async () => {
    const { POST } = await import("@/app/api/admin/events/from-template/route")
    expect((await POST(post({ templateId: "gala", startDate: "2026-09-12" }))).status).toBe(400)
    expect((await POST(post({ templateId: "buvette", startDate: "12/09/2026" }))).status).toBe(400)
    expect((await POST(post({}))).status).toBe(400)
    expect(create).not.toHaveBeenCalled()
  })
})
