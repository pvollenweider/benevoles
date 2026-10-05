import { describe, it, expect, vi, beforeEach } from "vitest"

// Day-of contact of an event (#560): saved from the event settings, shown to registered
// volunteers on their personal page (only for a confirmed shift without a contact of its own),
// never in a public payload.

const requireOrgSessionMock = vi.hoisted(() => vi.fn())
vi.mock("@/lib/auth-guard", () => ({ requireOrgSession: requireOrgSessionMock }))
const logEvent = vi.hoisted(() => vi.fn().mockResolvedValue("log-1"))
vi.mock("@/lib/event-log", () => ({ logEvent, adminActor: () => ({ type: "admin", id: "a" }), diffFields: (a: Record<string, unknown>, b: Record<string, unknown>, f: string[]) => {
  const out: Record<string, { from: unknown; to: unknown }> = {}
  for (const k of f) if (a[k] !== b[k]) out[k] = { from: a[k], to: b[k] }
  return Object.keys(out).length ? out : null
} }))
const getHeader = vi.hoisted(() => vi.fn())
vi.mock("next/headers", () => ({ headers: () => Promise.resolve({ get: getHeader }) }))
const prismaMock = vi.hoisted(() => ({
  event: { findMany: vi.fn(), findFirst: vi.fn() },
  registration: { findFirst: vi.fn(), findMany: vi.fn() },
}))
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }))
vi.mock("@/lib/urls", () => ({ orgBaseUrl: (slug: string) => `https://${slug}.example` }))
vi.mock("@/lib/waitlist", () => ({ promoteNextInWaitlist: vi.fn() }))
vi.mock("@/lib/report-error", () => ({ reportError: () => () => {} }))
vi.mock("@/lib/withdrawal-notifications", () => ({ buildWithdrawalNotifications: vi.fn() }))
vi.mock("@/lib/notifications/outbox", () => ({ enqueueNotifications: vi.fn(), deliverAfterResponse: vi.fn() }))

const PHONE = "079 111 11 11"
const NAME = "Coordination Marc"

describe("PATCH /api/admin/events/[id] — day-of contact", () => {
  const update = vi.fn()
  const patch = (body: unknown) =>
    new Request("http://localhost/api/admin/events/evt-a", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
  const params = { params: Promise.resolve({ id: "evt-a" }) }
  const owned = { id: "evt-a", title: "F", publicStatus: "draft", isListed: true, startDate: new Date(0), endDate: new Date(0), publicInstructions: null, remindersEnabled: true, requirePhone: false }

  beforeEach(() => {
    vi.clearAllMocks()
    update.mockImplementation(async ({ data }: { data: object }) => ({ ...owned, ...data }))
    requireOrgSessionMock.mockResolvedValue({ db: { event: { findFirst: vi.fn().mockResolvedValue(owned), update } }, organizationId: "org-a", session: {} })
  })

  it("saves the name and phone trimmed, a blank value as null, and keeps them out of the event log", async () => {
    const { PATCH } = await import("@/app/api/admin/events/[id]/route")
    expect((await PATCH(patch({ dayContactName: ` ${NAME} `, dayContactPhone: PHONE }), params)).status).toBe(200)
    expect(update.mock.calls[0][0].data).toEqual({ dayContactName: NAME, dayContactPhone: PHONE })
    expect(logEvent).not.toHaveBeenCalled()

    expect((await PATCH(patch({ dayContactName: "  ", dayContactPhone: null }), params)).status).toBe(200)
    expect(update.mock.calls[1][0].data).toEqual({ dayContactName: null, dayContactPhone: null })
  })

  it("leaves the contact alone when the body does not carry it, and refuses an overlong value", async () => {
    const { PATCH } = await import("@/app/api/admin/events/[id]/route")
    await PATCH(patch({ title: "G" }), params)
    expect(update.mock.calls[0][0].data).not.toHaveProperty("dayContactPhone")
    expect((await PATCH(patch({ dayContactPhone: "1".repeat(41) }), params)).status).toBe(400)
    expect((await PATCH(patch({ dayContactName: "a".repeat(81) }), params)).status).toBe(400)
    expect(update).toHaveBeenCalledTimes(1)
  })
})

describe("POST /api/admin/events — day-of contact", () => {
  it("stores it at creation", async () => {
    const create = vi.fn(async ({ data }: { data: object }) => ({ id: "evt-new", ...data }))
    requireOrgSessionMock.mockResolvedValue({ db: { event: { findFirst: vi.fn().mockResolvedValue(null), create } }, organizationId: "org-a", session: {} })
    const { POST } = await import("@/app/api/admin/events/route")
    const res = await POST(new Request("http://localhost/api/admin/events", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Fête", startDate: "2031-06-06", endDate: "2031-06-06", dayContactName: NAME, dayContactPhone: ` ${PHONE}` }),
    }))
    expect(res.status).toBe(201)
    expect(create.mock.calls[0][0].data).toMatchObject({ dayContactName: NAME, dayContactPhone: PHONE })
  })
})

