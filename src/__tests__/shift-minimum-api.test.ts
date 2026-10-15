import { describe, it, expect, vi, beforeEach } from "vitest"

// Minimum per shift (#949) through the API: 1 ≤ minimum ≤ places, refused with a clear message,
// also when the places are lowered under an existing minimum.

const requireOrgSessionMock = vi.hoisted(() => vi.fn())
vi.mock("@/lib/auth-guard", () => ({ requireOrgSession: requireOrgSessionMock }))
const logEvent = vi.hoisted(() => vi.fn().mockResolvedValue("log-1"))
vi.mock("@/lib/event-log", () => ({ logEvent, adminActor: () => ({ type: "admin", id: "adm-1" }), diffFields: () => null }))
vi.mock("@/lib/shift-cancel", () => ({ cancelShift: vi.fn() }))
vi.mock("@/lib/prisma", () => ({ prisma: {} }))
vi.mock("@/lib/notifications/outbox", () => ({
  collectNotifications: () => ({ payloads: [], send: vi.fn() }),
  enqueueNotifications: vi.fn().mockResolvedValue([]),
  deliverAfterResponse: vi.fn(),
}))

const request = (url: string, method: string, body: unknown) =>
  new Request(`http://localhost${url}`, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })

const validShift = { eventId: "evt-a", roleName: "Bar", label: "Bar", date: "2026-07-04", startTime: "10:00", endTime: "12:00", capacity: 4 }

describe("POST /api/admin/shifts with a minimum", () => {
  const create = vi.fn()
  beforeEach(() => {
    vi.clearAllMocks()
    create.mockImplementation(async ({ data }: { data: object }) => ({ id: "s1", ...data }))
    requireOrgSessionMock.mockResolvedValue({
      db: { event: { findFirst: vi.fn().mockResolvedValue({ id: "evt-a", startDate: new Date("2026-07-04"), endDate: new Date("2026-07-05") }) }, shift: { findMany: vi.fn().mockResolvedValue([]), create } },
      organizationId: "org-a", session: {},
    })
  })

  it("saves 1 to the places, or none", async () => {
    const { POST } = await import("@/app/api/admin/shifts/route")
    expect((await POST(request("/api/admin/shifts", "POST", { ...validShift, minVolunteers: 2 }))).status).toBe(201)
    expect(create.mock.calls[0][0].data.minVolunteers).toBe(2)
    expect((await POST(request("/api/admin/shifts", "POST", { ...validShift, minVolunteers: null }))).status).toBe(201)
    expect((await POST(request("/api/admin/shifts", "POST", validShift))).status).toBe(201)
  })

  it("refuses 0 and a minimum above the places, creating nothing", async () => {
    const { POST } = await import("@/app/api/admin/shifts/route")
    const zero = await POST(request("/api/admin/shifts", "POST", { ...validShift, minVolunteers: 0 }))
    expect(zero.status).toBe(400)
    expect((await zero.json()).error).toMatch(/au moins 1 personne/)
    const above = await POST(request("/api/admin/shifts", "POST", { ...validShift, minVolunteers: 5 }))
    expect(above.status).toBe(400)
    expect((await above.json()).error).toBe("Le minimum (5) dépasse les places (4) : baissez le minimum ou augmentez les places.")
    expect(create).not.toHaveBeenCalled()
  })
})

describe("PATCH /api/admin/shifts/[id] and the minimum", () => {
  const update = vi.fn()
  const before = {
    id: "s1", eventId: "evt-a", roleName: "Bar", label: "Bar", date: new Date("2026-07-04T00:00:00Z"), startTime: "10:00", endTime: "12:00",
    capacity: 4, minVolunteers: 3, status: "open", updatedAt: new Date(),
    event: { id: "evt-a", title: "Fête", slug: "fete", organizationId: "org-a", startDate: new Date("2026-07-04"), endDate: new Date("2026-07-05"), organization: { slug: "o" } },
    registrations: [],
  }
  beforeEach(() => {
    vi.clearAllMocks()
    update.mockImplementation(async ({ data }: { data: object }) => ({ ...before, ...data }))
    requireOrgSessionMock.mockResolvedValue({
      db: { shift: { findFirst: vi.fn().mockResolvedValue(before) }, $transaction: (fn: (tx: unknown) => unknown) => fn({ shift: { update } }) },
      organizationId: "org-a", session: {},
    })
  })
  const params = { params: Promise.resolve({ id: "s1" }) }

  it("refuses places under the existing minimum, until the minimum is lowered too", async () => {
    const { PATCH } = await import("@/app/api/admin/shifts/[id]/route")
    const res = await PATCH(request("/api/admin/shifts/s1", "PATCH", { capacity: 2 }), params)
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe("Le minimum (3) dépasse les places (2) : baissez le minimum ou augmentez les places.")
    expect(update).not.toHaveBeenCalled()

    const both = await PATCH(request("/api/admin/shifts/s1", "PATCH", { capacity: 2, minVolunteers: 2 }), params)
    expect(both.status).toBe(200)
    expect(update.mock.calls[0][0].data).toMatchObject({ capacity: 2, minVolunteers: 2 })
  })

  it("removes the minimum with null, and refuses one above the places kept", async () => {
    const { PATCH } = await import("@/app/api/admin/shifts/[id]/route")
    expect((await PATCH(request("/api/admin/shifts/s1", "PATCH", { minVolunteers: null }), params)).status).toBe(200)
    expect(update.mock.calls[0][0].data).toMatchObject({ minVolunteers: null })
    expect((await PATCH(request("/api/admin/shifts/s1", "PATCH", { minVolunteers: 5 }), params)).status).toBe(400)
  })
})

