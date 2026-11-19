import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest"
import { calendarFeedKey, orgCalendarFeedToken } from "@/lib/calendar-feed"

// Cross-tenant isolation of the organisation-wide personal link (#1429): the same email address
// exists in two organisations, and every read or mutation is constrained by the (volunteer,
// organisation) pair the token resolved to — never by an id sent by the client.

const m = vi.hoisted(() => ({
  volunteerFindFirst: vi.fn(),
  volunteerFindUnique: vi.fn(),
  registrationFindFirst: vi.fn(),
  registrationFindMany: vi.fn(),
  withdraw: vi.fn(),
  tokenLookupsBlocked: vi.fn(),
  recordTokenMiss: vi.fn(),
  tokenUseAllowed: vi.fn(),
}))
vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>()
  const identity = <T,>(fn: T) => fn
  return { ...actual, cache: identity, default: { ...actual, cache: identity } }
})
vi.mock("@/lib/prisma", () => ({
  prisma: {
    volunteer: { findFirst: m.volunteerFindFirst, findUnique: m.volunteerFindUnique },
    registration: { findFirst: m.registrationFindFirst, findMany: m.registrationFindMany },
  },
}))
vi.mock("@/lib/token-page-guard", () => ({
  guardTokenLookup: async <T,>(_client: unknown, lookup: () => Promise<T>) => ({ blocked: false, value: await lookup() }),
  pageClient: async () => ({ headers: new Headers() }),
}))
vi.mock("@/lib/volunteer-withdraw-server", () => ({ withdrawRegistration: m.withdraw }))
vi.mock("@/lib/token-rate-limit", () => ({
  tokenLookupsBlocked: m.tokenLookupsBlocked,
  recordTokenMiss: m.recordTokenMiss,
  tokenUseAllowed: m.tokenUseAllowed,
}))
vi.mock("@/lib/site", () => ({ contactEmail: () => null, siteName: () => "benevol.app", siteDomain: () => "benevol.app" }))
vi.mock("@/lib/urls", () => ({
  orgBaseUrl: (slug: string) => `https://${slug}.example`,
  eventPublicUrl: (slug: string, event: string) => `https://${slug}.example/${event}`,
}))

const HASH = "a".repeat(64)
const targetA = {
  id: "vola0000001",
  organizationId: "org-a",
  firstName: "Même",
  lastName: "Adresse",
  email: "same@example.ch",
  orgLinkTokenHash: HASH,
  organization: { id: "org-a", name: "Asso A", slug: "asso-a", timeZone: "Europe/Zurich", active: true, suspendedAt: null },
}
const targetB = { ...targetA, id: "volb0000001", organizationId: "org-b", organization: { ...targetA.organization, id: "org-b", name: "Asso B", slug: "asso-b" } }

describe("organisation-wide personal link — cross-tenant isolation", () => {
  beforeAll(() => {
    process.env.AUTH_SECRET = "s".repeat(48)
  })
  beforeEach(() => {
    vi.clearAllMocks()
    m.tokenLookupsBlocked.mockResolvedValue(false)
    m.tokenUseAllowed.mockResolvedValue(true)
    m.withdraw.mockResolvedValue({ kind: "withdrawn" })
  })

  it("the page of org A reads only org A's registrations, even when the same address exists in org B", async () => {
    m.volunteerFindFirst.mockResolvedValue(targetA)
    m.registrationFindMany.mockResolvedValue([])
    const { loadOrgPage } = await import("@/lib/org-personal-page-load")
    const loaded = await loadOrgPage("token-of-a")
    expect(loaded.state).toBe("ok")
    expect(m.volunteerFindFirst.mock.calls[0][0].where).toEqual({ orgLinkTokenHash: expect.any(String) })
    expect(m.registrationFindMany.mock.calls[0][0].where).toEqual({
      volunteerId: "vola0000001",
      status: { in: ["active", "waiting", "offered", "requested"] },
      event: { organizationId: "org-a" },
    })
    expect(JSON.stringify(m.registrationFindMany.mock.calls[0][0].where)).not.toContain("org-b")
  })

  it("cancelling with a registration id from org B answers 404 and changes nothing", async () => {
    m.volunteerFindFirst.mockResolvedValue(targetA)
    m.registrationFindFirst.mockResolvedValue(null) // the id belongs to org B
    const { DELETE } = await import("@/app/api/public/mes-inscriptions/[token]/route")
    const res = await DELETE(new Request("http://localhost/api/public/mes-inscriptions/token-of-a", {
      method: "DELETE",
      headers: { "Content-Type": "application/json", "x-forwarded-for": `ct-${Math.random()}` },
      body: JSON.stringify({ registrationId: "reg-of-b" }),
    }), { params: Promise.resolve({ token: "token-of-a" }) })
    expect(res.status).toBe(404)
    expect(m.registrationFindFirst.mock.calls[0][0].where).toMatchObject({ id: "reg-of-b", volunteerId: "vola0000001", event: { organizationId: "org-a" } })
    expect(m.withdraw).not.toHaveBeenCalled()
  })

  it("the event hop of org A refuses an event id that is not one of this volunteer's live registrations", async () => {
    m.volunteerFindFirst.mockResolvedValue(targetA)
    m.registrationFindFirst.mockResolvedValue(null)
    const { loadOrgEventTarget } = await import("@/lib/org-personal-page-load")
    expect(await loadOrgEventTarget("token-of-a", "event-of-b")).toEqual({ state: "not_found" })
    expect(m.registrationFindFirst.mock.calls[0][0].where).toEqual({
      volunteerId: "vola0000001",
      eventId: "event-of-b",
      status: { in: ["active", "waiting", "offered", "requested"] },
      event: { organizationId: "org-a" },
    })
  })

  it("a token of org B never opens org A's page", async () => {
    m.volunteerFindFirst.mockResolvedValue(targetB)
    m.registrationFindMany.mockResolvedValue([])
    const { loadOrgPage } = await import("@/lib/org-personal-page-load")
    await loadOrgPage("token-of-b")
    expect(m.registrationFindMany.mock.calls[0][0].where.event).toEqual({ organizationId: "org-b" })
  })

  it("the organisation calendar feed of org A reads only org A's registrations, even when the same address exists in org B", async () => {
    m.volunteerFindUnique.mockResolvedValue(targetA)
    m.registrationFindMany.mockResolvedValue([])
    const token = orgCalendarFeedToken("vola0000001", HASH, calendarFeedKey("s".repeat(48)))
    const { GET } = await import("@/app/api/public/mes-inscriptions/[token]/calendar.ics/route")
    const res = await GET(new Request(`http://localhost/api/public/mes-inscriptions/${token}/calendar.ics`), {
      params: Promise.resolve({ token }),
    })
    expect(res.status).toBe(200)
    expect(m.volunteerFindUnique.mock.calls[0][0].where).toEqual({ id: "vola0000001" })
    expect(m.registrationFindMany.mock.calls[0][0].where).toEqual({
      volunteerId: "vola0000001",
      event: { organizationId: "org-a" },
      status: "active",
    })
    expect(JSON.stringify(m.registrationFindMany.mock.calls[0][0].where)).not.toContain("org-b")
  })
})