const shiftRow = (over: Record<string, unknown> = {}) => ({
  id: "s1", roleName: "Bar", label: "Bar", description: null, date: new Date("2031-06-06T00:00:00Z"), startTime: "10:00", endTime: "12:00",
  capacity: 2, status: "open", locationDetails: null, contactName: null, contactPhone: null, instructions: null, latitude: null, longitude: null,
  displayOrder: 0, waitlistEnabled: false, requiresApproval: false, minAge: null, colorKey: null, maxPerVolunteer: null, reservedTags: [], registrations: [],
  ...over,
})
const eventRow = {
  sectorLeaders: [{ roleName: "Bar", name: "Paul Martin", email: "paul@leader.example" }],
  id: "e1", organizationId: "org-a", slug: "fete", title: "Fête", description: "Au village", location: "Salle communale", startDate: new Date(), endDate: new Date(),
  publicStatus: "published", isListed: true, publicInstructions: "Entrée par la cour", confirmationMessage: null, requirePhone: false, showSchedule: [],
  registrationsOpen: true, registrationOpensAt: null, registrationClosesAt: null, accentColorKey: null, latitude: 46.2, longitude: 6.1,
  dayContactName: NAME, dayContactPhone: PHONE,
  organization: { name: "Org", slug: "org", timeZone: "Europe/Zurich", volunteerCharter: null },
  pages: [], questions: [], shifts: [shiftRow()],
}

describe("public payloads never carry the day-of contact", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getHeader.mockImplementation((n: string) => (n === "x-org-slug" ? "org" : null))
  })

  it("GET /api/public/[eventSlug]", async () => {
    prismaMock.event.findFirst.mockResolvedValue(eventRow)
    const { GET } = await import("@/app/api/public/[eventSlug]/route")
    const res = await GET(new Request("http://localhost/api/public/fete"), { params: Promise.resolve({ eventSlug: "fete" }) })
    expect(res.status).toBe(200)
    const text = await res.text()
    expect(text).toContain("Salle communale")
    expect(text).not.toContain(PHONE)
    expect(text).not.toContain(NAME)
    expect(text).not.toContain("Paul Martin")
    expect(text).not.toContain("paul@leader.example")
  })

  it("GET /api/public/events", async () => {
    prismaMock.event.findMany.mockResolvedValue([eventRow])
    const { GET } = await import("@/app/api/public/events/route")
    const res = await GET(new Request("http://localhost/api/public/events"))
    const text = await res.text()
    expect(text).toContain("Fête")
    expect(text).not.toContain(PHONE)
    expect(text).not.toContain(NAME)
  })
})

