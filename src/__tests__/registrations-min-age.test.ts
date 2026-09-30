import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

const eventFindFirst = vi.hoisted(() => vi.fn())
const shiftFindMany = vi.hoisted(() => vi.fn())
vi.mock("@/lib/prisma", () => ({
  prisma: {
    event: { findFirst: eventFindFirst },
    shift: { findMany: shiftFindMany },
    volunteer: { findFirst: vi.fn(), create: vi.fn().mockResolvedValue({ id: "vol-1" }), update: vi.fn() },
    registration: { findMany: vi.fn().mockResolvedValue([]), aggregate: vi.fn(), create: vi.fn() },
    // Interactive transaction: runs the callback against a minimal tx client.
    $transaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn({
      $queryRaw: vi.fn(),
      volunteer: { createMany: vi.fn().mockResolvedValue({ count: 1 }), findFirstOrThrow: vi.fn().mockResolvedValue({ id: "vol-1" }) },
      registration: {
        findMany: vi.fn().mockResolvedValue([]),
        count: vi.fn().mockResolvedValue(0),
        aggregate: vi.fn().mockResolvedValue({ _max: { waitingPosition: null } }),
        create: vi.fn().mockResolvedValue({ id: "reg-1", shiftId: "shift-1", status: "active", editToken: "tok", waitingPosition: null }),
      },
    })),
  },
}))

vi.mock("@/lib/email", () => ({ sendConfirmationEmail: vi.fn(), sendAdminNotification: vi.fn() }))
vi.mock("@/lib/notifications", () => ({ sendNotification: vi.fn() }))
vi.mock("@/lib/sector-leaders", () => ({ notifySectorLeadersOfSignup: vi.fn() }))
vi.mock("@/lib/event-log", () => ({ logEvent: vi.fn() }))

function post(body: unknown) {
  return new Request("http://localhost/api/public/registrations", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-forwarded-for": `test-${Math.random()}` },
    body: JSON.stringify(body),
  })
}

const baseBody = {
  eventId: "evt-1",
  shiftIds: ["shift-1"],
  firstName: "Alice",
  lastName: "L",
  email: "a@x.com",
  consent: true,
}

describe("POST /api/public/registrations — minimum age (#192)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    eventFindFirst.mockResolvedValue({
      id: "evt-1", organizationId: "org-a", title: "Festival",
      organization: { slug: "org-a" }, confirmationMessage: null,
    })
  })

  it("rejects when the shift requires an age and no birthDate is given", async () => {
    shiftFindMany.mockResolvedValue([
      { id: "shift-1", label: "Bar", capacity: 5, minAge: 18, waitlistEnabled: false, registrations: [], date: new Date("2026-10-10T00:00:00Z"), startTime: "10:00", endTime: "12:00" },
    ])
    const { POST } = await import("@/app/api/public/registrations/route")
    const res = await POST(post(baseBody))
    expect(res.status).toBe(400)
    const data = await res.json()
    expect(data.error).toContain("Date de naissance requise")
    expect(data.error).toContain("Bar")
  })

  it("rejects when birthDate shows the volunteer is under the shift's minimum age", async () => {
    shiftFindMany.mockResolvedValue([
      { id: "shift-1", label: "Bar", capacity: 5, minAge: 18, waitlistEnabled: false, registrations: [], date: new Date("2026-10-10T00:00:00Z"), startTime: "10:00", endTime: "12:00" },
    ])
    const { POST } = await import("@/app/api/public/registrations/route")
    const res = await POST(post({ ...baseBody, birthDate: "2015-01-01" }))
    expect(res.status).toBe(403)
    const data = await res.json()
    expect(data.error).toContain("Âge minimum non atteint")
    expect(data.error).toContain("Bar")
  })

  it("refuses an invalid or future birth date before any age check (audit: NaN passed the gate)", async () => {
    shiftFindMany.mockResolvedValue([
      { id: "shift-1", label: "Bar", capacity: 5, minAge: 18, waitlistEnabled: false, registrations: [], date: new Date("2026-10-10T00:00:00Z"), startTime: "10:00", endTime: "12:00" },
    ])
    const { POST } = await import("@/app/api/public/registrations/route")
    for (const birthDate of ["pas une date", "2010-02-30", "3000-01-01", "01.01.1990"]) {
      const res = await POST(post({ ...baseBody, birthDate }))
      expect(res.status, birthDate).toBe(400)
    }
  })

  it("treats an empty birth date as none: no 400 when no shift needs one", async () => {
    shiftFindMany.mockResolvedValue([
      { id: "shift-1", label: "Bar", capacity: 5, minAge: null, waitlistEnabled: false, registrations: [], date: new Date("2026-10-10T00:00:00Z"), startTime: "10:00", endTime: "12:00" },
    ])
    const { POST } = await import("@/app/api/public/registrations/route")
    const res = await POST(post({ ...baseBody, birthDate: "" }))
    expect(res.status).not.toBe(400)
  })

  it("does not gate a shift with no minAge — request fails elsewhere, not on the age check", async () => {
    // Deliberately mismatched (shiftFindMany returns none for the requested shiftIds) so the
    // request 409s at the existing "invalid/closed shift" check, a well-defined stopping point
    // that comes right before the age gate — confirms a minAge: null shift never reaches it.
    shiftFindMany.mockResolvedValue([])
    const { POST } = await import("@/app/api/public/registrations/route")
    const res = await POST(post(baseBody))
    expect(res.status).toBe(409)
    const data = await res.json()
    expect(data.error).not.toContain("Date de naissance")
    expect(data.error).not.toContain("Âge minimum")
  })

  describe("age is checked on the shift's date, not today (#265)", () => {
    beforeEach(() => {
      vi.useFakeTimers({ toFake: ["Date"] })
      vi.setSystemTime(new Date("2026-09-28T12:00:00Z"))
    })
    afterEach(() => vi.useRealTimers())

    it("accepts a volunteer who turns 18 between registration and the shift", async () => {
      shiftFindMany.mockResolvedValue([
        { id: "shift-1", label: "Bar", capacity: 5, minAge: 18, waitlistEnabled: false, registrations: [], date: new Date("2026-10-10T00:00:00Z"), startTime: "10:00", endTime: "12:00" },
      ])
      const { POST } = await import("@/app/api/public/registrations/route")
      const res = await POST(post({ ...baseBody, birthDate: "2008-10-03" }))
      expect(res.status).toBe(201)
    })

    it("rejects a volunteer who only turns 18 after the shift", async () => {
      shiftFindMany.mockResolvedValue([
        { id: "shift-1", label: "Bar", capacity: 5, minAge: 18, waitlistEnabled: false, registrations: [], date: new Date("2026-10-10T00:00:00Z"), startTime: "10:00", endTime: "12:00" },
      ])
      const { POST } = await import("@/app/api/public/registrations/route")
      const res = await POST(post({ ...baseBody, birthDate: "2008-10-11" }))
      expect(res.status).toBe(403)
    })
  })
})
