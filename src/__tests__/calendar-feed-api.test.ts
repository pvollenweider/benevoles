import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest"
import { calendarFeedKey, calendarFeedToken } from "@/lib/calendar-feed"
import { hashToken } from "@/lib/token-hash"

// Calendar subscription of a personal link (#961): its own read-only token, revoked with the link,
// the current confirmed shifts only, failed lookups counted on their own.
const SECRET = "s".repeat(48)
const m = vi.hoisted(() => ({ findUnique: vi.fn(), findMany: vi.fn() }))
vi.mock("@/lib/prisma", () => ({ prisma: { registration: { findUnique: m.findUnique, findMany: m.findMany } } }))
const rl = vi.hoisted(() => ({ rateLimit: vi.fn(), isRateLimited: vi.fn() }))
vi.mock("@/lib/rate-limit", () => ({ rateLimit: rl.rateLimit, isRateLimited: rl.isRateLimited, getClientIp: () => "ip" }))

const HASH = "a".repeat(64)
const key = calendarFeedKey(SECRET)
const token = calendarFeedToken("cmreg0000001", HASH, key)
const event = {
  id: "e1", title: "Fête", slug: "fete", publicStatus: "published", location: "Salle", latitude: null, longitude: null,
  updatedAt: new Date("2026-05-01T00:00:00Z"), organization: { slug: "org", timeZone: "Europe/Zurich", updatedAt: new Date("2026-01-01T00:00:00Z"), active: true, suspendedAt: null },
}
const anchor = (over: object = {}) => ({ editTokenHash: HASH, volunteerId: "v1", volunteer: { erasedAt: null, mergedIntoId: null }, event, ...over })
const reg = (id: string, over: object = {}) => ({
  id, updatedAt: new Date("2026-05-02T00:00:00Z"),
  shift: { roleName: "Bar", label: "Bar", date: new Date("2026-07-04T00:00:00Z"), startTime: "18:00", endTime: "20:00", locationDetails: null, contactName: null, contactPhone: null, instructions: null, latitude: null, longitude: null, updatedAt: new Date("2026-05-03T00:00:00Z"), ...over },
})
const get = (t: string) => [new Request(`http://localhost/api/public/registrations/${t}/calendar.ics`), { params: Promise.resolve({ token: t }) }] as const

async function route() {
  return (await import("@/app/api/public/registrations/[token]/calendar.ics/route")).GET
}

