import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

// Volunteer self-cancellation deadline (#946): saved from the event settings (days and hours, 0 or
// empty = until the start), given to the personal page per registration, and never limiting an
// admin's removal. The refusal itself is tested in volunteer-withdraw-api.test.ts.

const requireOrgSessionMock = vi.hoisted(() => vi.fn())
vi.mock("@/lib/auth-guard", () => ({ requireOrgSession: requireOrgSessionMock }))
const logEvent = vi.hoisted(() => vi.fn().mockResolvedValue("log-1"))
vi.mock("@/lib/event-log", () => ({ logEvent, adminActor: () => ({ type: "admin", id: "a" }), diffFields: (a: Record<string, unknown>, b: Record<string, unknown>, f: string[]) => {
  const out: Record<string, { from: unknown; to: unknown }> = {}
  for (const k of f) if (a[k] !== b[k]) out[k] = { from: a[k], to: b[k] }
  return Object.keys(out).length ? out : null
} }))
const prismaMock = vi.hoisted(() => ({ registration: { findFirst: vi.fn(), findMany: vi.fn() }, eventQuestion: { findMany: async () => [] } }))
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }))
vi.mock("@/lib/urls", () => ({ orgBaseUrl: (slug: string) => `https://${slug}.example`, eventPublicUrl: (org: string, slug: string) => `https://${org}.example/${slug}` }))
vi.mock("@/lib/waitlist", () => ({ promoteNextInWaitlist: vi.fn() }))
vi.mock("@/lib/report-error", () => ({ reportError: () => () => {} }))
vi.mock("@/lib/withdrawal-notifications", () => ({ queueWithdrawalNotifications: vi.fn() }))
vi.mock("@/lib/notifications/outbox", () => ({ enqueueNotifications: vi.fn(), deliverAfterResponse: vi.fn() }))
const cancelRegistrations = vi.hoisted(() => vi.fn())
vi.mock("@/lib/admin-registration-actions", () => ({ cancelRegistrations }))

describe("PATCH /api/admin/events/[id] — self-cancellation deadline", () => {
  const update = vi.fn()
  const patch = (body: unknown) =>
    new Request("http://localhost/api/admin/events/evt-a", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
  const params = { params: Promise.resolve({ id: "evt-a" }) }
  const owned = { id: "evt-a", title: "F", publicStatus: "draft", isListed: true, startDate: new Date(0), endDate: new Date(0), publicInstructions: null, remindersEnabled: true, requirePhone: false, cancelDeadlineDays: null, cancelDeadlineHours: null }

  beforeEach(() => {
    vi.clearAllMocks()
    update.mockImplementation(async ({ data }: { data: object }) => ({ ...owned, ...data }))
    requireOrgSessionMock.mockResolvedValue({ db: { event: { findFirst: vi.fn().mockResolvedValue(owned), update } }, organizationId: "org-a", session: {} })
  })

  it("saves days and hours, and logs the change", async () => {
    const { PATCH } = await import("@/app/api/admin/events/[id]/route")
    expect((await PATCH(patch({ cancelDeadlineDays: 2, cancelDeadlineHours: 6 }), params)).status).toBe(200)
    expect(update.mock.calls[0][0].data).toEqual({ cancelDeadlineDays: 2, cancelDeadlineHours: 6 })
    expect(logEvent.mock.calls[0][0].changes).toEqual({ cancelDeadlineDays: { from: null, to: 2 }, cancelDeadlineHours: { from: null, to: 6 } })
  })

  it("stores 0 as null: « until the start » has one representation", async () => {
    const { PATCH } = await import("@/app/api/admin/events/[id]/route")
    await PATCH(patch({ cancelDeadlineDays: 0, cancelDeadlineHours: null }), params)
    expect(update.mock.calls[0][0].data).toEqual({ cancelDeadlineDays: null, cancelDeadlineHours: null })
  })

  it("leaves the setting alone when the body does not carry it", async () => {
    const { PATCH } = await import("@/app/api/admin/events/[id]/route")
    await PATCH(patch({ title: "G" }), params)
    expect(update.mock.calls[0][0].data).not.toHaveProperty("cancelDeadlineDays")
  })

  it.each([
    [{ cancelDeadlineDays: -1 }],
    [{ cancelDeadlineDays: 61 }],
    [{ cancelDeadlineDays: 1.5 }],
    [{ cancelDeadlineHours: 24 }],
    [{ cancelDeadlineHours: "3" }],
  ])("refuses %j", async (body) => {
    const { PATCH } = await import("@/app/api/admin/events/[id]/route")
    expect((await PATCH(patch(body), params)).status).toBe(400)
    expect(update).not.toHaveBeenCalled()
  })
})

describe("POST /api/admin/events — self-cancellation deadline", () => {
  it("stores it at creation", async () => {
    const create = vi.fn(async ({ data }: { data: object }) => ({ id: "evt-new", ...data }))
    requireOrgSessionMock.mockResolvedValue({ db: { event: { findFirst: vi.fn().mockResolvedValue(null), create } }, organizationId: "org-a", session: {} })
    const { POST } = await import("@/app/api/admin/events/route")
    const res = await POST(new Request("http://localhost/api/admin/events", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Fête", startDate: "2031-06-06", endDate: "2031-06-06", cancelDeadlineDays: null, cancelDeadlineHours: 12 }),
    }))
    expect(res.status).toBe(201)
    expect(create.mock.calls[0][0].data).toMatchObject({ cancelDeadlineDays: null, cancelDeadlineHours: 12 })
  })
})

