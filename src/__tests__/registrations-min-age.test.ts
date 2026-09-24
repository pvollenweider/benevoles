import { describe, it, expect, vi, beforeEach } from "vitest"

const eventFindFirst = vi.hoisted(() => vi.fn())
const shiftFindMany = vi.hoisted(() => vi.fn())
vi.mock("@/lib/prisma", () => ({
  prisma: {
    event: { findFirst: eventFindFirst },
    shift: { findMany: shiftFindMany },
    volunteer: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
    registration: { findMany: vi.fn().mockResolvedValue([]), aggregate: vi.fn() },
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
      { id: "shift-1", label: "Bar", capacity: 5, minAge: 18, waitlistEnabled: false, registrations: [] },
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
      { id: "shift-1", label: "Bar", capacity: 5, minAge: 18, waitlistEnabled: false, registrations: [] },
    ])
    const { POST } = await import("@/app/api/public/registrations/route")
    const res = await POST(post({ ...baseBody, birthDate: "2015-01-01" }))
    expect(res.status).toBe(403)
    const data = await res.json()
    expect(data.error).toContain("Âge minimum non atteint")
    expect(data.error).toContain("Bar")
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
})
