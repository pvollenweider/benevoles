import { describe, it, expect, vi, beforeEach } from "vitest"

const requireOrgSessionMock = vi.hoisted(() => vi.fn())
vi.mock("@/lib/auth-guard", () => ({ requireOrgSession: requireOrgSessionMock }))
const logEvent = vi.hoisted(() => vi.fn().mockResolvedValue("log-1"))
vi.mock("@/lib/event-log", () => ({ logEvent, adminActor: () => ({ type: "admin", id: "adm-1" }) }))
vi.mock("@/lib/shift-cancel", () => ({ cancelShift: vi.fn() }))
vi.mock("@/lib/prisma", () => ({ prisma: {} }))

const source = {
  id: "s1", eventId: "evt-a", roleName: "Bar", label: "Bar soir", description: "desc", date: new Date("2026-07-04T00:00:00Z"),
  startTime: "20:00", endTime: "23:00", capacity: 3, status: "closed", locationDetails: "Entrée B", contactName: "Léa", contactPhone: "079",
  instructions: "Gilet", displayOrder: 100, internalNotes: "note", waitlistEnabled: true, minAge: 18, colorKey: "amber",
}

describe("POST /api/admin/shifts/[id]/duplicate", () => {
  const create = vi.fn()
  beforeEach(() => {
    vi.clearAllMocks()
    create.mockImplementation(async ({ data }: { data: object }) => ({ id: "s2", ...data }))
    requireOrgSessionMock.mockResolvedValue({ db: { shift: { findFirst: vi.fn().mockResolvedValue(source), create } }, organizationId: "org-a", session: {} })
  })

  it("copies every setting, right after the original, open and empty", async () => {
    const { POST } = await import("@/app/api/admin/shifts/[id]/duplicate/route")
    const res = await POST(new Request("http://localhost/api/admin/shifts/s1/duplicate", { method: "POST" }), { params: Promise.resolve({ id: "s1" }) })
    expect(res.status).toBe(201)
    const data = create.mock.calls[0][0].data
    expect(data).toMatchObject({
      eventId: "evt-a", roleName: "Bar", label: "Bar soir", description: "desc", startTime: "23:00", endTime: "02:00", capacity: 3, status: "open",
      locationDetails: "Entrée B", contactName: "Léa", contactPhone: "079", instructions: "Gilet", displayOrder: 100, internalNotes: "note",
      waitlistEnabled: true, minAge: 18, colorKey: "amber",
    })
    expect(data.date.toISOString()).toBe("2026-07-04T00:00:00.000Z")
    expect(logEvent.mock.calls[0][0]).toMatchObject({ action: "shift.created", entityId: "s2", changes: { duplicatedFrom: { to: "s1" } } })
  })

  it("returns 404 outside the organization, creating nothing", async () => {
    requireOrgSessionMock.mockResolvedValue({ db: { shift: { findFirst: vi.fn().mockResolvedValue(null), create } }, organizationId: "org-a", session: {} })
    const { POST } = await import("@/app/api/admin/shifts/[id]/duplicate/route")
    const res = await POST(new Request("http://localhost/api/admin/shifts/s-b/duplicate", { method: "POST" }), { params: Promise.resolve({ id: "s-b" }) })
    expect(res.status).toBe(404)
    expect(create).not.toHaveBeenCalled()
  })
})

describe("PATCH /api/admin/events/[id]/roles/[roleName] with capacity", () => {
  const update = vi.fn()
  const patch = (body: unknown) =>
    new Request("http://localhost/api/admin/events/evt-a/roles/Bar", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
  const params = { params: Promise.resolve({ id: "evt-a", roleName: "Bar" }) }

  beforeEach(() => {
    vi.clearAllMocks()
    update.mockResolvedValue({})
    requireOrgSessionMock.mockResolvedValue({
      db: {
        event: { findFirst: vi.fn().mockResolvedValue({ id: "evt-a" }) },
        shift: {
          findMany: vi.fn().mockResolvedValue([
            { id: "a", colorKey: null, capacity: 2, status: "open", _count: { registrations: 0 } },
            { id: "b", colorKey: null, capacity: 5, status: "open", _count: { registrations: 4 } },
            { id: "c", colorKey: null, capacity: 3, status: "cancelled", _count: { registrations: 0 } },
          ]),
          findFirst: vi.fn().mockResolvedValue(null),
          updateMany: vi.fn(),
          update,
        },
        $transaction: (fn: (tx: unknown) => unknown) => fn({ shift: { update } }),
      },
      organizationId: "org-a", session: {},
    })
  })

  it("applies the capacity to the role's live shifts, never below the confirmed people", async () => {
    const { PATCH } = await import("@/app/api/admin/events/[id]/roles/[roleName]/route")
    const res = await PATCH(patch({ capacity: 3 }), params)
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ updated: 2, keptHigher: 1 })
    expect(update.mock.calls.map((c) => c[0])).toEqual([
      { where: { id: "a" }, data: { capacity: 3 } },
      { where: { id: "b" }, data: { capacity: 4 } },
    ])
    expect(logEvent).toHaveBeenCalledTimes(2)
    expect(logEvent.mock.calls[1][0]).toMatchObject({ entityId: "b", changes: { capacity: { from: 5, to: 4 } } })
  })

  it("refuses a capacity below one", async () => {
    const { PATCH } = await import("@/app/api/admin/events/[id]/roles/[roleName]/route")
    expect((await PATCH(patch({ capacity: 0 }), params)).status).toBe(400)
    expect(update).not.toHaveBeenCalled()
  })
})
