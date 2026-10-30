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
 * Assisted manual assignment (#1146, lot B): adding a member to a shift they said they are not
 * available for needs the organiser's acknowledgement, bound to the answer's revision and the
 * shift's hours, re-read inside the transaction; without it nothing is created. The fit read of
 * the add form gives the key. Events without the option are unchanged.
 */
const m = vi.hoisted(() => ({
  event: null as null | Record<string, unknown>,
  answer: null as null | Record<string, unknown>,
  registrationCreate: vi.fn(),
  logEvent: vi.fn(),
  queryRaw: vi.fn(),
  requestRead: vi.fn(),
  logCreate: vi.fn(),
}))

const EVENT_IN_USE = {
  startDate: new Date("2030-07-10T00:00:00Z"), endDate: new Date("2030-07-12T00:00:00Z"),
  availabilityEnabled: true, availabilityAdoptedAt: new Date("2030-06-01T00:00:00Z"), availabilityTimeZone: "Europe/Zurich", organization: { timeZone: "Europe/Zurich" },
}
const shiftRow = { id: "s1", eventId: "evt-1", roleName: "Bar", label: "Soir", capacity: 5, registrations: [], date: new Date("2030-07-11T00:00:00Z"), startTime: "14:00", endTime: "20:00", event: { title: "Festival", organization: { name: "Org A", slug: "org-a", timeZone: "Europe/Zurich" } } }
// The 10th and 11th answered: free 09:00-12:00 on the 11th only.
const answerRow = (revision = 2) => ({
  id: "req-1", volunteerId: "mem-1", revision, reviewReason: null,
  days: [
    { date: new Date("2030-07-10T00:00:00Z"), ranges: [] },
    { date: new Date("2030-07-11T00:00:00Z"), ranges: [{ startTime: "09:00", endTime: "12:00", startsAt: new Date("2030-07-11T07:00:00Z"), endsAt: new Date("2030-07-11T10:00:00Z") }] },
  ],
})

vi.mock("@/lib/auth-guard", () => ({
  requireOrgSession: vi.fn(async () => {
    const db = {
      event: { findFirst: vi.fn(async () => m.event) },
      shift: {
        findFirst: vi.fn(async ({ where }: { where: { id: string } }) => ({ ...shiftRow, id: where.id })),
        findMany: vi.fn(async ({ where }: { where: { id?: { in: string[] } } }) => (where.id ? where.id.in.map((id) => ({ ...shiftRow, id })) : [])),
        update: vi.fn(),
      },
      volunteer: { findFirst: vi.fn(async () => ({ id: "mem-1", firstName: "Nadia", lastName: "Rochat", email: null })) },
      registration: { findMany: vi.fn(async () => []), create: m.registrationCreate },
      availabilityRequest: { findFirst: vi.fn(async (args: unknown) => { m.requestRead(args); return m.answer }) },
      adminUser: { findFirst: vi.fn(async () => null) },
      eventLog: { create: m.logCreate },
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
const fitRequest = (qs: string) => new Request(`http://localhost/api/admin/events/evt-1/availability/fit?${qs}`)
const params = { params: Promise.resolve({ id: "evt-1" }) }

describe("POST /api/admin/registrations on an event collecting availability (#1146, lot B)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    m.event = EVENT_IN_USE
    m.answer = answerRow()
    m.registrationCreate.mockImplementation(async ({ data }: { data: { volunteerId: string; shiftId: string } }) => ({ id: `r-${data.shiftId}`, ...data }))
  })

  it("refuses a shift outside declared availability without the acknowledgement, and creates nothing", async () => {
    const { POST } = await import("@/app/api/admin/registrations/route")
    const res = await POST(post())
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body).toMatchObject({ code: "availability", outside: [{ shiftId: "s1", state: "outside", label: "Pas disponible à ces heures" }] })
    expect(body.error).toMatch(/^Nadia Rochat a indiqué ne pas être disponible/)
    expect(m.registrationCreate).not.toHaveBeenCalled()
    // Shifts, then the person, locked before the answer is read.
    expect(String(m.queryRaw.mock.calls[0][0].join("?"))).toContain('FROM "Shift"')
  })

  it("adds with the acknowledgement the form received, and logs it", async () => {
    const { GET } = await import("@/app/api/admin/events/[id]/availability/fit/route")
    const fit = await (await GET(fitRequest("volunteerId=mem-1&shiftId=s1"), params)).json()
    expect(fit).toMatchObject({ inUse: true, fits: [{ shiftId: "s1", state: "outside" }] })
    const key = fit.fits[0].ackKey as string
    expect(key).toContain("|req-1|2|")

    const { POST } = await import("@/app/api/admin/registrations/route")
    const res = await POST(post({ availabilityAck: [key] }))
    expect(res.status).toBe(201)
    expect(m.registrationCreate).toHaveBeenCalledTimes(1)
    // The evidence is written in the transaction, server-derived and versioned; no second line after.
    expect(m.logCreate).toHaveBeenCalledTimes(1)
    const entry = m.logCreate.mock.calls[0][0].data
    expect(entry).toMatchObject({ action: "registration.availability_acknowledged", entityType: "Registration", entityId: "r-s1", actorType: "admin", actorId: "adm-1" })
    expect(entry.changes).toEqual({
      shiftId: { from: "s1", to: "s1" },
      availabilityAck: { from: null, to: {
        v: 1, via: "manual_add", requestId: "req-1", revision: 2, shiftStart: "2030-07-11T12:00:00.000Z", shiftEnd: "2030-07-11T18:00:00.000Z",
        timeZone: "Europe/Zurich", state: "outside", totalMinutes: 360, coveredMinutes: 0, outsideMinutes: 360, unknownMinutes: 0,
      } },
    })
    expect(m.logEvent.mock.calls[0][0].changes.outsideAvailability).toBeUndefined()
  })

  it("checks the workload protection first: a hard refusal never asks for the acknowledgement", async () => {
    const guard = await import("@/lib/workload-guard")
    vi.mocked(guard.readWorkloadGate).mockResolvedValueOnce({ kind: "incomplete" } as never)
    vi.mocked(guard.checkDutyChange).mockResolvedValueOnce({ ok: false, reason: "incomplete" })
    const { POST } = await import("@/app/api/admin/registrations/route")
    const res = await POST(post())
    expect(res.status).toBe(409)
    expect((await res.json()).code).toBe("workload")
    expect(m.requestRead).not.toHaveBeenCalled()
    expect(m.registrationCreate).not.toHaveBeenCalled()
  })

  it("refuses an acknowledgement given on an older answer", async () => {
    const { GET } = await import("@/app/api/admin/events/[id]/availability/fit/route")
    const key = (await (await GET(fitRequest("volunteerId=mem-1&shiftId=s1"), params)).json()).fits[0].ackKey
    m.answer = answerRow(3)
    const { POST } = await import("@/app/api/admin/registrations/route")
    const res = await POST(post({ availabilityAck: [key] }))
    expect(res.status).toBe(409)
    expect(m.registrationCreate).not.toHaveBeenCalled()
  })

  it("adds without acknowledgement when the person is free, or never answered for these hours", async () => {
    const { POST } = await import("@/app/api/admin/registrations/route")
    m.answer = { ...answerRow(), days: [{ date: new Date("2030-07-11T00:00:00Z"), ranges: [{ startTime: "08:00", endTime: "22:00", startsAt: new Date("2030-07-11T06:00:00Z"), endsAt: new Date("2030-07-11T20:00:00Z") }] }] }
    expect((await POST(post())).status).toBe(201)
    m.answer = null
    expect((await POST(post())).status).toBe(201)
    expect(m.logCreate).not.toHaveBeenCalled()
  })

  it("keeps the acknowledgement after collection is turned off: the answers are kept", async () => {
    m.event = { ...EVENT_IN_USE, availabilityEnabled: false }
    const { POST } = await import("@/app/api/admin/registrations/route")
    expect((await POST(post())).status).toBe(409)
  })

  it("changes nothing for an event that never used the option: no availability read, no shift lock", async () => {
    m.event = { ...EVENT_IN_USE, availabilityEnabled: false, availabilityAdoptedAt: null }
    const { POST } = await import("@/app/api/admin/registrations/route")
    expect((await POST(post())).status).toBe(201)
    expect(m.requestRead).not.toHaveBeenCalled()
    expect(m.queryRaw).not.toHaveBeenCalled()
  })
})

describe("GET /api/admin/events/[id]/availability/fit (#1146, lot B)", () => {
  beforeEach(() => { vi.clearAllMocks(); m.event = EVENT_IN_USE; m.answer = answerRow() })

  it("asks for a person and at least one shift", async () => {
    const { GET } = await import("@/app/api/admin/events/[id]/availability/fit/route")
    expect((await GET(fitRequest("shiftId=s1"), params)).status).toBe(400)
    expect((await GET(fitRequest("volunteerId=mem-1"), params)).status).toBe(400)
  })

  it("answers inUse false for an event without the option, reading no answer", async () => {
    m.event = { ...EVENT_IN_USE, availabilityEnabled: false, availabilityAdoptedAt: null }
    const { GET } = await import("@/app/api/admin/events/[id]/availability/fit/route")
    const res = await GET(fitRequest("volunteerId=mem-1&shiftId=s1"), params)
    expect(await res.json()).toEqual({ inUse: false, fits: [] })
    expect(m.requestRead).not.toHaveBeenCalled()
  })

  it("is private and never cached", async () => {
    const { GET } = await import("@/app/api/admin/events/[id]/availability/fit/route")
    const res = await GET(fitRequest("volunteerId=mem-1&shiftId=s1"), params)
    expect(res.headers.get("Cache-Control")).toBe("private, no-store")
  })
})
