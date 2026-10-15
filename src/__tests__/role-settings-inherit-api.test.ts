import { describe, it, expect, vi, beforeEach } from "vitest"

// A shift created in an existing poste, or moved to one, takes the poste's settings (#1002):
// colour, limit per volunteer, reserved access, cumulable (#986) and order. A new poste keeps the
// defaults. Each route is checked for each setting.

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

const request = (url: string, method: string, body?: unknown) =>
  new Request(`http://localhost${url}`, { method, headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) })

/** The poste « Sécurité » as « Gérer les postes » left it, on each of its live shifts. */
const POSTE = { colorKey: "teal", maxPerVolunteer: 2, reservedTags: ["sécurité"], overlapAllowed: true, displayOrder: 300 }
const SETTINGS = Object.keys(POSTE) as (keyof typeof POSTE)[]
const posteShift = (patch: object = {}) => ({ roleName: "Sécurité", ...POSTE, updatedAt: new Date("2026-07-01T10:00:00Z"), ...patch })

const create = vi.fn()
const createMany = vi.fn()
const findMany = vi.fn()
const update = vi.fn()
const findFirst = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
  create.mockImplementation(async ({ data }: { data: object }) => ({ id: "new", date: new Date("2026-07-04"), ...data }))
  createMany.mockImplementation(async ({ data }: { data: unknown[] }) => ({ count: data.length }))
  findMany.mockResolvedValue([])
  const tx = { shift: { create, createMany, update }, shiftRecurrence: { create: vi.fn().mockResolvedValue({ id: "rule-1", fromDate: new Date("2026-07-01"), untilDate: new Date("2026-07-31") }) } }
  requireOrgSessionMock.mockResolvedValue({
    db: {
      event: { findFirst: vi.fn().mockResolvedValue({ id: "evt-a", startDate: new Date("2026-07-01"), endDate: new Date("2026-07-31") }) },
      shift: { findMany, findFirst, create },
      $transaction: async (fn: unknown) => (typeof fn === "function" ? fn(tx) : Promise.all(fn as Promise<unknown>[])),
    },
    organizationId: "org-a", session: {},
  })
})

const single = { eventId: "evt-a", roleName: "Sécurité", label: "Sécurité", date: "2026-07-04", startTime: "10:00", endTime: "12:00", capacity: 2, displayOrder: 0 }
const series = { eventId: "evt-a", roleName: "Sécurité", date: "2026-07-04", startTime: "10:00", endTime: "14:00", slotMinutes: 120, capacity: 2, displayOrder: 0 }
const recurring = {
  eventId: "evt-a", roleName: "Sécurité", from: "2026-07-01", until: "2026-07-31", weekdays: [6], everyWeeks: 1,
  startTime: "10:00", endTime: "12:00", slotMinutes: 120, capacity: 2, holidays: "none", displayOrder: 0,
}

/** Created rows of each create route, for one body. */
const creators = {
  "single (POST /api/admin/shifts)": async (body: object) => {
    const { POST } = await import("@/app/api/admin/shifts/route")
    expect((await POST(request("/api/admin/shifts", "POST", { ...single, ...body }))).status).toBe(201)
    return create.mock.calls.map((c) => c[0].data)
  },
  "series (POST /api/admin/shifts/series)": async (body: object) => {
    const { POST } = await import("@/app/api/admin/shifts/series/route")
    expect((await POST(request("/api/admin/shifts/series", "POST", { ...series, ...body }))).status).toBe(201)
    return create.mock.calls.map((c) => c[0].data)
  },
  "recurring permanence (POST /api/admin/shifts/recurrence)": async (body: object) => {
    const { POST } = await import("@/app/api/admin/shifts/recurrence/route")
    expect((await POST(request("/api/admin/shifts/recurrence", "POST", { ...recurring, ...body }))).status).toBe(201)
    return createMany.mock.calls[0][0].data as Record<string, unknown>[]
  },
}

describe.each(Object.entries(creators))("a shift created in an existing poste: %s", (_name, createShifts) => {
  it.each(SETTINGS)("takes the poste's %s", async (setting) => {
    findMany.mockResolvedValueOnce([posteShift(), posteShift()])
    const rows = await createShifts({})
    expect(rows.length).toBeGreaterThan(0)
    for (const row of rows) expect(row[setting]).toEqual(POSTE[setting])
  })

  it("reads the poste's live shifts on the event only", async () => {
    await createShifts({})
    expect(findMany.mock.calls[0][0].where).toEqual({ eventId: "evt-a", roleName: "Sécurité", status: { not: "cancelled" } })
  })

  it("takes the value in force when the poste's shifts disagree, without rewriting them", async () => {
    findMany.mockResolvedValueOnce([
      posteShift(),
      posteShift({ colorKey: null, maxPerVolunteer: null, reservedTags: [], overlapAllowed: false, displayOrder: 400 }),
      posteShift({ maxPerVolunteer: 3, reservedTags: ["secours"] }),
    ])
    const rows = await createShifts({})
    expect(rows[0]).toMatchObject({ colorKey: "teal", maxPerVolunteer: 2, reservedTags: ["sécurité", "secours"], overlapAllowed: false, displayOrder: 300 })
    expect(update).not.toHaveBeenCalled()
  })

  it("keeps the defaults and the form's order in a new poste", async () => {
    const rows = await createShifts({ roleName: "Nouveau", displayOrder: 500 })
    for (const row of rows) {
      for (const setting of ["colorKey", "maxPerVolunteer", "reservedTags", "overlapAllowed"]) expect(row).not.toHaveProperty(setting)
      expect(row.displayOrder).toBe(500)
    }
  })
})

