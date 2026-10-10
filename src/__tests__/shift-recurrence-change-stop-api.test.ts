import { describe, it, expect, vi, beforeEach } from "vitest"

const requireOrgSessionMock = vi.hoisted(() => vi.fn())
vi.mock("@/lib/auth-guard", () => ({ requireOrgSession: requireOrgSessionMock }))

const logEvent = vi.hoisted(() => vi.fn().mockResolvedValue("log-1"))
vi.mock("@/lib/event-log", () => ({ logEvent, adminActor: () => ({ type: "admin", id: "adm-1" }) }))
vi.mock("@/lib/prisma", () => ({ prisma: {} }))
const cancelShift = vi.hoisted(() => vi.fn().mockResolvedValue({ cancelledRegistrations: 1, notified: 1, unpublished: false }))
vi.mock("@/lib/shift-cancel", () => ({ cancelShift }))
const enqueueNotifications = vi.hoisted(() => vi.fn().mockResolvedValue(["out-1"]))
vi.mock("@/lib/notifications/outbox", () => ({
  collectNotifications: () => { const payloads: unknown[] = []; return { payloads, send: async (p: unknown) => { payloads.push(p) } } },
  enqueueNotifications,
  deliverAfterResponse: vi.fn(),
}))
vi.mock("@/lib/token-vault", () => ({ registrationToken: { reveal: () => "tok" } }))

const rule = {
  id: "rule-1", eventId: "evt-a", roleName: "Accueil", label: "Accueil", startTime: "14:00", endTime: "17:00", slotMinutes: 180, capacity: 2,
  fromDate: new Date("2026-09-02"), untilDate: new Date("2026-09-30"),
  event: { id: "evt-a", title: "Saison", slug: "saison", organizationId: "org-a", publicStatus: "published", organization: { slug: "asso" } },
}
const row = (id: string, date: string, statuses: string[] = []) => ({ id, date: new Date(date), startTime: "14:00", status: "open", registrations: statuses.map((status) => ({ status })) })

let tx: Record<string, Record<string, ReturnType<typeof vi.fn>>>
function setup(rows: ReturnType<typeof row>[]) {
  tx = {
    shift: {
      updateMany: vi.fn().mockResolvedValue({ count: 1 }), deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
      count: vi.fn().mockResolvedValue(3),
      findMany: vi.fn().mockResolvedValue(rows.map((r) => ({ ...r, label: "Accueil", endTime: "17:00", registrations: [{ id: "reg-1", volunteerId: "v1", volunteer: { email: "a@example.org", firstName: "Ana" } }] }))),
    },
    shiftRecurrence: { update: vi.fn(), delete: vi.fn() },
    event: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
  }
  const db = {
    shiftRecurrence: { findFirst: vi.fn().mockResolvedValue(rule) },
    shift: {
      findMany: vi.fn().mockImplementation(async (args: { where: { recurrenceId?: string } }) => args.where.recurrenceId ? rows : rows.map((r) => ({ ...r }))),
      findFirst: vi.fn().mockImplementation(async ({ where }: { where: { id: string } }) => ({ ...rows.find((r) => r.id === where.id), label: "Accueil", event: rule.event, registrations: [] })),
    },
    $transaction: vi.fn(async (fn: (t: unknown) => unknown) => fn(tx)),
  }
  requireOrgSessionMock.mockResolvedValue({ db, organizationId: "org-a", session: {} })
  return db
}

