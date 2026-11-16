import { describe, it, expect, vi, beforeEach } from "vitest"

/**
 * « Je ne peux pas » for one shift (#1303), both POST routes: the invitation token and the personal
 * link. The same tests, because the rules are shared: rate limited per IP before any read, the same
 * 404 for an unknown/revoked/foreign link, 403 when the organisation is closed, idempotent (one row,
 * one journal entry), the shift must belong to the token's event, and a cancelled/full/past/deleted
 * shift or one already held answers clearly without writing.
 */

const OPEN_ORG = { active: true, suspendedAt: null, timeZone: "Europe/Zurich" }

const m = vi.hoisted(() => ({
  findInvite: vi.fn(),
  findRegistration: vi.fn(),
  findShift: vi.fn(),
  findDecline: vi.fn(),
  create: vi.fn(),
  eventLogCreate: vi.fn(),
  resolveOrg: vi.fn(),
  orgHeader: { value: null as string | null },
}))

vi.mock("@/lib/prisma", () => ({
  prisma: {
    memberInvite: { findUnique: m.findInvite },
    registration: { findFirst: m.findRegistration },
    shift: { findUnique: m.findShift },
    shiftDecline: { findUnique: m.findDecline, createManyAndReturn: m.create },
    eventLog: { create: m.eventLogCreate },
  },
}))
vi.mock("next/headers", () => ({
  headers: async () => new Headers(m.orgHeader.value ? { "x-org-slug": m.orgHeader.value } : {}),
}))
vi.mock("@/lib/resolve-org", () => ({ resolveOrgSlug: m.resolveOrg }))

const event = {
  id: "evt-1",
  slug: "festival",
  title: "Fête",
  organizationId: "org-a",
  organization: OPEN_ORG,
}
const link = (volunteerId = "v1", over: Record<string, unknown> = {}) => ({
  volunteerId,
  eventId: "evt-1",
  volunteer: { active: true },
  event,
  ...over,
})
const shift = (over: Record<string, unknown> = {}) => ({
  id: "shift-1",
  eventId: "evt-1",
  roleName: "Bar",
  label: "Bar",
  date: new Date("2099-07-04T00:00:00Z"),
  startTime: "18:00",
  endTime: "20:00",
  status: "open",
  capacity: 3,
  registrations: [],
  ...over,
})

let ip = 0
const request = (path: string, xff = `10.9.0.${++ip}`) =>
  new Request(`http://localhost${path}`, { method: "POST", headers: { "x-forwarded-for": xff } })

