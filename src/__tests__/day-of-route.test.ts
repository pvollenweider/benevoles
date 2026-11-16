import { describe, it, expect, vi, beforeEach } from "vitest"

// « Jour J » board route polled by the open page (#1141): the same facts as the page, never cached.
const requireOrgSessionMock = vi.hoisted(() => vi.fn())
vi.mock("@/lib/auth-guard", () => ({ requireOrgSession: requireOrgSessionMock }))
vi.mock("@/lib/prisma", () => ({ prisma: {} }))

import { GET } from "@/app/api/admin/events/[id]/day-of/route"

const params = (id: string) => ({ params: Promise.resolve({ id }) })

describe("GET /api/admin/events/[id]/day-of", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-07-04T12:30:00Z")) // 14h30 in Zurich
  })

  it("returns the board, today and the read time, uncached, confirmed people only", async () => {
    const findFirst = vi.fn().mockResolvedValue({
      id: "evt-1", startDate: new Date("2026-07-04"), endDate: new Date("2026-07-04"),
      organization: { timeZone: "Europe/Zurich" },
      shifts: [{
        id: "s1", roleName: "Bar", label: "Soir", date: new Date("2026-07-04T00:00:00Z"), startTime: "13:00", endTime: "16:00", capacity: 2, displayOrder: 0,
        contactName: null, contactPhone: null,
        registrations: [{ id: "r1", phone: null, checkedInAt: new Date("2026-07-04T11:05:00Z"), volunteer: { firstName: "Zoé", lastName: "Müller", phone: "079" } }],
      }],
    })
    requireOrgSessionMock.mockResolvedValue({ db: { event: { findFirst } } })
    const res = await GET(new Request("http://localhost/api/admin/events/evt-1/day-of"), params("evt-1"))
    vi.useRealTimers()
    expect(res.status).toBe(200)
    expect(res.headers.get("Cache-Control")).toBe("no-store")
    const body = await res.json()
    expect(body.today).toBe("2026-07-04")
    expect(body.refreshedAt).toBe("14h30")
    expect(body.board.inProgress[0].shifts[0].people).toEqual([
      { registrationId: "r1", firstName: "Zoé", lastName: "Müller", phone: "079", checkedInAt: "2026-07-04T11:05:00.000Z" },
    ])
    expect(findFirst.mock.calls[0][0].select.shifts.select.registrations.where).toEqual({ status: "active" })
  })

  it("passes the guard's refusal through", async () => {
    vi.useRealTimers()
    const { NextResponse } = await import("next/server")
    requireOrgSessionMock.mockResolvedValue(NextResponse.json({ error: "no" }, { status: 401 }))
    const res = await GET(new Request("http://localhost/api/admin/events/evt-1/day-of"), params("evt-1"))
    expect(res.status).toBe(401)
  })
})
