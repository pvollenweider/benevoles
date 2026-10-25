import { describe, it, expect, vi, beforeEach } from "vitest"

// « Appliquer au poste » through the API (#1017): places, minimum and label, on one day or the
// whole event, in one transaction, logged per shift, with the counts for the popover.

const requireOrgSessionMock = vi.hoisted(() => vi.fn())
vi.mock("@/lib/auth-guard", () => ({ requireOrgSession: requireOrgSessionMock }))
const logEvent = vi.hoisted(() => vi.fn().mockResolvedValue("log-1"))
vi.mock("@/lib/event-log", () => ({ logEvent, adminActor: () => ({ type: "admin", id: "adm-1" }), diffFields: () => null }))
vi.mock("@/lib/shift-cancel", () => ({ cancelShift: vi.fn() }))
vi.mock("@/lib/prisma", () => ({ prisma: {} }))

const request = (body: unknown) =>
  new Request("http://localhost/api/admin/events/evt-a/roles/Bar", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
const params = { params: Promise.resolve({ id: "evt-a", roleName: "Bar" }) }
const day = (d: string) => new Date(`${d}T00:00:00Z`)

describe("PATCH /api/admin/events/[id]/roles/[roleName]: label and scope", () => {
  const update = vi.fn()
  const transaction = vi.fn()
  beforeEach(() => {
    vi.clearAllMocks()
    update.mockResolvedValue({})
    transaction.mockImplementation((fn: (tx: unknown) => unknown) => fn({ shift: { update } }))
    requireOrgSessionMock.mockResolvedValue({
      db: {
        event: { findFirst: vi.fn().mockResolvedValue({ id: "evt-a" }) },
        shift: {
          findMany: vi.fn().mockResolvedValue([
            { id: "a", label: "Bar", date: day("2026-07-04"), colorKey: null, capacity: 2, minVolunteers: null, status: "open", _count: { registrations: 0 } },
            { id: "b", label: "Bar soir", date: day("2026-07-04"), colorKey: null, capacity: 5, minVolunteers: null, status: "open", _count: { registrations: 5 } },
            { id: "c", label: "Bar", date: day("2026-07-05"), colorKey: null, capacity: 2, minVolunteers: null, status: "closed", _count: { registrations: 0 } },
            { id: "d", label: "Bar", date: day("2026-07-06"), colorKey: null, capacity: 2, minVolunteers: null, status: "cancelled", _count: { registrations: 0 } },
          ]),
          findFirst: vi.fn().mockResolvedValue(null), updateMany: vi.fn(), update,
        },
        $transaction: transaction,
      },
      organizationId: "org-a", session: {},
    })
  })

  it("« ce jour »: writes only that day's live shifts, label included; a shift with more people keeps its places", async () => {
    const { PATCH } = await import("@/app/api/admin/events/[id]/roles/[roleName]/route")
    const res = await PATCH(request({ capacity: 3, label: "Bar soir", date: "2026-07-04" }), params)
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ shifts: 2, days: 1, keptHigher: 1 })
    expect(transaction).toHaveBeenCalledTimes(1)
    expect(update.mock.calls.map((c) => c[0])).toEqual([{ where: { id: "a" }, data: { capacity: 3, label: "Bar soir" } }])
    expect(logEvent).toHaveBeenCalledWith(expect.objectContaining({
      action: "shift.updated", entityId: "a",
      changes: { capacity: { from: 2, to: 3 }, label: { from: "Bar", to: "Bar soir" } },
    }))
  })

  it("« tout l'événement »: every live shift of the poste over the days, never a cancelled one", async () => {
    const { PATCH } = await import("@/app/api/admin/events/[id]/roles/[roleName]/route")
    const res = await PATCH(request({ capacity: 3, minVolunteers: 2, label: "Relève" }), params)
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ shifts: 3, days: 2, keptHigher: 1 })
    expect(update.mock.calls.map((c) => c[0])).toEqual([
      { where: { id: "a" }, data: { capacity: 3, minVolunteers: 2, label: "Relève" } },
      { where: { id: "b" }, data: { minVolunteers: 2, label: "Relève" } },
      { where: { id: "c" }, data: { capacity: 3, minVolunteers: 2, label: "Relève" } },
    ])
    expect(logEvent).toHaveBeenCalledTimes(3)
  })

  it("leaves the labels alone without one", async () => {
    const { PATCH } = await import("@/app/api/admin/events/[id]/roles/[roleName]/route")
    await PATCH(request({ capacity: 2, date: "2026-07-04" }), params)
    expect(update).not.toHaveBeenCalled()
    expect(logEvent).not.toHaveBeenCalled()
  })

  it("refuses a day with the poste's own settings, an invalid day, an empty label, and a day without shifts", async () => {
    const { PATCH } = await import("@/app/api/admin/events/[id]/roles/[roleName]/route")
    expect((await PATCH(request({ name: "Buvette", date: "2026-07-04" }), params)).status).toBe(400)
    expect((await PATCH(request({ capacity: 2, date: "2026-02-30" }), params)).status).toBe(400)
    expect((await PATCH(request({ capacity: 2, label: "  " }), params)).status).toBe(400)
    const none = await PATCH(request({ capacity: 2, date: "2026-07-06" }), params)
    expect(none.status).toBe(404)
    expect((await none.json()).error).toBe("Aucun créneau du poste ce jour.")
    expect(transaction).not.toHaveBeenCalled()
  })

  it("takes the role name as Next decodes it: a « % » in the name is no error (Sentry 156069049)", async () => {
    const { PATCH } = await import("@/app/api/admin/events/[id]/roles/[roleName]/route")
    const { db } = await requireOrgSessionMock.mock.results[0]?.value ?? await requireOrgSessionMock()
    const res = await PATCH(
      new Request("http://localhost/api/admin/events/evt-a/roles/Calcul%2010%25", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ capacity: 3 }) }),
      { params: Promise.resolve({ id: "evt-a", roleName: "Calcul 10%" }) },
    )
    expect(res.status).toBe(200)
    expect(JSON.stringify(db.shift.findMany.mock.calls)).toContain('"roleName":"Calcul 10%"')
  })
})
