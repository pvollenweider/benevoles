import { describe, it, expect, vi, beforeEach } from "vitest"

const requireOrgSessionMock = vi.hoisted(() => vi.fn())
vi.mock("@/lib/auth-guard", () => ({ requireOrgSession: requireOrgSessionMock }))
vi.mock("@/lib/prisma", () => ({ prisma: {} }))

const event = {
  title: "Fête",
  organization: { name: "Org", timeZone: "Europe/Zurich" },
  sectorLeaders: [{ roleName: "Bar", name: "Léa", email: "lea@x.ch" }],
  shifts: [{
    id: "s1", roleName: "Bar", label: "Bar", date: new Date("2026-07-04T00:00:00Z"), startTime: "10:00", endTime: "12:00", capacity: 2,
    locationDetails: null, contactName: null, contactPhone: null, instructions: null,
    registrations: [{ phone: "078 9", comment: null, checkedInAt: new Date(), volunteer: { firstName: "Alice", lastName: "Martin", email: "a@x.ch", phone: "079 1" } }],
  }],
}

const get = (view: string, id = "evt-a") =>
  import("@/app/api/admin/events/[id]/export/sheets/[view]/route").then(({ GET }) =>
    GET(new Request(`http://localhost/api/admin/events/${id}/export/sheets/${view}`), { params: Promise.resolve({ id, view }) }))

// Printable sheets (#400).
describe("GET /api/admin/events/[id]/export/sheets/[view]", () => {
  const findFirst = vi.fn()
  beforeEach(() => {
    vi.clearAllMocks()
    findFirst.mockResolvedValue(event)
    requireOrgSessionMock.mockResolvedValue({ db: { event: { findFirst } }, organizationId: "org-a", session: {} })
  })

  it("renders the requested sheet from the org-scoped event, registration phone first", async () => {
    const res = await get("phones")
    expect(res.status).toBe(200)
    expect(res.headers.get("Content-Type")).toContain("text/html")
    const html = await res.text()
    expect(html).toContain("<strong>Liste avec téléphones</strong>")
    expect(html).toContain("078 9")
    expect(html).not.toContain("079 1")
    expect(findFirst.mock.calls[0][0].where).toEqual({ id: "evt-a" })
  })

  it("ticks people already marked present on the attendance sheet", async () => {
    expect(await (await get("attendance")).text()).toContain("☑")
  })

  it("returns 404 for an unknown view, before reading anything, and for an event of another organization", async () => {
    expect((await get("badges")).status).toBe(404)
    expect(findFirst).not.toHaveBeenCalled()
    findFirst.mockResolvedValue(null)
    expect((await get("day", "evt-b")).status).toBe(404)
  })
})
