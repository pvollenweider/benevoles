import { describe, it, expect, vi, beforeEach } from "vitest"

// The personal page (/my/<token>) shows the same phone as admins and sector leaders
// (contactPhone): the one given at sign-up, which for an already-known volunteer lives only on
// the registration (the profile isn't updated from an unverified public submission).

const findFirst = vi.hoisted(() => vi.fn())
const findMany = vi.hoisted(() => vi.fn())
vi.mock("@/lib/prisma", () => ({ prisma: { registration: { findFirst, findMany } } }))
vi.mock("@/lib/urls", () => ({ orgBaseUrl: (slug: string) => `https://${slug}.example` }))
vi.mock("@/lib/waitlist", () => ({ promoteNextInWaitlist: vi.fn() }))
vi.mock("@/lib/event-log", () => ({ logEvent: vi.fn() }))
vi.mock("@/lib/report-error", () => ({ reportError: () => () => {} }))

const get = (token: string) =>
  new Request(`http://localhost/api/public/registrations/${token}`, { headers: { "x-forwarded-for": `t-${Math.random()}` } })

const reg = (phone: string | null, profilePhone: string | null) => ({
  id: "r1", volunteerId: "v1", eventId: "e1", phone,
  volunteer: { firstName: "A", lastName: "B", email: "a@x.com", phone: profilePhone },
  event: { id: "e1", title: "F", slug: "f", confirmationMessage: null, organization: { slug: "a" } },
})

const sibling = (phone: string | null) => ({
  id: "r2", editToken: "t2", phone,
  shift: { id: "s2", label: "Bar", roleName: "Bar", date: new Date(), startTime: "10:00", endTime: "12:00" },
})

describe("GET /api/public/registrations/[token] — phone", () => {
  beforeEach(() => vi.clearAllMocks())

  async function phoneFor(r: ReturnType<typeof reg>, siblings: ReturnType<typeof sibling>[]) {
    findFirst.mockResolvedValue(r)
    findMany.mockResolvedValue(siblings)
    const { GET } = await import("@/app/api/public/registrations/[token]/route")
    const res = await GET(get("tok"), { params: Promise.resolve({ token: "tok" }) })
    expect(res.status).toBe(200)
    return (await res.json()).volunteer.phone
  }

  it("shows the phone given at sign-up when the profile has none", async () => {
    expect(await phoneFor(reg("079 222", null), [])).toBe("079 222")
  })

  it("prefers the registration's phone over an older profile one", async () => {
    expect(await phoneFor(reg("079 222", "079 000"), [])).toBe("079 222")
  })

  it("falls back to another registration of the event, then to the profile", async () => {
    expect(await phoneFor(reg(null, "079 000"), [sibling(null), sibling("079 333")])).toBe("079 333")
    expect(await phoneFor(reg(null, "079 000"), [sibling(null)])).toBe("079 000")
    expect(await phoneFor(reg(null, null), [])).toBe("")
  })
})
