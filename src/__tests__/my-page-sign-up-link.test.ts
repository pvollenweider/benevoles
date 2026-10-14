import { describe, it, expect, vi, beforeEach } from "vitest"

// « S'inscrire à d'autres créneaux » on the personal page (#988): the API sends the sign-up URL
// while a sign-up is possible, with the organisation (`?org=` locally) and the volunteer's group
// link, and the event page's URL while it is published.

const findFirst = vi.hoisted(() => vi.fn())
const findMany = vi.hoisted(() => vi.fn())
vi.mock("@/lib/prisma", () => ({ prisma: { registration: { findFirst, findMany } } }))
vi.mock("@/lib/urls", () => ({
  orgBaseUrl: () => "http://localhost:3000",
  eventPublicUrl: (org: string, slug: string) => `http://localhost:3000/${slug}?org=${org}`,
}))
vi.mock("@/lib/waitlist", () => ({ promoteNextInWaitlist: vi.fn() }))
vi.mock("@/lib/event-log", () => ({ logEvent: vi.fn() }))
vi.mock("@/lib/report-error", () => ({ reportError: () => () => {} }))
vi.mock("@/lib/withdrawal-notifications", () => ({ buildWithdrawalNotifications: vi.fn() }))
vi.mock("@/lib/notifications/outbox", () => ({ enqueueNotifications: vi.fn(), deliverAfterResponse: vi.fn() }))

const get = () =>
  new Request("http://localhost/api/public/registrations/tok", { headers: { "x-forwarded-for": `s-${Math.random()}` } })

const shift = { id: "s1", label: "Bar", roleName: "Bar", date: new Date("2099-07-04T00:00:00Z"), startTime: "10:00", endTime: "12:00" }

function stub(event: Record<string, unknown>, groupLink: { code: string } | null = null) {
  findFirst.mockResolvedValue({
    id: "r1", volunteerId: "v1", eventId: "e1", phone: null, status: "active",
    volunteer: { firstName: "A", lastName: "B", email: "a@x.com", phone: null },
    event: {
      id: "e1", title: "Fête", slug: "fete", confirmationMessage: null, pages: [], sectorLeaders: [],
      publicStatus: "published", registrationsOpen: true, registrationOpensAt: null, registrationClosesAt: null,
      endDate: new Date("2099-07-04T00:00:00Z"),
      organization: { slug: "asso-a", timeZone: "Europe/Zurich", replyToEmail: null },
      ...event,
    },
  })
  findMany.mockResolvedValue([
    { id: "r1", editTokenLegacy: "tok", editTokenEnc: null, phone: null, status: "active", createdAt: new Date("2026-06-01"), groupLink, shift },
  ])
}

async function body() {
  const { GET } = await import("@/app/api/public/registrations/[token]/route")
  const res = await GET(get(), { params: Promise.resolve({ token: "tok" }) })
  expect(res.status).toBe(200)
  return res.json()
}

describe("GET /api/public/registrations/[token] — sign up for more shifts", () => {
  beforeEach(() => vi.clearAllMocks())

  it("sends the sign-up URL with the organisation while sign-ups are open", async () => {
    stub({})
    const b = await body()
    expect(b.signUpUrl).toBe("http://localhost:3000/fete?org=asso-a")
    expect(b.eventPageUrl).toBe("http://localhost:3000/fete?org=asso-a")
    expect(findMany.mock.calls[0][0].include.groupLink).toEqual({ select: { code: true } })
  })

  it("keeps the group link the volunteer came through", async () => {
    stub({}, { code: "abcd2345" })
    expect((await body()).signUpUrl).toBe("http://localhost:3000/fete?org=asso-a&groupe=abcd2345")
  })

  it("no sign-up URL when sign-ups are closed; the event page stays", async () => {
    stub({ registrationsOpen: false })
    const b = await body()
    expect(b.signUpUrl).toBeNull()
    expect(b.eventPageUrl).toBe("http://localhost:3000/fete?org=asso-a")
  })

  it("neither once the event is archived (its page answers 404)", async () => {
    stub({ publicStatus: "archived" })
    const b = await body()
    expect(b.signUpUrl).toBeNull()
    expect(b.eventPageUrl).toBeNull()
  })

  it("no sign-up URL once the event is over", async () => {
    stub({ endDate: new Date("2020-07-04T00:00:00Z") })
    expect((await body()).signUpUrl).toBeNull()
  })
})