describe("a shift moved to another poste (PATCH /api/admin/shifts/[id])", () => {
  const before = {
    id: "s1", eventId: "evt-a", roleName: "Buvette", label: "Buvette", date: new Date("2026-07-04T00:00:00Z"), startTime: "10:00", endTime: "12:00",
    capacity: 2, minVolunteers: null, status: "open", updatedAt: new Date(),
    colorKey: "rose", maxPerVolunteer: 5, reservedTags: ["bar"], overlapAllowed: false, displayOrder: 0,
    event: { id: "evt-a", title: "Fête", slug: "fete", organizationId: "org-a", startDate: new Date("2026-07-01"), endDate: new Date("2026-07-31"), organization: { slug: "o" } },
    registrations: [],
  }
  const params = { params: Promise.resolve({ id: "s1" }) }
  beforeEach(() => {
    findFirst.mockResolvedValue(before)
    update.mockImplementation(async ({ data }: { data: object }) => ({ ...before, ...data }))
  })

  it.each(SETTINGS)("takes the existing poste's %s, over its own and the form's", async (setting) => {
    findMany.mockResolvedValueOnce([posteShift()])
    const { PATCH } = await import("@/app/api/admin/shifts/[id]/route")
    expect((await PATCH(request("/api/admin/shifts/s1", "PATCH", { roleName: "Sécurité", displayOrder: 0 }), params)).status).toBe(200)
    expect(update.mock.calls[0][0].data[setting]).toEqual(POSTE[setting])
    expect(findMany.mock.calls[0][0].where).toEqual({ eventId: "evt-a", roleName: "Sécurité", status: { not: "cancelled" } })
  })

  it("keeps its own settings when the poste is new to the event, and reads nothing when the poste does not change", async () => {
    const { PATCH } = await import("@/app/api/admin/shifts/[id]/route")
    await PATCH(request("/api/admin/shifts/s1", "PATCH", { roleName: "Nouveau" }), params)
    for (const setting of SETTINGS) expect(update.mock.calls[0][0].data).not.toHaveProperty(setting)
    await PATCH(request("/api/admin/shifts/s1", "PATCH", { roleName: "Buvette", capacity: 3 }), params)
    expect(findMany).toHaveBeenCalledTimes(1)
  })
})

describe("a shift duplicated (POST /api/admin/shifts/[id]/duplicate)", () => {
  const source = {
    id: "s1", eventId: "evt-a", roleName: "Sécurité", label: "Sécurité", description: null, date: new Date("2026-07-04T00:00:00Z"), startTime: "10:00", endTime: "12:00",
    capacity: 2, minVolunteers: null, status: "open", locationDetails: null, latitude: null, longitude: null, contactName: null, contactPhone: null, instructions: null,
    internalNotes: null, waitlistEnabled: false, requiresApproval: false, minAge: null,
    // Created before #1002, without the poste's settings.
    colorKey: null, maxPerVolunteer: null, reservedTags: [], overlapAllowed: false, displayOrder: 0,
  }
  const params = { params: Promise.resolve({ id: "s1" }) }

  it.each(SETTINGS)("takes the poste's %s, not a stale value of the source", async (setting) => {
    findFirst.mockResolvedValueOnce(source)
    findMany.mockResolvedValueOnce([posteShift(), posteShift()])
    const { POST } = await import("@/app/api/admin/shifts/[id]/duplicate/route")
    expect((await POST(request("/api/admin/shifts/s1/duplicate", "POST"), params)).status).toBe(201)
    expect(create.mock.calls[0][0].data[setting]).toEqual(POSTE[setting])
  })

  it("copies the source's own settings when its poste has no other live shift", async () => {
    findFirst.mockResolvedValueOnce({ ...source, status: "cancelled", ...POSTE })
    const { POST } = await import("@/app/api/admin/shifts/[id]/duplicate/route")
    expect((await POST(request("/api/admin/shifts/s1/duplicate", "POST"), params)).status).toBe(201)
    expect(create.mock.calls[0][0].data).toMatchObject(POSTE)
  })
})
