import { describe, it, expect, vi, beforeEach } from "vitest"
// Swap requests (#1174) end through their own module, tested on Postgres (src/__integration__/shift-swaps.int.test.ts).
vi.mock("@/lib/shift-swap-server", () => ({ endSwapsIn: vi.fn(), endSwapsAfter: vi.fn() }))

// « Cumulable avec un autre créneau » (#986): set on every shift of the role by the role route,
// kept on rename, taken by a shift created in (or moved to) the role, copied by a shift duplicate.

const requireOrgSessionMock = vi.hoisted(() => vi.fn())
vi.mock("@/lib/auth-guard", () => ({ requireOrgSession: requireOrgSessionMock }))
const logEvent = vi.hoisted(() => vi.fn().mockResolvedValue("log-1"))
vi.mock("@/lib/event-log", () => ({ logEvent, adminActor: () => ({ type: "admin", id: "adm-1" }), diffFields: () => null }))
vi.mock("@/lib/shift-cancel", () => ({ cancelShift: vi.fn().mockResolvedValue({ cancelledRegistrations: 0, notified: 0, unpublished: false }) }))
vi.mock("@/lib/prisma", () => ({ prisma: {} }))
vi.mock("@/lib/notifications/outbox", () => ({
  collectNotifications: () => ({ payloads: [], send: vi.fn() }),
  enqueueNotifications: vi.fn().mockResolvedValue([]),
  deliverAfterResponse: vi.fn(),
}))

const request = (url: string, method: string, body?: unknown) =>
  new Request(`http://localhost${url}`, { method, headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) })

const roleShift = (id: string, overlapAllowed: boolean) => ({
  id, colorKey: null, capacity: 2, minVolunteers: null, status: "open", maxPerVolunteer: null, reservedTags: [], overlapAllowed, _count: { registrations: 0 },
})

describe("PATCH /api/admin/events/[id]/roles/[roleName] — overlapAllowed", () => {
  const updateMany = vi.fn().mockResolvedValue({ count: 2 })
  const eventQuestionUpdateMany = vi.fn().mockResolvedValue({ count: 0 })
  const shiftFindFirst = vi.fn().mockResolvedValue(null)
  let shifts = [roleShift("s1", false), roleShift("s2", true)]
  beforeEach(() => {
    vi.clearAllMocks()
    shifts = [roleShift("s1", false), roleShift("s2", true)]
    requireOrgSessionMock.mockResolvedValue({
      db: {
        event: { findFirst: vi.fn().mockResolvedValue({ id: "evt-1" }) },
        shift: { findMany: vi.fn(async () => shifts), findFirst: shiftFindFirst, updateMany },
        eventGroupLink: { findMany: vi.fn().mockResolvedValue([]) },
        eventQuestion: { updateMany: eventQuestionUpdateMany, findMany: vi.fn().mockResolvedValue([]), update: vi.fn() },
        sectorLeader: { findMany: vi.fn().mockResolvedValue([]), deleteMany: vi.fn(), updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
        async $transaction(fn: (tx: unknown) => unknown) { return fn(this) },
      },
      organizationId: "org-a", session: { user: { id: "adm-1" } },
    })
  })
  const params = { params: Promise.resolve({ id: "evt-1", roleName: "Secours" }) }

  it("sets it on every shift of the role, cancelled ones included, and logs the shifts that change", async () => {
    const { PATCH } = await import("@/app/api/admin/events/[id]/roles/[roleName]/route")
    const res = await PATCH(request("/api/admin/events/evt-1/roles/Secours", "PATCH", { overlapAllowed: true }), params)
    expect(res.status).toBe(200)
    expect(updateMany).toHaveBeenCalledWith({ where: { eventId: "evt-1", roleName: "Secours", event: { organizationId: "org-a" } }, data: { overlapAllowed: true } })
    expect(logEvent).toHaveBeenCalledTimes(1)
    expect(logEvent.mock.calls[0][0]).toMatchObject({ entityId: "s1", changes: { overlapAllowed: { from: false, to: true } } })
  })

  it("turns it off the same way", async () => {
    const { PATCH } = await import("@/app/api/admin/events/[id]/roles/[roleName]/route")
    expect((await PATCH(request("/api/admin/events/evt-1/roles/Secours", "PATCH", { overlapAllowed: false }), params)).status).toBe(200)
    expect(updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: { overlapAllowed: false } }))
  })

  it("refuses a non-boolean value, and a body with nothing to change", async () => {
    const { PATCH } = await import("@/app/api/admin/events/[id]/roles/[roleName]/route")
    expect((await PATCH(request("/api/admin/events/evt-1/roles/Secours", "PATCH", { overlapAllowed: "yes" }), params)).status).toBe(400)
    expect((await PATCH(request("/api/admin/events/evt-1/roles/Secours", "PATCH", {}), params)).status).toBe(400)
    expect(updateMany).not.toHaveBeenCalled()
  })

  it("keeps the option on rename: only the name moves, and a change in the same request reaches the new name", async () => {
    const { PATCH } = await import("@/app/api/admin/events/[id]/roles/[roleName]/route")
    const res = await PATCH(request("/api/admin/events/evt-1/roles/Secours", "PATCH", { name: "Premiers secours", overlapAllowed: true }), params)
    expect(res.status).toBe(200)
    const datas = updateMany.mock.calls.map((c) => c[0].data)
    expect(datas[0]).toEqual({ roleName: "Premiers secours" })
    expect(datas.filter((d) => "overlapAllowed" in d)).toEqual([{ overlapAllowed: true }])
    expect(updateMany.mock.calls.find((c) => "overlapAllowed" in c[0].data)![0].where.roleName).toBe("Premiers secours")
  })

  it("returns 404 for a role with no shift, updating nothing", async () => {
    shifts = []
    const { PATCH } = await import("@/app/api/admin/events/[id]/roles/[roleName]/route")
    expect((await PATCH(request("/api/admin/events/evt-1/roles/Secours", "PATCH", { overlapAllowed: true }), params)).status).toBe(404)
    expect(updateMany).not.toHaveBeenCalled()
  })
})

