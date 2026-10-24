import { describe, it, expect, vi, beforeAll } from "vitest"
import { calendarFeedKey, calendarFeedLinkValid, parseCalendarFeedToken } from "@/lib/calendar-feed"

// The personal page's API gives the link's calendar subscription (#961): a read-only address of its
// own, never the personal token, tied to the link's current hash.
const SECRET = "k".repeat(48)
const findFirst = vi.hoisted(() => vi.fn())
const findMany = vi.hoisted(() => vi.fn())
vi.mock("@/lib/prisma", () => ({ prisma: { registration: { findFirst, findMany }, eventQuestion: { findMany: async () => [] } } }))
vi.mock("@/lib/urls", () => ({ orgBaseUrl: (slug: string) => `https://${slug}.example`, eventPublicUrl: (org: string, slug: string) => `https://${org}.example/${slug}` }))
vi.mock("@/lib/waitlist", () => ({ promoteNextInWaitlist: vi.fn() }))
vi.mock("@/lib/event-log", () => ({ logEvent: vi.fn() }))
vi.mock("@/lib/report-error", () => ({ reportError: () => () => {} }))
vi.mock("@/lib/withdrawal-notifications", () => ({ buildWithdrawalNotifications: vi.fn() }))
vi.mock("@/lib/notifications/outbox", () => ({ enqueueNotifications: vi.fn(), deliverAfterResponse: vi.fn() }))

const TOKEN = "personal-token-value-123"
const HASH = "c".repeat(64)

describe("GET /api/public/registrations/[token] — calendar subscription", () => {
  beforeAll(() => { process.env.AUTH_SECRET = SECRET })

  it("returns the https and webcal forms of a feed address that is not the personal link", async () => {
    findFirst.mockResolvedValue({
      id: "cmreg0000001", volunteerId: "v1", eventId: "e1", phone: null, editTokenHash: HASH,
      volunteer: { firstName: "A", lastName: "B", email: "a@x.com", phone: null },
      event: { id: "e1", title: "F", slug: "f", confirmationMessage: null, organization: { slug: "a" } },
    })
    findMany.mockResolvedValue([])
    const { GET } = await import("@/app/api/public/registrations/[token]/route")
    const res = await GET(new Request(`http://localhost/api/public/registrations/${TOKEN}`, { headers: { "x-forwarded-for": "9.9.9.9" } }), { params: Promise.resolve({ token: TOKEN }) })
    const { calendarFeed } = await res.json()
    expect(calendarFeed.https).toMatch(/^https:\/\/a\.example\/api\/public\/registrations\/cmreg0000001-1[0-9a-f]{48}\/calendar\.ics$/)
    expect(calendarFeed.webcal).toBe(calendarFeed.https.replace("https:", "webcal:"))
    expect(calendarFeed.https).not.toContain(TOKEN)
    const segment = calendarFeed.https.split("/registrations/")[1].split("/")[0]
    const parsed = parseCalendarFeedToken(segment, calendarFeedKey(SECRET))
    expect(parsed && calendarFeedLinkValid(parsed, HASH, calendarFeedKey(SECRET))).toBe(true)
  })
})
