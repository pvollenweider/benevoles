import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest"
import { calendarFeedKey, calendarFeedToken, orgCalendarFeedToken } from "@/lib/calendar-feed"

// Organisation-wide calendar subscription (#1429, lot C): one read-only feed for every confirmed
// upcoming shift of the volunteer in the organisation, revoked with the organisation link.
const SECRET = "s".repeat(48)
const HASH = "a".repeat(64)
const VOLUNTEER = "cmvol0000001"
const key = calendarFeedKey(SECRET)
const token = orgCalendarFeedToken(VOLUNTEER, HASH, key)

const m = vi.hoisted(() => ({ findUnique: vi.fn(), findMany: vi.fn() }))
vi.mock("@/lib/prisma", () => ({ prisma: { volunteer: { findUnique: m.findUnique }, registration: { findMany: m.findMany } } }))
const rl = vi.hoisted(() => ({ blocked: vi.fn(), miss: vi.fn(), useAllowed: vi.fn() }))
vi.mock("@/lib/token-rate-limit", () => ({
  tokenLookupsBlocked: rl.blocked,
  recordTokenMiss: rl.miss,
  tokenUseAllowed: rl.useAllowed,
  TOKEN_MISS_RETRY_AFTER: 3600,
}))

const organization = {
  name: "Asso",
  slug: "asso",
  timeZone: "Europe/Zurich",
  updatedAt: new Date("2026-01-01T00:00:00Z"),
  active: true,
  suspendedAt: null,
}
const anchor = (over: object = {}) => ({ orgLinkTokenHash: HASH, organizationId: "org-a", erasedAt: null, mergedIntoId: null, organization, ...over })
const event = (id: string, title: string, over: object = {}) => ({
  id,
  title,
  slug: id,
  publicStatus: "published",
  location: "Salle",
  latitude: null,
  longitude: null,
  updatedAt: new Date("2026-05-01T00:00:00Z"),
  ...over,
})
const row = (id: string, e: ReturnType<typeof event>, over: object = {}) => ({
  id,
  status: "active",
  updatedAt: new Date("2026-05-02T00:00:00Z"),
  shift: {
    roleName: "Bar",
    label: "Bar",
    date: new Date("2031-07-04T00:00:00Z"),
    startTime: "18:00",
    endTime: "20:00",
    locationDetails: null,
    contactName: null,
    contactPhone: null,
    instructions: null,
    latitude: null,
    longitude: null,
    updatedAt: new Date("2026-05-03T00:00:00Z"),
    ...over,
  },
  event: e,
})

const get = (t: string, query = "") => [
  new Request(`http://localhost/api/public/mes-inscriptions/${t}/calendar.ics${query}`),
  { params: Promise.resolve({ token: t }) },
] as const

async function route() {
  return (await import("@/app/api/public/mes-inscriptions/[token]/calendar.ics/route")).GET
}

