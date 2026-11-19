import { describe, it, expect, vi, beforeEach } from "vitest"

// The organisation-wide personal link (#1429, lot A): cancellation is bound to the volunteer and
// organisation the token resolved to, and delegates to the event page's own withdrawal rules.

const m = vi.hoisted(() => ({
  registrationFindFirst: vi.fn(),
  lookupOrgLink: vi.fn(),
  withdraw: vi.fn(),
  tokenLookupsBlocked: vi.fn(),
  recordTokenMiss: vi.fn(),
  tokenUseAllowed: vi.fn(),
}))
vi.mock("@/lib/prisma", () => ({ prisma: { registration: { findFirst: m.registrationFindFirst } } }))
vi.mock("@/lib/org-link", () => ({ lookupOrgLink: m.lookupOrgLink }))
vi.mock("@/lib/volunteer-withdraw-server", () => ({ withdrawRegistration: m.withdraw }))
vi.mock("@/lib/token-rate-limit", () => ({
  tokenLookupsBlocked: m.tokenLookupsBlocked,
  recordTokenMiss: m.recordTokenMiss,
  tokenUseAllowed: m.tokenUseAllowed,
}))

const target = {
  id: "v1",
  organizationId: "org-a",
  firstName: "Léa",
  lastName: "M",
  email: "lea@example.ch",
  organization: { id: "org-a", name: "Asso", slug: "asso", timeZone: "Europe/Zurich", active: true, suspendedAt: null },
}

const registration = {
  id: "r1",
  eventId: "e1",
  shiftId: "s1",
  volunteerId: "v1",
  status: "active",
  volunteer: { firstName: "Léa", lastName: "M", email: "lea@example.ch" },
  shift: { id: "s1", roleName: "Bar", label: "Bar", date: new Date("2031-06-02"), startTime: "10:00", endTime: "12:00", capacity: 2 },
  event: {
    id: "e1",
    title: "Fête",
    organizationId: "org-a",
    cancelDeadlineDays: null,
    cancelDeadlineHours: null,
    organization: { slug: "asso", timeZone: "Europe/Zurich" },
  },
}

const del = (body: unknown = { registrationId: "r1" }) =>
  new Request("http://localhost/api/public/mes-inscriptions/tok", {
    method: "DELETE",
    headers: { "Content-Type": "application/json", "x-forwarded-for": `org-${Math.random()}` },
    body: JSON.stringify(body),
  })

async function route() {
  return import("@/app/api/public/mes-inscriptions/[token]/route")
}

describe("DELETE /api/public/mes-inscriptions/[token]", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    m.lookupOrgLink.mockResolvedValue(target)
    m.tokenLookupsBlocked.mockResolvedValue(false)
    m.tokenUseAllowed.mockResolvedValue(true)
    m.registrationFindFirst.mockResolvedValue(registration)
    m.withdraw.mockResolvedValue({ kind: "withdrawn" })
  })

  it("reads the registration only inside the resolved volunteer and organisation", async () => {
    const { DELETE } = await route()
    const res = await DELETE(del(), { params: Promise.resolve({ token: "tok" }) })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ success: true })
    expect(m.registrationFindFirst.mock.calls[0][0].where).toEqual({
      id: "r1",
      volunteerId: "v1",
      event: { organizationId: "org-a" },
      status: { in: ["active", "waiting", "offered", "requested"] },
    })
    expect(m.withdraw).toHaveBeenCalledWith(expect.objectContaining({ registration, message: null, timeZone: "Europe/Zurich" }))
  })

  it("404 and no withdrawal for a registration id of another organisation or volunteer", async () => {
    m.registrationFindFirst.mockResolvedValue(null)
    const { DELETE } = await route()
    const res = await DELETE(del({ registrationId: "reg-other-org" }), { params: Promise.resolve({ token: "tok" }) })
    expect(res.status).toBe(404)
    expect(m.withdraw).not.toHaveBeenCalled()
  })

  it("passes the event's refusal through (409) without writing anything itself", async () => {
    m.withdraw.mockResolvedValue({ kind: "refused", reason: "deadline", error: "Le délai est passé." })
    const { DELETE } = await route()
    const res = await DELETE(del(), { params: Promise.resolve({ token: "tok" }) })
    expect(res.status).toBe(409)
    expect(await res.json()).toMatchObject({ code: "cancel_closed", reason: "deadline", error: "Le délai est passé." })
  })

  it("404 with a miss for an unknown token", async () => {
    m.lookupOrgLink.mockResolvedValue(null)
    const { DELETE } = await route()
    const res = await DELETE(del(), { params: Promise.resolve({ token: "nope" }) })
    expect(res.status).toBe(404)
    expect(m.recordTokenMiss).toHaveBeenCalled()
    expect(m.registrationFindFirst).not.toHaveBeenCalled()
  })

  it("refuses while the organisation is suspended", async () => {
    m.lookupOrgLink.mockResolvedValue({ ...target, organization: { ...target.organization, suspendedAt: new Date() } })
    const { DELETE } = await route()
    const res = await DELETE(del(), { params: Promise.resolve({ token: "tok" }) })
    expect(res.status).toBe(403)
    expect(await res.json()).toMatchObject({ code: "org_unavailable" })
    expect(m.registrationFindFirst).not.toHaveBeenCalled()
  })

  it("rate-limits a valid link's withdrawals", async () => {
    m.tokenUseAllowed.mockResolvedValue(false)
    const { DELETE } = await route()
    expect((await DELETE(del(), { params: Promise.resolve({ token: "tok" }) })).status).toBe(429)
    expect(m.registrationFindFirst).not.toHaveBeenCalled()
  })

  it("rejects a body without a registration id before any lookup", async () => {
    const { DELETE } = await route()
    expect((await DELETE(del({ message: "x" }), { params: Promise.resolve({ token: "tok" }) })).status).toBe(400)
    expect(m.lookupOrgLink).not.toHaveBeenCalled()
  })
})