describe("GET /api/public/registrations/[token] — « Avant ta mission »", () => {
  const get = () => new Request("http://localhost/api/public/registrations/tok", { headers: { "x-forwarded-for": `t-${Math.random()}` } })
  const personalEvent = (over: Record<string, unknown> = {}) => ({
    id: "e1", title: "Fête", slug: "fete", confirmationMessage: null, publicStatus: "published",
    location: "Salle communale", latitude: 46.2, longitude: 6.1, publicInstructions: "Entrée par la cour",
    dayContactName: NAME, dayContactPhone: PHONE,
    pages: [{ slug: "acces", title: "Accès" }, { slug: "faq", title: "FAQ" }],
    // Only roleName and name are selected; the email here checks that nothing else is passed on.
    sectorLeaders: [{ roleName: "Bar", name: "Paul Martin", email: "paul@leader.example" }],
    organization: { slug: "org", timeZone: "Europe/Zurich", replyToEmail: "orga@example.org" },
    ...over,
  })
  const reg = (id: string, status: string, shift: Record<string, unknown>) => ({
    id, status, editTokenLegacy: `t-${id}`, editTokenEnc: null, phone: null, waitingPosition: null, waitingExpiresAt: null, linkEmailedAt: null,
    shift: { id: `s-${id}`, label: "Bar", roleName: "Bar", date: new Date("2031-06-06T00:00:00Z"), startTime: "10:00", endTime: "12:00", locationDetails: null, contactName: null, contactPhone: null, instructions: null, latitude: null, longitude: null, ...shift },
  })

  async function load(event: ReturnType<typeof personalEvent>, regs: ReturnType<typeof reg>[]) {
    prismaMock.registration.findFirst.mockResolvedValue({
      id: regs[0].id, volunteerId: "v1", eventId: "e1", phone: null,
      volunteer: { firstName: "A", lastName: "B", email: "a@x.com", phone: null, availabilityPeriods: [], availabilityNote: null },
      event,
    })
    prismaMock.registration.findMany.mockResolvedValue(regs)
    const { GET } = await import("@/app/api/public/registrations/[token]/route")
    const res = await GET(get(), { params: Promise.resolve({ token: "tok" }) })
    expect(res.status).toBe(200)
    return res.json()
  }

  beforeEach(() => vi.clearAllMocks())

  it("gives the event's place, instructions and information pages, and the day-of contact to a confirmed shift without one", async () => {
    const data = await load(personalEvent(), [
      reg("r1", "active", {}),
      reg("r2", "active", { contactName: "Léa", contactPhone: "079 000 00 00" }),
      reg("r3", "waiting", {}),
      reg("r4", "requested", {}),
    ])
    expect(data.event).toMatchObject({
      location: "Salle communale", latitude: 46.2, longitude: 6.1, publicInstructions: "Entrée par la cour",
      pages: [{ title: "Accès", url: "https://org.example/fete/acces" }, { title: "FAQ", url: "https://org.example/fete/faq" }],
    })
    expect(data.event).not.toHaveProperty("dayContactPhone")
    const byId = Object.fromEntries(data.registrations.map((r: { id: string; shift: object }) => [r.id, r.shift]))
    expect(byId.r1).toMatchObject({ dayContactName: NAME, dayContactPhone: PHONE })
    expect(byId.r2).toMatchObject({ contactName: "Léa" })
    expect(byId.r2).not.toHaveProperty("dayContactPhone")
    expect(byId.r3).not.toHaveProperty("dayContactPhone")
    expect(byId.r4).not.toHaveProperty("dayContactPhone")
    // Sector leaders (#560): named to confirmed volunteers of the role only, never their email.
    expect(byId.r1.sectorLeaderNames).toEqual(["Paul Martin"])
    expect(byId.r2.sectorLeaderNames).toEqual(["Paul Martin"])
    expect(byId.r3).not.toHaveProperty("sectorLeaderNames")
    expect(byId.r4).not.toHaveProperty("sectorLeaderNames")
    expect(JSON.stringify(data)).not.toContain("paul@leader.example")
    expect(prismaMock.registration.findFirst.mock.calls[0][0].include.event.select.sectorLeaders).toEqual({ select: { roleName: true, name: true } })
  })

  it("names no leader for a shift of another role", async () => {
    const data = await load(personalEvent(), [reg("r1", "active", { roleName: "Accueil", label: "Accueil" })])
    expect(data.registrations[0].shift).not.toHaveProperty("sectorLeaderNames")
  })

  it("links no information page while the event is not published", async () => {
    const data = await load(personalEvent({ publicStatus: "draft" }), [reg("r1", "active", {})])
    expect(data.event.pages).toEqual([])
  })

  it("without a day-of contact, a shift without contact stays without", async () => {
    const data = await load(personalEvent({ dayContactName: null, dayContactPhone: " " }), [reg("r1", "active", {})])
    expect(data.registrations[0].shift).not.toHaveProperty("dayContactPhone")
    expect(JSON.stringify(data)).not.toContain(NAME)
  })
})
