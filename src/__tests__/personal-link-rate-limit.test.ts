import { describe, it, expect, vi, beforeEach } from "vitest"

// Personal-link API rate limits (#609): normal use from one shared connection is never refused;
// failed lookups are limited per IP, and a blocked IP is refused even with a valid link.

const findFirst = vi.hoisted(() => vi.fn())
const findMany = vi.hoisted(() => vi.fn())
const updateMany = vi.hoisted(() => vi.fn())
const count = vi.hoisted(() => vi.fn().mockResolvedValue(0))
const volunteerUpdate = vi.hoisted(() => vi.fn())
vi.mock("@/lib/prisma", () => ({
  prisma: { registration: { findFirst, findMany, updateMany, count }, volunteer: { updateMany: vi.fn().mockResolvedValue({ count: 1 }), findUniqueOrThrow: volunteerUpdate } },
}))
vi.mock("@/lib/waitlist", () => ({ promoteNextInWaitlist: vi.fn().mockResolvedValue(true) }))
vi.mock("@/lib/event-log", () => ({ logEvent: vi.fn().mockResolvedValue("log-1") }))
vi.mock("@/lib/report-error", () => ({ reportError: () => () => {} }))
vi.mock("@/lib/withdrawal-notifications", () => ({ buildWithdrawalNotifications: vi.fn().mockResolvedValue([]) }))
vi.mock("@/lib/notifications/outbox", () => ({ enqueueNotifications: vi.fn().mockResolvedValue([]), deliverAfterResponse: vi.fn() }))

const valid = { id: "r1", eventId: "e1", shiftId: "s1", volunteerId: "v1", status: "active" }
// What the withdraw route reads: the volunteer is told of the withdrawal by email (#809).
const withdrawable = {
  ...valid,
  volunteer: { firstName: "A", lastName: "B", email: "a@b.c" },
  shift: { id: "s1", roleName: "Bar", label: "Bar", date: new Date("2026-07-04"), startTime: "10:00", endTime: "12:00", capacity: 2 },
  event: { id: "e1", title: "T", organizationId: "o1", organization: { slug: "o", timeZone: "Europe/Zurich" } },
}
const page = {
  ...valid,
  volunteer: { firstName: "A", lastName: "B", email: "a@b.c", availabilityPeriods: [], availabilityNote: null, phone: null },
  event: { id: "e1", title: "T", slug: "t", confirmationMessage: null, latitude: null, longitude: null, organization: { slug: "o", timeZone: "Europe/Zurich", replyToEmail: null } },
}

let ipSeq = 0
const freshIp = () => `10.9.${Math.floor(++ipSeq / 250)}.${ipSeq % 250}`
const request = (method: string, ip: string, body?: unknown) =>
  new Request("http://localhost/api/public/registrations/tok", {
    method,
    headers: { "x-forwarded-for": ip, "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
const params = (token: string) => ({ params: Promise.resolve({ token }) })

async function routes() {
  const main = await import("@/app/api/public/registrations/[token]/route")
  const availability = await import("@/app/api/public/registrations/[token]/availability/route")
  return { GET: main.GET, DELETE: main.DELETE, PATCH: availability.PATCH }
}

describe("personal-link API rate limits", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    findMany.mockResolvedValue([])
    updateMany.mockResolvedValue({ count: 1 })
    volunteerUpdate.mockResolvedValue({ availabilityPeriods: [], availabilityNote: null })
  })

  it("one connection can open its pages and withdraw several shifts without being refused", async () => {
    const { GET, DELETE } = await routes()
    const ip = freshIp()
    // Before #609: 10 reads and 5 withdrawals per hour per IP for everyone behind it.
    for (let i = 0; i < 15; i++) {
      findFirst.mockResolvedValueOnce(page)
      expect((await GET(request("GET", ip), params(`tok-read-${i % 3}`))).status).toBe(200)
    }
    for (let i = 0; i < 8; i++) {
      findFirst.mockResolvedValueOnce(withdrawable)
      expect((await DELETE(request("DELETE", ip), params(`tok-del-${i}`))).status).toBe(200)
    }
  })

  it("blocks an IP after 20 failed lookups, even for a valid link afterwards", async () => {
    const { GET, DELETE } = await routes()
    const ip = freshIp()
    findFirst.mockResolvedValue(null)
    for (let i = 0; i < 20; i++) expect((await GET(request("GET", ip), params(`guess-${i}`))).status).toBe(404)
    expect((await GET(request("GET", ip), params("guess-21"))).status).toBe(429)
    findFirst.mockResolvedValue(page)
    expect((await GET(request("GET", ip), params("real"))).status).toBe(429)
    expect((await DELETE(request("DELETE", ip), params("real"))).status).toBe(429)
    // The block does not touch the database lookup any more.
    expect(findFirst).toHaveBeenCalledTimes(20)
    // Another connection is not affected.
    expect((await GET(request("GET", freshIp()), params("real"))).status).toBe(200)
  })

  it("limits one valid link to 60 reads per hour", async () => {
    const { GET } = await routes()
    findFirst.mockResolvedValue(page)
    const token = `tok-many-${Math.random()}`
    for (let i = 0; i < 60; i++) expect((await GET(request("GET", freshIp()), params(token))).status).toBe(200)
    expect((await GET(request("GET", freshIp()), params(token))).status).toBe(429)
  })

  it("a lost race on a valid link (already withdrawn meanwhile) is not counted as a failed lookup", async () => {
    const { DELETE, GET } = await routes()
    const ip = freshIp()
    findFirst.mockResolvedValue(valid)
    updateMany.mockResolvedValue({ count: 0 })
    for (let i = 0; i < 25; i++) expect((await DELETE(request("DELETE", ip), params(`race-${i}`))).status).toBe(404)
    findFirst.mockResolvedValue(page)
    expect((await GET(request("GET", ip), params("race-page"))).status).toBe(200)
  })

  it("availability: valid saves are not limited per IP, failed lookups are", async () => {
    const { PATCH } = await routes()
    const ip = freshIp()
    findFirst.mockResolvedValue({ volunteerId: "v1" })
    for (let i = 0; i < 12; i++) expect((await PATCH(request("PATCH", ip, { availabilityPeriods: [], availabilityNote: null }), params(`tok-av-${i}`))).status).toBe(200)
    findFirst.mockResolvedValue(null)
    const other = freshIp()
    for (let i = 0; i < 20; i++) expect((await PATCH(request("PATCH", other, { availabilityPeriods: [], availabilityNote: null }), params(`bad-${i}`))).status).toBe(404)
    expect((await PATCH(request("PATCH", other, { availabilityPeriods: [], availabilityNote: null }), params("bad-21"))).status).toBe(429)
  })
})
