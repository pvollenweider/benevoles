import { describe, it, expect, vi, beforeEach } from "vitest"

const requireOrgSessionMock = vi.hoisted(() => vi.fn())
vi.mock("@/lib/auth-guard", () => ({ requireOrgSession: requireOrgSessionMock }))

const logEvent = vi.hoisted(() => vi.fn().mockResolvedValue("log-1"))
vi.mock("@/lib/event-log", () => ({ logEvent, adminActor: () => ({ type: "admin", id: "adm-1" }) }))
vi.mock("@/lib/prisma", () => ({ prisma: {} }))

const ruleCreate = vi.hoisted(() => vi.fn())
const createMany = vi.hoisted(() => vi.fn())
const findMany = vi.hoisted(() => vi.fn())
const transaction = vi.hoisted(() => vi.fn())

const valid = {
  eventId: "evt-a", roleName: "Accueil", from: "2026-12-01", until: "2026-12-31", weekdays: [5], everyWeeks: 1,
  startTime: "14:00", endTime: "17:00", slotMinutes: 180, capacity: 2, holidays: "CH", closures: ["2026-12-04"],
}

const post = (body: unknown) =>
  new Request("http://localhost/api/admin/shifts/recurrence", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })

describe("POST /api/admin/shifts/recurrence (#866)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ruleCreate.mockResolvedValue({ id: "rule-1" })
    createMany.mockImplementation(async ({ data }: { data: unknown[] }) => ({ count: data.length }))
    findMany.mockResolvedValue([{ id: "s1" }, { id: "s2" }])
    transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn({ shiftRecurrence: { create: ruleCreate }, shift: { createMany } }))
    const db = {
      event: { findFirst: vi.fn().mockResolvedValue({ id: "evt-a", startDate: new Date("2026-09-01"), endDate: new Date("2027-06-30") }) },
      shift: { findMany },
      $transaction: transaction,
    }
    requireOrgSessionMock.mockResolvedValue({ db, organizationId: "org-a", session: {} })
  })

  it("creates the rule and its shifts in one transaction, holidays and closures left out", async () => {
    const { POST } = await import("@/app/api/admin/shifts/recurrence/route")
    const res = await POST(post(valid))
    expect(res.status).toBe(201)
    expect(await res.json()).toEqual({ recurrenceId: "rule-1", shifts: [{ id: "s1" }, { id: "s2" }] })
    expect(ruleCreate.mock.calls[0][0].data).toMatchObject({ eventId: "evt-a", roleName: "Accueil", label: "Accueil", weekdays: [5], holidays: "CH", closures: ["2026-12-04"] })
    const rows = createMany.mock.calls[0][0].data as { date: Date; recurrenceId: string; status: string }[]
    // Fridays of December 2026: the 4th is closed, the 25th is Christmas.
    expect(rows.map((r) => r.date.toISOString().slice(0, 10))).toEqual(["2026-12-11", "2026-12-18"])
    expect(rows.every((r) => r.recurrenceId === "rule-1" && r.status === "open")).toBe(true)
    expect(logEvent).toHaveBeenCalledOnce()
    expect(logEvent.mock.calls[0][0]).toMatchObject({ action: "recurrence.created", entityType: "ShiftRecurrence", entityId: "rule-1" })
  })

  it("refuses a rule outside the event or without any date, before touching the database", async () => {
    const { POST } = await import("@/app/api/admin/shifts/recurrence/route")
    for (const patch of [{ until: "2027-09-01" }, { weekdays: [] }, { from: "2026-12-26", until: "2026-12-31", weekdays: [5] }, { everyWeeks: 3 }, { holidays: "DE" }]) {
      const res = await POST(post({ ...valid, ...patch }))
      expect(res.status).toBe(400)
      expect(typeof (await res.json()).error).toBe("string")
    }
    expect(transaction).not.toHaveBeenCalled()
  })
})
