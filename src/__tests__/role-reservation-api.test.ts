import { describe, it, expect, vi, beforeEach } from "vitest"

// Reserved roles (#470): enforced at sign-up from the member invitation only.
const m = vi.hoisted(() => ({
  eventFindFirst: vi.fn(),
  shiftFindMany: vi.fn(),
  inviteFindFirst: vi.fn(),
  inviteFindUnique: vi.fn(),
  txCreate: vi.fn(),
}))
vi.mock("@/lib/prisma", () => ({
  prisma: {
    eventQuestion: { findMany: vi.fn().mockResolvedValue([]) }, // no custom question (#483)
    event: { findFirst: m.eventFindFirst },
    shift: { findMany: m.shiftFindMany },
    volunteer: { findFirst: vi.fn().mockResolvedValue(null) },
    registration: { findMany: vi.fn().mockResolvedValue([]) },
    memberInvite: { findFirst: m.inviteFindFirst, findUnique: m.inviteFindUnique, updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
    $transaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn({
      $queryRaw: vi.fn(),
      shift: { findMany: vi.fn().mockResolvedValue([]) },
      volunteer: { createMany: vi.fn().mockResolvedValue({ count: 1 }), findFirstOrThrow: vi.fn().mockResolvedValue({ id: "vol-1" }) },
      registration: { findMany: vi.fn().mockResolvedValue([]), count: vi.fn().mockResolvedValue(0), aggregate: vi.fn().mockResolvedValue({ _max: { waitingPosition: null } }), create: m.txCreate },
    })),
  },
}))
vi.mock("@/lib/notification-helpers", () => ({ sendConfirmationEmail: vi.fn(), sendAdminNotification: vi.fn() }))
vi.mock("@/lib/notifications", () => ({ sendNotification: vi.fn() }))
vi.mock("@/lib/notifications/outbox", () => ({ collectNotifications: () => ({ send: vi.fn(), payloads: [] }), enqueueNotifications: vi.fn().mockResolvedValue([]), deliverAfterResponse: vi.fn() }))
vi.mock("@/lib/sector-leaders", () => ({ notifySectorLeadersOfSignup: vi.fn() }))
vi.mock("@/lib/event-log", () => ({ logEvent: vi.fn() }))
// No organization header, as on localhost: the member-invite route then relies on the slug check.
vi.mock("next/headers", () => ({ headers: async () => new Headers() }))

const security = { id: "s1", label: "Sécurité", roleName: "Sécurité", capacity: 5, minAge: null, waitlistEnabled: false, registrations: [], reservedTags: ["sécurité"], date: new Date("2030-06-01T00:00:00Z"), startTime: "10:00", endTime: "12:00" }
const post = (extra: Record<string, unknown> = {}) => new Request("http://localhost/api/public/registrations", {
  method: "POST",
  headers: { "Content-Type": "application/json", "x-forwarded-for": `t-${Math.random()}` },
  body: JSON.stringify({ eventId: "evt-1", shiftIds: ["s1"], firstName: "Léa", lastName: "M", email: "lea@x.ch", consent: true, ...extra }),
})
const invite = (tags: string[], email = "Lea@x.ch", active = true) => ({ volunteer: { email, tags, active } })

describe("public sign-up to a reserved role", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    m.eventFindFirst.mockResolvedValue({ id: "evt-1", organizationId: "org-a", title: "Fête", organization: { slug: "a", timeZone: null }, confirmationMessage: null })
    m.shiftFindMany.mockResolvedValue([security])
    m.txCreate.mockResolvedValue({ id: "reg-1", shiftId: "s1", status: "active", waitingPosition: null })
  })

  it("is refused without an invitation, even by a direct API call", async () => {
    const { POST } = await import("@/app/api/public/registrations/route")
    const res = await POST(post())
    expect(res.status).toBe(403)
    expect(await res.json()).toMatchObject({ reservedRole: "Sécurité", error: expect.stringContaining("réservé aux membres invités") })
    expect(m.txCreate).not.toHaveBeenCalled()
  })

  it("is refused with the invitation of a member lacking the tag (also when it was removed after sending)", async () => {
    m.inviteFindFirst.mockResolvedValue(invite(["bar"]))
    const { POST } = await import("@/app/api/public/registrations/route")
    const res = await POST(post({ inviteToken: "tok" }))
    expect(res.status).toBe(403)
    expect((await res.json()).error).toMatch(/votre invitation n'y donne pas accès/)
    expect(m.txCreate).not.toHaveBeenCalled()
  })

  it("is refused when the invitation belongs to someone else's email", async () => {
    m.inviteFindFirst.mockResolvedValue(invite(["sécurité"], "other@x.ch"))
    const { POST } = await import("@/app/api/public/registrations/route")
    expect((await POST(post({ inviteToken: "tok" }))).status).toBe(403)
    expect(m.txCreate).not.toHaveBeenCalled()
  })

  it("is accepted with the invitation of a member carrying the tag", async () => {
    m.inviteFindFirst.mockResolvedValue(invite(["Sécurité"]))
    const { POST } = await import("@/app/api/public/registrations/route")
    const res = await POST(post({ inviteToken: "tok" }))
    expect(res.status).toBeLessThan(300)
    expect(m.txCreate).toHaveBeenCalledOnce()
    expect(m.inviteFindFirst.mock.calls[0][0].where.eventId).toBe("evt-1")
  })
})

describe("GET /api/public/member-invite/[token]", () => {
  it("says which reserved roles the invitation opens, never the member's tags", async () => {
    m.inviteFindUnique.mockResolvedValue({
      volunteer: { id: "v", firstName: "Léa", lastName: "M", email: "lea@x.ch", phone: null, active: true, tags: ["sécurité", "privé"] },
      event: { slug: "fete", organizationId: "org-a", shifts: [{ roleName: "Sécurité", reservedTags: ["sécurité"] }, { roleName: "Loge", reservedTags: ["artistes"] }, { roleName: "Bar", reservedTags: [] }] },
    })
    const { GET } = await import("@/app/api/public/member-invite/[token]/route")
    const res = await GET(new Request("http://localhost/api/public/member-invite/tok?slug=fete"), { params: Promise.resolve({ token: "tok" }) })
    const body = await res.json()
    expect(body.reservedRolesAllowed).toEqual(["Sécurité"])
    expect(JSON.stringify(body)).not.toMatch(/privé|artistes/)
  })
})