const callInvite = async (token = "tok", shiftId = "shift-1", xff?: string) => {
  const { POST } = await import("@/app/api/public/member-invite/[token]/shift-declines/[shiftId]/route")
  return POST(request(`/api/public/member-invite/${token}/shift-declines/${shiftId}`, xff), {
    params: Promise.resolve({ token, shiftId }),
  })
}
const callRegistration = async (token = "tok", shiftId = "shift-1", xff?: string) => {
  const { POST } = await import("@/app/api/public/registrations/[token]/shift-declines/[shiftId]/route")
  return POST(request(`/api/public/registrations/${token}/shift-declines/${shiftId}`, xff), {
    params: Promise.resolve({ token, shiftId }),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  m.orgHeader.value = null
  m.findInvite.mockResolvedValue(link("v1"))
  m.findRegistration.mockResolvedValue(link("v2"))
  m.findShift.mockResolvedValue(shift())
  m.findDecline.mockResolvedValue(null)
  m.create.mockResolvedValue([{ id: "sd-1" }])
  m.eventLogCreate.mockResolvedValue({ id: "log-1" })
  m.resolveOrg.mockImplementation(async (slug: string) =>
    slug === "org-a-slug" ? { org: { id: "org-a" } } : slug === "org-b-slug" ? { org: { id: "org-b" } } : null)
})

describe("POST shift-declines — the two existing secrets (#1303)", () => {
  it("records the answer for an invitation, with the volunteer as actor and no personal data", async () => {
    m.orgHeader.value = "org-a-slug"
    const res = await callInvite()
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ success: true, already: false })
    expect(m.create).toHaveBeenCalledWith({
      data: [{ shiftId: "shift-1", volunteerId: "v1" }],
      skipDuplicates: true,
      select: { id: true },
    })
    const data = m.eventLogCreate.mock.calls[0][0].data
    expect(data).toMatchObject({
      eventId: "evt-1",
      action: "shiftdecline.declined",
      entityType: "ShiftDecline",
      entityId: "sd-1",
      actorType: "volunteer",
      actorId: "v1",
      changes: { shiftId: { from: null, to: "shift-1" } },
    })
    expect(JSON.stringify(data.changes)).not.toMatch(/@|v1|Martin/i)
  })

  it("does the same for a member already registered, through the personal link", async () => {
    const res = await callRegistration()
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ success: true, already: false })
    expect(m.findRegistration).toHaveBeenCalled()
    expect(m.findInvite).not.toHaveBeenCalled()
    expect(m.eventLogCreate.mock.calls[0][0].data).toMatchObject({ actorId: "v2", entityId: "sd-1" })
  })

  it("is idempotent: a double submit creates one row and logs once", async () => {
    m.create.mockResolvedValueOnce([{ id: "sd-1" }]).mockResolvedValueOnce([])
    const first = await callInvite()
    const second = await callInvite()
    expect(first.status).toBe(200)
    expect(await second.json()).toEqual({ success: true, already: true })
    expect(m.create).toHaveBeenCalledTimes(2)
    expect(m.eventLogCreate).toHaveBeenCalledOnce()
  })

  it("returns the same 404 for an unknown, inactive, revoked or foreign link", async () => {
    const bodies: string[] = []
    m.findInvite.mockResolvedValueOnce(null)
    bodies.push(JSON.stringify(await (await callInvite("nope")).json()))
    m.findInvite.mockResolvedValueOnce(link("v1", { volunteer: { active: false } }))
    bodies.push(JSON.stringify(await (await callInvite()).json()))
    m.findRegistration.mockResolvedValueOnce(null)
    bodies.push(JSON.stringify(await (await callRegistration("gone")).json()))
    m.orgHeader.value = "org-b-slug"
    bodies.push(JSON.stringify(await (await callInvite()).json()))
    expect(new Set(bodies)).toEqual(new Set(['{"error":"Lien invalide"}']))
    expect(m.create).not.toHaveBeenCalled()
  })

  it("refuses a shift of another event like a foreign link", async () => {
    m.findShift.mockResolvedValue(shift({ eventId: "evt-2" }))
    const res = await callInvite()
    expect(res.status).toBe(404)
    expect(m.create).not.toHaveBeenCalled()
  })

  it("answers 403 org_unavailable for a closed or suspended organisation", async () => {
    m.findInvite.mockResolvedValue(link("v1", { event: { ...event, organization: { ...OPEN_ORG, active: false } } }))
    const closed = await callInvite()
    expect(closed.status).toBe(403)
    expect(await closed.json()).toMatchObject({ code: "org_unavailable" })
    m.findRegistration.mockResolvedValue(link("v2", { event: { ...event, organization: { ...OPEN_ORG, suspendedAt: new Date() } } }))
    expect((await callRegistration()).status).toBe(403)
    expect(m.create).not.toHaveBeenCalled()
  })

  it("answers clearly, without writing, for a cancelled, full, past or already held shift", async () => {
    const cases: [Record<string, unknown>, string][] = [
      [shift({ status: "cancelled" }), "cancelled"],
      [shift({ active: 3, registrations: [{ volunteerId: "other", status: "active" }, { volunteerId: "v1b", status: "active" }, { volunteerId: "v1c", status: "active" }] }), "full"],
      [{ ...shift(), date: new Date("2020-07-04T00:00:00Z") }, "past"],
      [shift({ registrations: [{ volunteerId: "v1", status: "active" }] }), "registered"],
    ]
    for (const [row, state] of cases) {
      m.findShift.mockResolvedValueOnce(row)
      const res = await callInvite()
      expect(res.status).toBe(200)
      expect(await res.json()).toMatchObject({ success: false, state })
    }
    expect(m.create).not.toHaveBeenCalled()
    expect(m.eventLogCreate).not.toHaveBeenCalled()
  })

  it("says a deleted shift no longer exists, without a server error", async () => {
    m.findShift.mockResolvedValue(null)
    const res = await callInvite()
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ success: false, state: "deleted", message: "Ce créneau n'existe plus." })
    expect(m.create).not.toHaveBeenCalled()
  })

  it("returns the existing answer when the same shift is submitted again", async () => {
    m.findDecline.mockResolvedValue({ declinedAt: new Date("2026-06-20T10:00:00Z") })
    const res = await callInvite()
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ success: true, already: true, state: "declined" })
    expect(m.create).not.toHaveBeenCalled()
    expect(m.eventLogCreate).not.toHaveBeenCalled()
  })

  it("refuses the 11th answer within an hour from one IP, before reading anything", async () => {
    const xff = "203.0.113.130"
    for (let i = 0; i < 10; i++) expect((await callInvite("tok", "shift-1", xff)).status).toBe(200)
    m.findInvite.mockClear()
    const res = await callInvite("tok", "shift-1", xff)
    expect(res.status).toBe(429)
    expect(m.findInvite).not.toHaveBeenCalled()
  })
})
