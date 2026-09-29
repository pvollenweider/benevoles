import { describe, it, expect, vi, beforeEach } from "vitest"

const requireOrgSessionMock = vi.hoisted(() => vi.fn())
vi.mock("@/lib/auth-guard", () => ({ requireOrgSession: requireOrgSessionMock }))
vi.mock("@/lib/event-log", () => ({ logEvent: vi.fn(), adminActor: () => ({ type: "admin", id: "a" }) }))
vi.mock("@/lib/prisma", () => ({ prisma: {} }))
vi.mock("@/lib/notifications", () => ({ sendNotification: vi.fn() }))

const create = vi.hoisted(() => vi.fn())

const info = { locationDetails: "Entrée B", contactName: "Léa", contactPhone: "079 000 00 00", instructions: "Venir 10 min avant." }
const base = { eventId: "evt-a", roleName: "Bar", label: "Bar", date: "2026-07-04", startTime: "10:00", endTime: "12:00", capacity: 2 }

const post = (body: unknown) =>
  new Request("http://localhost/api/admin/shifts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })

// Practical info per shift (#397): accepted on creation, bounded in length.
describe("shift practical info — API", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    create.mockImplementation(async ({ data }: { data: unknown }) => ({ id: "s1", ...(data as object) }))
    requireOrgSessionMock.mockResolvedValue({
      db: { event: { findFirst: vi.fn().mockResolvedValue({ id: "evt-a" }) }, shift: { create } },
      organizationId: "org-a", session: {},
    })
  })

  it("POST stores place, contact and instructions", async () => {
    const { POST } = await import("@/app/api/admin/shifts/route")
    const res = await POST(post({ ...base, ...info }))
    expect(res.status).toBe(201)
    expect(create.mock.calls[0][0].data).toMatchObject(info)
  })

  it("POST refuses over-long info", async () => {
    const { POST } = await import("@/app/api/admin/shifts/route")
    expect((await POST(post({ ...base, contactName: "x".repeat(81) }))).status).toBe(400)
    expect((await POST(post({ ...base, contactPhone: "1".repeat(41) }))).status).toBe(400)
    expect((await POST(post({ ...base, instructions: "y".repeat(501) }))).status).toBe(400)
    expect(create).not.toHaveBeenCalled()
  })
})
