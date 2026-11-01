// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { describe, it, expect, vi, beforeEach } from "vitest"
// Workload protection (#1171) runs on Postgres (src/__integration__/workload-policy.int.test.ts): off here.
vi.mock("@/lib/workload-guard", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/workload-guard")>()),
  lockWorkloadShared: vi.fn(), lockVolunteerRows: vi.fn(), readWorkloadGate: vi.fn(async () => ({ kind: "off" })),
  committedDuty: vi.fn(async () => []), checkDutyChange: vi.fn(async () => ({ ok: true })),
}))

/**
 * A manual add on a full or closed shift (AUTHZ-15, owner decision 2026-11-01): refused without the
 * organiser's confirmation, whose key is bound to the person, the shift's status, places and spots
 * taken; added with it, and logged. A cancelled shift is refused whatever is sent. Nothing is
 * written before the check, not even a new member.
 */
const m = vi.hoisted(() => ({
  shifts: {} as Record<string, { status: string; capacity: number; occupied: number }>,
  registrationCreate: vi.fn(),
  volunteerCreate: vi.fn(),
  shiftUpdateMany: vi.fn(),
  logEvent: vi.fn(),
  queryRaw: vi.fn(),
}))

const shiftRow = (id: string) => ({
  id, eventId: "evt-1", roleName: "Bar", label: id === "s2" ? "Matin" : "Bar", capacity: m.shifts[id].capacity, status: m.shifts[id].status,
  date: new Date("2030-07-04T00:00:00Z"), startTime: "10:00", endTime: "12:00",
  event: { title: "Festival", organization: { name: "Org A", slug: "org-a", timeZone: "Europe/Zurich" } },
})

vi.mock("@/lib/auth-guard", () => ({
  requireOrgSession: vi.fn(async () => {
    const db = {
      event: { findFirst: vi.fn(async () => null) },
      shift: {
        findFirst: vi.fn(async ({ where }: { where: { id: string } }) => shiftRow(where.id)),
        // Role limits (none here), then the full or closed check, by id.
        findMany: vi.fn(async ({ where }: { where: { id?: { in: string[] } } }) => (where.id ? where.id.in.map(shiftRow) : [])),
        updateMany: m.shiftUpdateMany,
      },
      volunteer: {
        findFirst: vi.fn(async ({ where }: { where: { id?: string } }) => (where.id === "mem-1" ? { id: "mem-1", firstName: "Emma", lastName: "Rochat", email: null } : null)),
        create: m.volunteerCreate,
      },
      registration: {
        findMany: vi.fn(async () => []),
        create: m.registrationCreate,
        count: vi.fn(async ({ where }: { where: { shiftId: string } }) => m.shifts[where.shiftId].occupied),
      },
      adminUser: { findFirst: vi.fn(async () => null) },
      $queryRaw: m.queryRaw,
      $transaction: async (fn: (tx: unknown) => unknown) => fn(db),
    }
    return { organizationId: "org-a", session: { user: { id: "adm-1", email: "lea@org-a.org", role: "admin", organizationId: "org-a" } }, db }
  }),
}))
vi.mock("@/lib/event-log", () => ({ logEvent: m.logEvent, adminActor: () => ({ type: "admin", id: "adm-1" }) }))
vi.mock("@/lib/notifications/added-by-organizer", () => ({ queueAddedByOrganizer: vi.fn() }))

const post = (body: Record<string, unknown> = {}) => new Request("http://localhost/api/admin/registrations", {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ eventId: "evt-1", volunteerId: "mem-1", shiftIds: ["s1"], ...body }),
})