describe("GET /api/public/registrations/[token] — selfCancel", () => {
  const get = () => new Request("http://localhost/api/public/registrations/tok", { headers: { "x-forwarded-for": `t-${Math.random()}` } })
  const event = (over: Record<string, unknown> = {}) => ({
    id: "e1", title: "Fête", slug: "fete", confirmationMessage: null, publicStatus: "published",
    location: null, latitude: null, longitude: null, publicInstructions: null, dayContactName: null, dayContactPhone: null,
    cancelDeadlineDays: 2, cancelDeadlineHours: null,
    pages: [], sectorLeaders: [],
    organization: { slug: "org", timeZone: "Europe/Zurich", replyToEmail: "orga@example.org" },
    ...over,
  })
  // Saturday 6 June 2026, 10:00 to 12:00 in Zurich (08:00 UTC).
  const reg = (id: string, status: string, shift: Record<string, unknown> = {}) => ({
    id, status, editTokenLegacy: `t-${id}`, editTokenEnc: null, phone: null, waitingPosition: null, waitingExpiresAt: null, linkEmailedAt: null,
    shift: { id: `s-${id}`, label: "Bar", roleName: "Bar", date: new Date("2026-06-06T00:00:00Z"), startTime: "10:00", endTime: "12:00", locationDetails: null, contactName: null, contactPhone: null, instructions: null, latitude: null, longitude: null, ...shift },
  })

  async function load(ev: ReturnType<typeof event>, regs: ReturnType<typeof reg>[]) {
    prismaMock.registration.findFirst.mockResolvedValue({
      id: regs[0].id, volunteerId: "v1", eventId: "e1", phone: null,
      volunteer: { firstName: "A", lastName: "B", email: "a@x.com", phone: null, availabilityPeriods: [], availabilityNote: null },
      event: ev,
    })
    prismaMock.registration.findMany.mockResolvedValue(regs)
    const { GET } = await import("@/app/api/public/registrations/[token]/route")
    const res = await GET(get(), { params: Promise.resolve({ token: "tok" }) })
    expect(res.status).toBe(200)
    return res.json()
  }

  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers({ toFake: ["Date"] })
  })
  afterEach(() => vi.useRealTimers())

  it("gives the earlier deadline of a confirmed place while it is ahead, none to a waitlist entry", async () => {
    vi.setSystemTime(new Date("2026-06-01T08:00:00Z"))
    const data = await load(event(), [reg("r1", "active"), reg("r2", "waiting")])
    const byId = Object.fromEntries(data.registrations.map((r: { id: string; selfCancel: object }) => [r.id, r.selfCancel]))
    // Two days before 10:00 on 6 June, in Zurich: 10:00 on 4 June = 08:00 UTC.
    expect(byId.r1).toEqual({ allowed: true, deadline: "2026-06-04T08:00:00.000Z" })
    expect(byId.r2).toEqual({ allowed: true, deadline: null })
    expect(prismaMock.registration.findFirst.mock.calls[0][0].include.event.select).toMatchObject({ cancelDeadlineDays: true, cancelDeadlineHours: true })
  })

  it("closes a confirmed place past the deadline, and every registration once the shift has started", async () => {
    vi.setSystemTime(new Date("2026-06-05T08:00:00Z"))
    let data = await load(event(), [reg("r1", "active"), reg("r2", "requested")])
    expect(data.registrations.map((r: { selfCancel: object }) => r.selfCancel)).toEqual([{ allowed: false, reason: "deadline" }, { allowed: true, deadline: null }])

    vi.setSystemTime(new Date("2026-06-06T09:00:00Z"))
    data = await load(event({ cancelDeadlineDays: null }), [reg("r1", "active"), reg("r2", "waiting")])
    expect(data.registrations.map((r: { selfCancel: object }) => r.selfCancel)).toEqual([{ allowed: false, reason: "started" }, { allowed: false, reason: "started" }])
  })
})

describe("DELETE /api/admin/registrations/[id] — admin removal is never limited (#946)", () => {
  afterEach(() => vi.useRealTimers())

  it("removes a registration of a shift that has started, past any deadline", async () => {
    vi.useFakeTimers({ toFake: ["Date"] })
    vi.setSystemTime(new Date("2026-06-06T09:00:00Z"))
    const owned = { id: "r1", eventId: "e1", shiftId: "s1", status: "active" }
    requireOrgSessionMock.mockResolvedValue({ db: { registration: { findFirst: vi.fn().mockResolvedValue(owned) } }, organizationId: "org-a", session: {} })
    const { DELETE } = await import("@/app/api/admin/registrations/[id]/route")
    const res = await DELETE(new Request("http://localhost/api/admin/registrations/r1", { method: "DELETE" }), { params: Promise.resolve({ id: "r1" }) })
    expect(res.status).toBe(200)
    expect(cancelRegistrations).toHaveBeenCalledWith(expect.anything(), expect.anything(), [owned])
  })
})