describe("GET /api/public/mes-inscriptions/[calendar token]/calendar.ics", () => {
  beforeAll(() => {
    process.env.AUTH_SECRET = SECRET
  })
  beforeEach(() => {
    vi.clearAllMocks()
    rl.blocked.mockResolvedValue(false)
    rl.useAllowed.mockResolvedValue(true)
    m.findUnique.mockResolvedValue(anchor())
    m.findMany.mockResolvedValue([row("r1", event("e1", "Fête")), row("r2", event("e2", "Café"))])
  })

  it("serves every confirmed upcoming shift of the volunteer across the organisation's events", async () => {
    const GET = await route()
    const res = await GET(...get(token))
    expect(res.status).toBe(200)
    expect(res.headers.get("content-type")).toContain("text/calendar")
    expect(res.headers.get("cache-control")).toBe("private, no-store")
    expect(res.headers.get("referrer-policy")).toBe("no-referrer")
    expect(res.headers.get("x-robots-tag")).toContain("noindex")
    expect(res.headers.get("content-disposition")).toContain("inline")
    // The volunteer and the organisation come from the token, never from the request.
    expect(m.findUnique.mock.calls[0][0].where).toEqual({ id: VOLUNTEER })
    expect(m.findMany.mock.calls[0][0].where).toEqual({
      volunteerId: VOLUNTEER,
      event: { organizationId: "org-a" },
      status: "active",
    })
    const body = (await res.text()).replace(/\r\n /g, "")
    expect(body.split("BEGIN:VEVENT")).toHaveLength(3)
    expect(body).toContain("UID:r1@localhost")
    expect(body).toContain("UID:r2@localhost")
    expect(body).toContain("X-WR-CALNAME:Mes créneaux — Asso")
    expect(body).toContain("REFRESH-INTERVAL;VALUE=DURATION:PT6H")
    // No personal link, no organisation link, nothing about the volunteer.
    expect(body).not.toContain("/my/")
    expect(body).not.toContain("/mes-inscriptions/")
  })

  it("leaves out a shift that already started, even if its registration is still confirmed", async () => {
    m.findMany.mockResolvedValue([
      row("r-upcoming", event("e1", "Fête")),
      row("r-past", event("e2", "Café"), { date: new Date("2020-07-04T00:00:00Z") }),
    ])
    const GET = await route()
    const body = await (await GET(...get(token))).text()
    expect(body).toContain("UID:r-upcoming@")
    expect(body).not.toContain("UID:r-past@")
  })

  it("accepts the address with or without its .ics suffix on the token segment", async () => {
    const GET = await route()
    expect((await GET(...get(`${token}.ics`))).status).toBe(200)
  })

  it("serves the same shifts as a one-off file with ?download=1, not as a subscription", async () => {
    const GET = await route()
    const res = await GET(...get(token, "?download=1"))
    expect(res.status).toBe(200)
    expect(res.headers.get("content-disposition")).toContain("attachment")
    const body = await res.text()
    expect(body).toContain("UID:r1@localhost")
    expect(body).not.toContain("REFRESH-INTERVAL")
    expect(body).toContain("BEGIN:VEVENT")
    expect(body).not.toContain("/my/")
    expect(body).not.toContain("/mes-inscriptions/")
  })

  it("answers 410, without counting a failed lookup, once the organisation link changed, was cleared, or the volunteer is erased or merged", async () => {
    const GET = await route()
    for (const found of [
      anchor({ orgLinkTokenHash: "b".repeat(64) }),
      anchor({ orgLinkTokenHash: null }),
      null,
      anchor({ erasedAt: new Date() }),
      anchor({ mergedIntoId: "v2" }),
    ]) {
      m.findUnique.mockResolvedValue(found)
      const res = await GET(...get(token))
      expect(res.status).toBe(410)
      expect(res.headers.get("cache-control")).toBe("private, no-store")
    }
    expect(m.findMany).not.toHaveBeenCalled()
    expect(rl.miss).not.toHaveBeenCalled()
  })

  it("refuses the organisation link itself and any address the app never made, as a failed lookup of the calendar family", async () => {
    const GET = await route()
    for (const t of ["the-organisation-token", orgCalendarFeedToken(VOLUNTEER, HASH, calendarFeedKey("x".repeat(48)))]) {
      expect((await GET(...get(t))).status).toBe(404)
    }
    expect(m.findUnique).not.toHaveBeenCalled()
    expect(rl.miss).toHaveBeenCalledTimes(2)
    expect(rl.miss).toHaveBeenCalledWith(expect.anything(), undefined, "calendar")
  })

  it("refuses a per-registration calendar token on this route", async () => {
    const GET = await route()
    expect((await GET(...get(calendarFeedToken("cmreg0000001", HASH, key)))).status).toBe(404)
    expect(m.findUnique).not.toHaveBeenCalled()
  })

  it("refuses a client that used up its calendar misses, with Retry-After, before any lookup", async () => {
    rl.blocked.mockResolvedValue(true)
    const GET = await route()
    const res = await GET(...get(token))
    expect(res.status).toBe(429)
    expect(res.headers.get("retry-after")).toBe("3600")
    expect(m.findUnique).not.toHaveBeenCalled()
  })

  it("limits each volunteer's address before the database read", async () => {
    rl.useAllowed.mockImplementation(async (id: string) => id !== `org-calendar-feed:${VOLUNTEER}`)
    const GET = await route()
    expect((await GET(...get(token))).status).toBe(429)
    expect(m.findUnique).not.toHaveBeenCalled()
  })

  it("keeps the address valid but gives nothing while the organisation is suspended", async () => {
    m.findUnique.mockResolvedValue(anchor({ organization: { ...organization, suspendedAt: new Date() } }))
    const GET = await route()
    const res = await GET(...get(token))
    expect(res.status).toBe(403)
    expect(m.findMany).not.toHaveBeenCalled()
  })

  it("answers with an empty calendar when no confirmed shift is left", async () => {
    m.findMany.mockResolvedValue([])
    const GET = await route()
    const res = await GET(...get(token))
    expect(res.status).toBe(200)
    expect(await res.text()).not.toContain("BEGIN:VEVENT")
  })
})
