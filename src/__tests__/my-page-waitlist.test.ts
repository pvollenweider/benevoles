import { describe, it, expect, vi, beforeEach } from "vitest"

// The personal page shows waitlist registrations too (#374): a waiting or offered token opens
// the page, siblings include the live statuses, and each row carries its waitlist state.

const findFirst = vi.hoisted(() => vi.fn())
const findMany = vi.hoisted(() => vi.fn())
vi.mock("@/lib/prisma", () => ({ prisma: { registration: { findFirst, findMany } } }))
vi.mock("@/lib/urls", () => ({ orgBaseUrl: (slug: string) => `https://${slug}.example` }))
vi.mock("@/lib/waitlist", () => ({ promoteNextInWaitlist: vi.fn() }))
vi.mock("@/lib/event-log", () => ({ logEvent: vi.fn() }))
vi.mock("@/lib/report-error", () => ({ reportError: () => () => {} }))

const get = (token: string) =>
  new Request(`http://localhost/api/public/registrations/${token}`, { headers: { "x-forwarded-for": `w-${Math.random()}` } })

const shift = { id: "s1", label: "Bar", roleName: "Bar", date: new Date("2026-07-04T00:00:00Z"), startTime: "10:00", endTime: "12:00" }
const expires = new Date("2026-07-01T10:00:00Z")

describe("GET /api/public/registrations/[token] — waitlist", () => {
  beforeEach(() => vi.clearAllMocks())

  it("opens for a waiting registration and exposes each row's state", async () => {
    findFirst.mockResolvedValue({
      id: "r1", volunteerId: "v1", eventId: "e1", phone: null, status: "waiting",
      volunteer: { firstName: "A", lastName: "B", email: "a@x.com", phone: null },
      event: { id: "e1", title: "F", slug: "f", confirmationMessage: null, organization: { slug: "a", timeZone: "Europe/Zurich" } },
    })
    findMany.mockResolvedValue([
      { id: "r1", editTokenLegacy: "t1", editTokenEnc: null, phone: null, status: "waiting", waitingPosition: 2, waitingExpiresAt: null, shift },
      { id: "r2", editTokenLegacy: "t2", editTokenEnc: null, phone: null, status: "offered", waitingPosition: 1, waitingExpiresAt: expires, shift: { ...shift, id: "s2" } },
    ])
    const { GET } = await import("@/app/api/public/registrations/[token]/route")
    const res = await GET(get("tok"), { params: Promise.resolve({ token: "tok" }) })
    expect(res.status).toBe(200)
    const body = await res.json()

    expect(findFirst.mock.calls[0][0].where.status).toEqual({ in: ["active", "waiting", "offered", "requested"] })
    expect(findMany.mock.calls[0][0].where.status).toEqual({ in: ["active", "waiting", "offered", "requested"] })
    expect(body.timeZone).toBe("Europe/Zurich")
    expect(body.registrations.map((r: { status: string; waitingPosition: number | null }) => [r.status, r.waitingPosition])).toEqual([["waiting", 2], ["offered", 1]])
    expect(body.registrations[1].waitingExpiresAt).toBe(expires.toISOString())
  })
})