describe("PATCH /api/admin/events/[id]/roles/[roleName] with places and minimum", () => {
  const update = vi.fn()
  const params = { params: Promise.resolve({ id: "evt-a", roleName: "Bar" }) }
  beforeEach(() => {
    vi.clearAllMocks()
    update.mockResolvedValue({})
    requireOrgSessionMock.mockResolvedValue({
      db: {
        event: { findFirst: vi.fn().mockResolvedValue({ id: "evt-a" }) },
        shift: {
          findMany: vi.fn().mockResolvedValue([
            { id: "a", colorKey: null, capacity: 2, minVolunteers: null, status: "open", _count: { registrations: 0 } },
            { id: "b", colorKey: null, capacity: 5, minVolunteers: 3, status: "open", _count: { registrations: 4 } },
            { id: "c", colorKey: null, capacity: 3, minVolunteers: null, status: "cancelled", _count: { registrations: 0 } },
          ]),
          findFirst: vi.fn().mockResolvedValue(null), updateMany: vi.fn(), update,
        },
        $transaction: (fn: (tx: unknown) => unknown) => fn({ shift: { update } }),
      },
      organizationId: "org-a", session: {},
    })
  })

  it("updates places and minimum of each live shift in one write", async () => {
    const { PATCH } = await import("@/app/api/admin/events/[id]/roles/[roleName]/route")
    const res = await PATCH(request("/api/admin/events/evt-a/roles/Bar", "PATCH", { capacity: 3, minVolunteers: 2 }), params)
    expect(res.status).toBe(200)
    expect(update.mock.calls.map((c) => c[0])).toEqual([
      { where: { id: "a" }, data: { capacity: 3, minVolunteers: 2 } },
      { where: { id: "b" }, data: { capacity: 4, minVolunteers: 2 } },
    ])
    expect(logEvent.mock.calls.map((c) => c[0].changes)).toEqual([
      { capacity: { from: 2, to: 3 }, minVolunteers: { from: null, to: 2 } },
      { capacity: { from: 5, to: 4 }, minVolunteers: { from: 3, to: 2 } },
    ])
  })

  it("refuses places under a shift's minimum, or a minimum above the places, writing nothing", async () => {
    const { PATCH } = await import("@/app/api/admin/events/[id]/roles/[roleName]/route")
    const { db } = await requireOrgSessionMock()
    // Shift b with one person confirmed: 2 places would go under its minimum of 3.
    db.shift.findMany.mockResolvedValue([
      { id: "a", colorKey: null, capacity: 2, minVolunteers: null, status: "open", _count: { registrations: 0 } },
      { id: "b", colorKey: null, capacity: 5, minVolunteers: 3, status: "open", _count: { registrations: 1 } },
    ])
    const low = await PATCH(request("/api/admin/events/evt-a/roles/Bar", "PATCH", { capacity: 2 }), params)
    expect(low.status).toBe(400)
    expect((await low.json()).error).toBe("Sur 1 créneau du poste, le minimum dépasserait les places : baissez d'abord le minimum.")
    const high = await PATCH(request("/api/admin/events/evt-a/roles/Bar", "PATCH", { capacity: 2, minVolunteers: 3 }), params)
    expect(high.status).toBe(400)
    expect((await high.json()).error).toMatch(/Le minimum \(3\) dépasse les places \(2\)/)
    expect(update).not.toHaveBeenCalled()
  })
})