describe("POST /api/admin/registrations on a full, closed or cancelled shift (AUTHZ-15)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    m.shifts = { s1: { status: "open", capacity: 5, occupied: 5 }, s2: { status: "open", capacity: 3, occupied: 1 } }
    m.registrationCreate.mockImplementation(async ({ data }: { data: { shiftId: string } }) => ({ id: `r-${data.shiftId}`, shiftId: data.shiftId }))
    m.volunteerCreate.mockImplementation(async ({ data }: { data: { firstName: string; lastName: string } }) => ({ id: "new-1", ...data, email: null }))
  })

  it("refuses a full shift without the confirmation: 409 with what to confirm, nothing created", async () => {
    const { POST } = await import("@/app/api/admin/registrations/route")
    const res = await POST(post())
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body).toMatchObject({ code: "shift_override", shifts: [{ shiftId: "s1", full: true, closed: false, occupied: 5, capacity: 5, key: "o1|manual_add|mem-1|s1|open|5|5", roleName: "Bar", date: "2030-07-04" }] })
    expect(body.error).toContain("rien n'a été ajouté")
    expect(m.registrationCreate).not.toHaveBeenCalled()
    expect(m.logEvent).not.toHaveBeenCalled()
  })

  it("adds with the confirmation, logs the overbooking, and leaves the status alone when it is not open", async () => {
    const { POST } = await import("@/app/api/admin/registrations/route")
    const res = await POST(post({ shiftOverride: ["o1|manual_add|mem-1|s1|open|5|5"] }))
    expect(res.status).toBe(201)
    expect(m.registrationCreate).toHaveBeenCalledTimes(1)
    expect(m.logEvent.mock.calls[0][0].changes.shiftOverride).toEqual({ from: null, to: "complet, 6 sur 5" })
    // Only an open shift turns « Complet »: a closed one stays closed.
    expect(m.shiftUpdateMany).toHaveBeenCalledWith({ where: { id: "s1", status: "open" }, data: { status: "full" } })
  })

  it("asks again when the count changed since the confirmation", async () => {
    m.shifts.s1.occupied = 6
    const { POST } = await import("@/app/api/admin/registrations/route")
    const res = await POST(post({ shiftOverride: ["o1|manual_add|mem-1|s1|open|5|5"] }))
    expect(res.status).toBe(409)
    expect((await res.json()).shifts[0].key).toBe("o1|manual_add|mem-1|s1|open|6|5")
    expect(m.registrationCreate).not.toHaveBeenCalled()
  })

  it("asks on a closed shift with places left", async () => {
    m.shifts.s1 = { status: "closed", capacity: 5, occupied: 2 }
    const { POST } = await import("@/app/api/admin/registrations/route")
    const res = await POST(post())
    expect(res.status).toBe(409)
    expect((await res.json()).shifts).toMatchObject([{ closed: true, full: false }])
  })

  it("refuses a cancelled shift whatever is sent: reopen it first", async () => {
    m.shifts.s1 = { status: "cancelled", capacity: 5, occupied: 0 }
    const { POST } = await import("@/app/api/admin/registrations/route")
    const res = await POST(post({ shiftOverride: ["o1|manual_add|mem-1|s1|cancelled|0|5"] }))
    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({ code: "shift_cancelled", error: "Le créneau « Bar » est annulé. Rouvrez d'abord le créneau : rien n'a été fait." })
    expect(m.registrationCreate).not.toHaveBeenCalled()
  })

  it("adds a plain shift without asking, and only the full one among several needs its key", async () => {
    const { POST } = await import("@/app/api/admin/registrations/route")
    expect((await POST(post({ shiftIds: ["s2"] }))).status).toBe(201)
    vi.clearAllMocks()
    const res = await POST(post({ shiftIds: ["s1", "s2"] }))
    expect(res.status).toBe(409)
    expect((await res.json()).shifts.map((s: { shiftId: string }) => s.shiftId)).toEqual(["s1"])
    expect(m.registrationCreate).not.toHaveBeenCalled()
  })

  it("creates no new member before the confirmation, and binds the key to the typed person", async () => {
    const { POST } = await import("@/app/api/admin/registrations/route")
    const res = await POST(post({ volunteerId: undefined, firstName: "Luca", lastName: "Bianchi" }))
    expect(res.status).toBe(409)
    const key = (await res.json()).shifts[0].key
    expect(key).toBe("o1|manual_add|new:luca bianchi|s1|open|5|5")
    expect(m.volunteerCreate).not.toHaveBeenCalled()
    const again = await POST(post({ volunteerId: undefined, firstName: "Luca", lastName: "Bianchi", shiftOverride: [key] }))
    expect(again.status).toBe(201)
    expect(m.volunteerCreate).toHaveBeenCalledTimes(1)
  })
})
