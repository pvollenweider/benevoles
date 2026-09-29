import { describe, it, expect, vi, beforeEach } from "vitest"

const requireOrgSessionMock = vi.hoisted(() => vi.fn())
vi.mock("@/lib/auth-guard", () => ({ requireOrgSession: requireOrgSessionMock }))

const logEvent = vi.hoisted(() => vi.fn().mockResolvedValue("log-1"))
vi.mock("@/lib/event-log", () => ({ logEvent, adminActor: () => ({ type: "admin", id: "adm-1" }) }))
vi.mock("@/lib/prisma", () => ({ prisma: {} }))

const create = vi.hoisted(() => vi.fn())
const transaction = vi.hoisted(() => vi.fn())

const validSeries = {
  eventId: "evt-a",
  roleName: "Buvette",
  date: "2026-07-04",
  startTime: "10:00",
  endTime: "22:00",
  slotMinutes: 120,
  capacity: 3,
}

function post(body: unknown) {
  return new Request("http://localhost/api/admin/shifts/series", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

describe("POST /api/admin/shifts/series", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    let n = 0
    create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: `s${++n}`, ...data }))
    const tx = { shift: { create } }
    transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn(tx))
    const db = {
      event: { findFirst: vi.fn().mockResolvedValue({ id: "evt-a" }) },
      $transaction: transaction,
    }
    requireOrgSessionMock.mockResolvedValue({ db, organizationId: "org-a", session: {} })
  })

  it("creates every shift of the series in one transaction, label defaulting to the role", async () => {
    const { POST } = await import("@/app/api/admin/shifts/series/route")
    const res = await POST(post({ ...validSeries, waitlistEnabled: true, minAge: 18 }))
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body).toHaveLength(6)
    expect(transaction).toHaveBeenCalledOnce()
    expect(create).toHaveBeenCalledTimes(6)
    const first = create.mock.calls[0][0].data
    expect(first).toMatchObject({
      eventId: "evt-a", roleName: "Buvette", label: "Buvette", startTime: "10:00", endTime: "12:00",
      capacity: 3, status: "open", waitlistEnabled: true, minAge: 18,
    })
    expect(first.date.toISOString()).toBe("2026-07-04T00:00:00.000Z")
    expect(create.mock.calls[5][0].data).toMatchObject({ startTime: "20:00", endTime: "22:00" })
    expect(logEvent).toHaveBeenCalledTimes(6)
    expect(logEvent.mock.calls[0][0]).toMatchObject({ action: "shift.created", entityId: "s1" })
  })

  it("dates shifts after midnight on the next day", async () => {
    const { POST } = await import("@/app/api/admin/shifts/series/route")
    const res = await POST(post({ ...validSeries, date: "2026-12-31", startTime: "22:00", endTime: "02:00", slotMinutes: 120 }))
    expect(res.status).toBe(201)
    expect(create.mock.calls[0][0].data.date.toISOString()).toBe("2026-12-31T00:00:00.000Z")
    expect(create.mock.calls[1][0].data.date.toISOString()).toBe("2027-01-01T00:00:00.000Z")
  })

  it("refuses an impossible series with a readable message, before touching the database", async () => {
    const { POST } = await import("@/app/api/admin/shifts/series/route")
    for (const patch of [{ slotMinutes: 10 }, { slotMinutes: 900 }, { endTime: "10:00" }, { breakMinutes: -1 }, { startTime: "26:00" }, { date: "4 juillet" }]) {
      const res = await POST(post({ ...validSeries, ...patch }))
      expect(res.status).toBe(400)
      expect(typeof (await res.json()).error).toBe("string")
    }
    expect(transaction).not.toHaveBeenCalled()
  })

  it("returns 404 for an event outside the organization", async () => {
    const { POST } = await import("@/app/api/admin/shifts/series/route")
    requireOrgSessionMock.mockResolvedValue({
      db: { event: { findFirst: vi.fn().mockResolvedValue(null) }, $transaction: transaction },
      organizationId: "org-a",
      session: {},
    })
    const res = await POST(post(validSeries))
    expect(res.status).toBe(404)
    expect(transaction).not.toHaveBeenCalled()
  })
})