describe("a shift created in a cumulable role takes its option", () => {
  const create = vi.fn()
  const findMany = vi.fn()
  beforeEach(() => {
    vi.clearAllMocks()
    create.mockImplementation(async ({ data }: { data: object }) => ({ id: "new", ...data }))
    requireOrgSessionMock.mockResolvedValue({
      db: {
        event: { findFirst: vi.fn().mockResolvedValue({ id: "evt-a" }) },
        shift: { findMany, create },
        $transaction: async (fn: unknown) => typeof fn === "function" ? fn({ shift: { create, createMany: vi.fn(async ({ data }: { data: unknown[] }) => { create({ data: data[0] }); return { count: data.length } }) }, shiftRecurrence: { create: vi.fn().mockResolvedValue({ id: "rule" }) } }) : Promise.all(fn as Promise<unknown>[]),
      },
      organizationId: "org-a", session: {},
    })
  })
  const shiftBody = { eventId: "evt-a", roleName: "Secours", label: "Secours", date: "2026-07-04", startTime: "10:00", endTime: "12:00", capacity: 2 }

  it("POST /api/admin/shifts: on when every live shift of the role has it, off otherwise or for a new role", async () => {
    const { POST } = await import("@/app/api/admin/shifts/route")
    findMany.mockResolvedValueOnce([{ roleName: "Secours", overlapAllowed: true }, { roleName: "Secours", overlapAllowed: true }])
    expect((await POST(request("/api/admin/shifts", "POST", shiftBody))).status).toBe(201)
    expect(create.mock.calls[0][0].data.overlapAllowed).toBe(true)
    expect(findMany.mock.calls[0][0].where).toEqual({ eventId: "evt-a", roleName: "Secours", status: { not: "cancelled" } })

    // A new role: nothing set, the column's default (off) applies.
    findMany.mockResolvedValueOnce([])
    await POST(request("/api/admin/shifts", "POST", { ...shiftBody, roleName: "Nouveau" }))
    expect(create.mock.calls[1][0].data).not.toHaveProperty("overlapAllowed")
  })

  it("ignores an overlapAllowed sent with the shift: the role decides", async () => {
    const { POST } = await import("@/app/api/admin/shifts/route")
    findMany.mockResolvedValueOnce([])
    await POST(request("/api/admin/shifts", "POST", { ...shiftBody, overlapAllowed: true }))
    expect(create.mock.calls[0][0].data).not.toHaveProperty("overlapAllowed")
  })

  it("POST /api/admin/shifts/series sets it on every shift of the series", async () => {
    const { POST } = await import("@/app/api/admin/shifts/series/route")
    findMany.mockResolvedValueOnce([{ roleName: "Secours", overlapAllowed: true }])
    const res = await POST(request("/api/admin/shifts/series", "POST", { eventId: "evt-a", roleName: "Secours", date: "2026-07-04", startTime: "10:00", endTime: "14:00", slotMinutes: 120, capacity: 2 }))
    expect(res.status).toBe(201)
    expect(create.mock.calls.length).toBe(2)
    expect(create.mock.calls.every((c) => c[0].data.overlapAllowed === true)).toBe(true)
  })
})