describe("GET /api/public/registrations/[calendar token]/calendar.ics", () => {
  beforeAll(() => { process.env.AUTH_SECRET = SECRET })
  beforeEach(() => {
    vi.clearAllMocks()
    rl.rateLimit.mockResolvedValue({ ok: true })
    rl.isRateLimited.mockResolvedValue(false)
    m.findUnique.mockResolvedValue(anchor())
    m.findMany.mockResolvedValue([reg("r1"), reg("r2")])
  })

  it("serves the volunteer's confirmed shifts of the event as a private, unreferred calendar", async () => {
    const GET = await route()
    const res = await GET(...get(token))
    expect(res.status).toBe(200)
    expect(res.headers.get("content-type")).toContain("text/calendar")
    expect(res.headers.get("cache-control")).toBe("private, no-store")
    expect(res.headers.get("referrer-policy")).toBe("no-referrer")
    expect(res.headers.get("x-robots-tag")).toContain("noindex")
    expect(m.findUnique.mock.calls[0][0].where).toEqual({ id: "cmreg0000001" })
    expect(m.findMany.mock.calls[0][0].where).toEqual({ volunteerId: "v1", eventId: "e1", status: "active" })
    const body = (await res.text()).replace(/\r\n /g, "")
    expect(body.split("BEGIN:VEVENT")).toHaveLength(3)
    expect(body).toContain("UID:r1@localhost")
    expect(body).toContain("REFRESH-INTERVAL;VALUE=DURATION:PT6H")
    expect(body).toContain("X-WR-CALNAME:Fête")
    // No personal link and nothing about the volunteer in the feed.
    expect(body).not.toContain("/my/")
    expect(body).toContain("URL:http://localhost:3000/fete?org=org")
  })

  it("accepts the address with or without its .ics suffix on the token segment", async () => {
    const GET = await route()
    expect((await GET(...get(`${token}.ics`))).status).toBe(200)
  })

  it("shows a moved shift at its new time with a higher SEQUENCE, a cancelled one drops out", async () => {
    const GET = await route()
    const before = await (await GET(...get(token))).text()
    m.findMany.mockResolvedValue([reg("r1", { startTime: "19:00", updatedAt: new Date("2026-06-01T00:00:00Z") })])
    const after = await (await GET(...get(token))).text()
    const seq = (s: string, uid: string) => Number(s.split(`UID:${uid}@`)[1].match(/SEQUENCE:(\d+)/)![1])
    expect(seq(after, "r1")).toBeGreaterThan(seq(before, "r1"))
    expect(after).toContain("DTSTART:20260704T170000Z")
    expect(after).not.toContain("UID:r2@")
  })

  it("keeps answering with an empty calendar when nothing is confirmed any more (the link's own shift cancelled)", async () => {
    m.findUnique.mockResolvedValue(anchor())
    m.findMany.mockResolvedValue([])
    const GET = await route()
    const res = await GET(...get(token))
    expect(res.status).toBe(200)
    expect(await res.text()).not.toContain("BEGIN:VEVENT")
  })

  it("links to the organisation, not to an unpublished event's page", async () => {
    m.findUnique.mockResolvedValue(anchor({ event: { ...event, publicStatus: "draft" } }))
    const GET = await route()
    const body = await (await GET(...get(token))).text()
    expect(body).toContain("URL:http://localhost:3000\r\n")
  })

  it("answers 410, without counting a failed lookup, once the personal link changed, the registration is gone or the volunteer erased or merged", async () => {
    const GET = await route()
    for (const found of [anchor({ editTokenHash: "b".repeat(64) }), null, anchor({ volunteer: { erasedAt: new Date(), mergedIntoId: null } }), anchor({ volunteer: { erasedAt: null, mergedIntoId: "v2" } })]) {
      m.findUnique.mockResolvedValue(found)
      const res = await GET(...get(token))
      expect(res.status).toBe(410)
      expect(res.headers.get("cache-control")).toBe("private, no-store")
    }
    expect(m.findMany).not.toHaveBeenCalled()
    expect(rl.rateLimit.mock.calls.some((c) => c[1] === "reg-feed-miss")).toBe(false)
  })

  it("refuses the personal token itself and any address the app never made, as a failed lookup of the calendar family", async () => {
    const GET = await route()
    for (const t of ["the-personal-token", calendarFeedToken("cmreg0000001", HASH, calendarFeedKey("x".repeat(48)))]) {
      expect((await GET(...get(t))).status).toBe(404)
    }
    expect(m.findUnique).not.toHaveBeenCalled()
    expect(rl.rateLimit).toHaveBeenCalledWith("ip", "reg-feed-miss", 20, 3_600_000, undefined)
    // Never against the personal-link budget: a stale subscription must not lock anyone out of their page.
    expect(rl.rateLimit.mock.calls.some((c) => c[1] === "reg-token-miss")).toBe(false)
  })

  it("refuses a client that used up its calendar misses, with Retry-After, before any lookup", async () => {
    rl.isRateLimited.mockImplementation(async (_ip: string, route: string) => route === "reg-feed-miss")
    const GET = await route()
    const res = await GET(...get(token))
    expect(res.status).toBe(429)
    expect(res.headers.get("retry-after")).toBe("3600")
    expect(m.findUnique).not.toHaveBeenCalled()
  })

  it("limits each registration's address before the database read", async () => {
    rl.rateLimit.mockImplementation(async (id: string, route: string) => ({ ok: route !== "reg-token-calendar-link" || id !== hashToken("calendar-feed:cmreg0000001") }))
    const GET = await route()
    expect((await GET(...get(token))).status).toBe(429)
    expect(m.findUnique).not.toHaveBeenCalled()
  })
})
