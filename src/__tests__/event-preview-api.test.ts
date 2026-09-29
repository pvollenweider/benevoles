import { describe, it, expect, vi, beforeEach } from "vitest"

// Admin preview of an event as a volunteer (#370): drafts included, same data as the public page,
// the confirmation email rendered with the real template but never sent, nothing registered.

const requireOrgSessionMock = vi.hoisted(() => vi.fn())
vi.mock("@/lib/auth-guard", () => ({ requireOrgSession: requireOrgSessionMock }))

const findFirst = vi.hoisted(() => vi.fn())

const shift = (id: string, over: Record<string, unknown> = {}) => ({
  id, roleName: "Bar", label: "Bar", description: null, date: new Date("2030-06-01T00:00:00Z"), startTime: "10:00", endTime: "12:00",
  capacity: 2, status: "open", locationDetails: null, displayOrder: 0, waitlistEnabled: true, minAge: null, colorKey: null, registrations: [], ...over,
})
const draft = {
  id: "evt-1", slug: "fete", title: "Fête", description: null, location: "Genève", startDate: new Date(), endDate: new Date(),
  publicInstructions: null, confirmationMessage: "Merci et à bientôt !", requirePhone: true, showSchedule: [], publicStatus: "draft",
  organization: { name: "Org", slug: "org", volunteerCharter: null },
  shifts: [shift("s-open"), shift("s-full", { registrations: [{ id: "r1" }, { id: "r2" }] })],
  pages: [{ slug: "faq", title: "FAQ" }],
}

const post = (body: unknown) => new Request("http://localhost/api/admin/events/evt-1/preview", {
  method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
})
const params = { params: Promise.resolve({ id: "evt-1" }) }

describe("/api/admin/events/[id]/preview", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    requireOrgSessionMock.mockResolvedValue({ db: { event: { findFirst } }, organizationId: "org-a" })
    findFirst.mockResolvedValue(draft)
  })

  it("GET returns a draft with the same public shape, plus its status", async () => {
    const { GET } = await import("@/app/api/admin/events/[id]/preview/route")
    const res = await GET(new Request("http://localhost/x"), params)
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data).toMatchObject({ id: "evt-1", title: "Fête", publicStatus: "draft", requirePhone: true, pages: [{ slug: "faq", title: "FAQ" }] })
    expect(data.shifts.find((s: { id: string }) => s.id === "s-full")).toMatchObject({ status: "full", spotsLeft: 0 })
  })

  it("POST renders the confirmation email without a real link, and flags full shifts", async () => {
    const { POST } = await import("@/app/api/admin/events/[id]/preview/route")
    const res = await POST(post({ firstName: "Alice", lastName: "Martin", shiftIds: ["s-open", "s-full"] }), params)
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.subject).toContain("Fête")
    expect(data.html).toContain("Alice")
    expect(data.html).toContain("/my/apercu")
    expect(data.confirmationMessage).toBe("Merci et à bientôt !")
    expect(data.waitlistedShiftIds).toEqual(["s-full"])
  })

  it("POST refuses shifts that aren't this event's, and an invalid body", async () => {
    const { POST } = await import("@/app/api/admin/events/[id]/preview/route")
    expect((await POST(post({ firstName: "A", shiftIds: ["other"] }), params)).status).toBe(400)
    expect((await POST(post({ shiftIds: [] }), params)).status).toBe(400)
  })

  it("404 when the event isn't the organization's", async () => {
    findFirst.mockResolvedValue(null)
    const { GET, POST } = await import("@/app/api/admin/events/[id]/preview/route")
    expect((await GET(new Request("http://localhost/x"), params)).status).toBe(404)
    expect((await POST(post({ firstName: "A", shiftIds: ["s-open"] }), params)).status).toBe(404)
  })
})
