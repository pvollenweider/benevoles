import { describe, it, expect, vi, beforeEach } from "vitest"

const create = vi.hoisted(() => vi.fn(async ({ data }: { data: object }) => ({ id: "s", ...data })))
const eventFindFirst = vi.hoisted(() => vi.fn())
vi.mock("@/lib/auth-guard", () => ({ requireOrgSession: async () => ({ db: { event: { findFirst: eventFindFirst }, shift: { create } }, organizationId: "o", session: {} }) }))
vi.mock("@/lib/event-log", () => ({ logEvent: vi.fn(), adminActor: () => ({}) }))
vi.mock("@/lib/prisma", () => ({ prisma: {} }))

// A shift's day falls within its event (audit): the API refuses one outside the period.
describe("POST /api/admin/shifts — event period", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    eventFindFirst.mockResolvedValue({ id: "e", startDate: new Date("2030-09-08T00:00:00Z"), endDate: new Date("2030-09-09T00:00:00Z") })
  })
  const post = (date: string) =>
    new Request("http://x/api/admin/shifts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ eventId: "e", roleName: "Bar", label: "Bar", date, startTime: "14:00", endTime: "16:00", capacity: 2 }) })

  it("creates a shift on a day of the event, refuses a day outside it or an unreal one", async () => {
    const { POST } = await import("@/app/api/admin/shifts/route")
    expect((await POST(post("2030-09-09"))).status).toBe(201)
    const outside = await POST(post("2030-09-10"))
    expect(outside.status).toBe(400)
    expect((await outside.json()).error).toContain("pendant l'événement")
    expect((await POST(post("2030-99-99"))).status).toBe(400)
    expect(create).toHaveBeenCalledTimes(1)
  })
})
