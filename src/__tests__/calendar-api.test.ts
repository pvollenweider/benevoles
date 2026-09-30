import { describe, it, expect, vi, beforeEach } from "vitest"

// Calendar file of a volunteer's confirmed shifts (#480): personal link only, their own shifts.
const m = vi.hoisted(() => ({ findFirst: vi.fn(), findMany: vi.fn() }))
vi.mock("@/lib/prisma", () => ({ prisma: { registration: { findFirst: m.findFirst, findMany: m.findMany } } }))
vi.mock("@/lib/rate-limit", () => ({ rateLimit: vi.fn().mockResolvedValue({ ok: true }), getClientIp: () => "ip" }))

const event = { id: "e1", title: "Fête", location: "Salle", latitude: null, longitude: null, organization: { slug: "org", timeZone: "Europe/Zurich" } }
const reg = (id: string) => ({ id, shift: { roleName: "Bar", label: "Bar", date: new Date("2026-07-04T00:00:00Z"), startTime: "18:00", endTime: "20:00", locationDetails: null, contactName: null, contactPhone: null, instructions: null, latitude: null, longitude: null } })
const get = (qs = "") => new Request(`http://localhost/api/public/registrations/tok/calendar${qs}`)
const params = { params: Promise.resolve({ token: "tok" }) }

describe("GET /api/public/registrations/[token]/calendar", () => {
  beforeEach(() => vi.clearAllMocks())

  it("answers 404 without a valid personal link", async () => {
    m.findFirst.mockResolvedValue(null)
    const { GET } = await import("@/app/api/public/registrations/[token]/calendar/route")
    expect((await GET(get(), params)).status).toBe(404)
    expect(m.findMany).not.toHaveBeenCalled()
  })

  it("returns only this volunteer's confirmed shifts of the event as a private .ics", async () => {
    m.findFirst.mockResolvedValue({ volunteerId: "v1", eventId: "e1", event })
    m.findMany.mockResolvedValue([reg("r1"), reg("r2")])
    const { GET } = await import("@/app/api/public/registrations/[token]/calendar/route")
    const res = await GET(get(), params)
    expect(res.status).toBe(200)
    expect(res.headers.get("content-type")).toContain("text/calendar")
    expect(res.headers.get("cache-control")).toBe("private, no-store")
    expect(m.findMany.mock.calls[0][0].where).toEqual({ volunteerId: "v1", eventId: "e1", status: "active" })
    const body = await res.text()
    expect(body.split("BEGIN:VEVENT")).toHaveLength(3)
  })

  it("restricts to one registration with ?registration=, still within this volunteer", async () => {
    m.findFirst.mockResolvedValue({ volunteerId: "v1", eventId: "e1", event })
    m.findMany.mockResolvedValue([reg("r2")])
    const { GET } = await import("@/app/api/public/registrations/[token]/calendar/route")
    const res = await GET(get("?registration=r2"), params)
    expect(m.findMany.mock.calls[0][0].where).toEqual({ volunteerId: "v1", eventId: "e1", status: "active", id: "r2" })
    expect(res.headers.get("content-disposition")).toContain("creneau.ics")
  })

  it("answers 404 when nothing is confirmed (waitlist only)", async () => {
    m.findFirst.mockResolvedValue({ volunteerId: "v1", eventId: "e1", event })
    m.findMany.mockResolvedValue([])
    const { GET } = await import("@/app/api/public/registrations/[token]/calendar/route")
    expect((await GET(get(), params)).status).toBe(404)
  })
})