const post = (path: string, body: unknown) => new Request(`http://localhost${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
const params = { params: Promise.resolve({ id: "rule-1" }) }

describe("POST /api/admin/shifts/recurrence/[id]/stop (#866)", () => {
  beforeEach(() => vi.clearAllMocks())

  it("lists the dates with people and changes nothing until confirmed", async () => {
    setup([row("a", "2026-09-09"), row("b", "2026-09-16", ["active", "active"])])
    const { POST } = await import("@/app/api/admin/shifts/recurrence/[id]/stop/route")
    const res = await POST(post("/x", { from: "2026-09-09" }), params)
    expect(res.status).toBe(409)
    expect((await res.json()).withPeople).toEqual([{ date: "2026-09-16", startTime: "14:00", committed: 2 }])
    expect(tx.shift.deleteMany).not.toHaveBeenCalled()
    expect(cancelShift).not.toHaveBeenCalled()
  })

  it("once confirmed, deletes empty dates, cancels the others telling their volunteers, ends the rule the day before", async () => {
    setup([row("a", "2026-09-09"), row("c", "2026-09-16", ["cancelled"]), row("b", "2026-09-23", ["active"])])
    const { POST } = await import("@/app/api/admin/shifts/recurrence/[id]/stop/route")
    const res = await POST(post("/x", { from: "2026-09-09", confirm: true }), params)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ removed: ["a"], cancelled: ["c", "b"], ruleDeleted: false, notified: 1 })
    expect(tx.shift.deleteMany).toHaveBeenCalledWith({ where: { id: { in: ["a"] } } })
    expect(tx.shift.updateMany).toHaveBeenCalledWith({ where: { id: { in: ["c"] } }, data: { status: "cancelled" } })
    expect(tx.shiftRecurrence.update.mock.calls[0][0].data.untilDate.toISOString().slice(0, 10)).toBe("2026-09-08")
    expect(cancelShift).toHaveBeenCalledOnce()
    expect(logEvent.mock.calls[0][0]).toMatchObject({ action: "recurrence.stopped", entityId: "rule-1" })
  })

  it("deletes the rule when stopped from its first date, and unpublishes an event left without shifts", async () => {
    setup([row("a", "2026-09-02"), row("b", "2026-09-09")])
    tx.shift.count.mockResolvedValue(0)
    tx.event.updateMany.mockResolvedValue({ count: 1 })
    const { POST } = await import("@/app/api/admin/shifts/recurrence/[id]/stop/route")
    const res = await POST(post("/x", { from: "2026-09-01" }), params)
    expect((await res.json()).ruleDeleted).toBe(true)
    expect(tx.shiftRecurrence.delete).toHaveBeenCalled()
    expect(logEvent.mock.calls.map((c) => c[0].action)).toEqual(["recurrence.stopped", "event.unpublished"])
  })
})

describe("POST /api/admin/shifts/recurrence/[id]/change (#866)", () => {
  beforeEach(() => vi.clearAllMocks())

  it("moves the hours from a date and tells the registered volunteers", async () => {
    setup([row("a", "2026-09-02", ["active"]), row("b", "2026-09-09", ["active"])])
    const { POST } = await import("@/app/api/admin/shifts/recurrence/[id]/change/route")
    const res = await POST(post("/x", { from: "2026-09-09", startTime: "13:30" }), params)
    expect(res.status).toBe(200)
    expect(tx.shift.updateMany).toHaveBeenCalledWith({ where: { id: { in: ["b"] } }, data: { startTime: "13:30" } })
    expect(tx.shiftRecurrence.update.mock.calls[0][0].data).toEqual({ startTime: "13:30", slotMinutes: 210 })
    const queued = enqueueNotifications.mock.calls[0][0] as { kind: string; data: { newStart: string } }[]
    expect(queued.length).toBeGreaterThan(0)
    expect(queued[0]).toMatchObject({ kind: "shift_modified", data: { newStart: "13:30" } })
    expect(logEvent.mock.calls[0][0]).toMatchObject({ action: "recurrence.updated" })
  })

  it("refuses a capacity below the people registered, naming the dates", async () => {
    setup([row("a", "2026-09-09", ["active", "active", "requested"])])
    const { POST } = await import("@/app/api/admin/shifts/recurrence/[id]/change/route")
    const res = await POST(post("/x", { from: "2026-09-02", capacity: 2 }), params)
    expect(res.status).toBe(400)
    expect((await res.json()).tooSmall).toEqual([{ date: "2026-09-09", startTime: "14:00", committed: 3 }])
    expect(tx.shift.updateMany).not.toHaveBeenCalled()
  })
})