describe("a shift moved to another role, or duplicated", () => {
  const update = vi.fn()
  const create = vi.fn()
  const before = {
    id: "s1", eventId: "evt-a", roleName: "Buvette", label: "Buvette", date: new Date("2026-07-04T00:00:00Z"), startTime: "10:00", endTime: "12:00",
    capacity: 2, minVolunteers: null, status: "open", updatedAt: new Date(), overlapAllowed: false,
    event: { id: "evt-a", title: "Fête", slug: "fete", organizationId: "org-a", startDate: new Date("2026-07-04"), endDate: new Date("2026-07-05"), organization: { slug: "o" } },
    registrations: [],
  }
  const findMany = vi.fn()
  beforeEach(() => {
    vi.clearAllMocks()
    update.mockImplementation(async ({ data }: { data: object }) => ({ ...before, ...data }))
    create.mockImplementation(async ({ data }: { data: object }) => ({ id: "copy", ...data }))
    requireOrgSessionMock.mockResolvedValue({
      db: { shift: { findFirst: vi.fn().mockResolvedValue(before), findMany, create }, $transaction: (fn: (tx: unknown) => unknown) => fn({ shift: { update } }) },
      organizationId: "org-a", session: {},
    })
  })
  const params = { params: Promise.resolve({ id: "s1" }) }

  it("takes the option of the role it joins", async () => {
    const { PATCH } = await import("@/app/api/admin/shifts/[id]/route")
    findMany.mockResolvedValueOnce([{ roleName: "Secours", overlapAllowed: true }])
    expect((await PATCH(request("/api/admin/shifts/s1", "PATCH", { roleName: "Secours" }), params)).status).toBe(200)
    expect(update.mock.calls[0][0].data).toMatchObject({ roleName: "Secours", overlapAllowed: true })
  })

  it("keeps its own option when the role is new to the event, and when the role does not change", async () => {
    const { PATCH } = await import("@/app/api/admin/shifts/[id]/route")
    findMany.mockResolvedValueOnce([])
    await PATCH(request("/api/admin/shifts/s1", "PATCH", { roleName: "Nouveau" }), params)
    expect(update.mock.calls[0][0].data).not.toHaveProperty("overlapAllowed")
    await PATCH(request("/api/admin/shifts/s1", "PATCH", { roleName: "Buvette", capacity: 3 }), params)
    expect(findMany).toHaveBeenCalledTimes(1)
    expect(update.mock.calls[1][0].data).not.toHaveProperty("overlapAllowed")
  })

  it("POST /api/admin/shifts/[id]/duplicate copies it", async () => {
    const { POST } = await import("@/app/api/admin/shifts/[id]/duplicate/route")
    const db = (await requireOrgSessionMock()).db
    db.shift.findFirst.mockResolvedValueOnce({ ...before, overlapAllowed: true, reservedTags: [] })
    findMany.mockResolvedValueOnce([{ roleName: "Buvette", overlapAllowed: true }])
    expect((await POST(request("/api/admin/shifts/s1/duplicate", "POST"), params)).status).toBe(201)
    expect(create.mock.calls[0][0].data.overlapAllowed).toBe(true)
  })
})
