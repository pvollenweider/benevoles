import { describe, it, expect, vi, beforeEach } from "vitest"

// Change of mind (#558): registering from an invitation link clears a previous « pas disponible ».
const m = vi.hoisted(() => ({
  eventFindFirst: vi.fn(),
  shiftFindMany: vi.fn(),
  inviteUpdateMany: vi.fn(),
  txCreate: vi.fn(),
}))
vi.mock("@/lib/prisma", () => ({
  prisma: {
    eventQuestion: { findMany: vi.fn().mockResolvedValue([]) },
    event: { findFirst: m.eventFindFirst },
    shift: { findMany: m.shiftFindMany },
    volunteer: { findFirst: vi.fn().mockResolvedValue(null) },
    registration: { findMany: vi.fn().mockResolvedValue([]) },
    memberInvite: { findFirst: vi.fn().mockResolvedValue(null), updateMany: m.inviteUpdateMany },
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
vi.mock("next/headers", () => ({ headers: async () => new Headers() }))

const bar = { id: "s1", label: "Bar", roleName: "Bar", capacity: 5, minAge: null, waitlistEnabled: false, registrations: [], reservedTags: [], date: new Date("2030-06-01T00:00:00Z"), startTime: "10:00", endTime: "12:00" }
const post = (extra: Record<string, unknown> = {}) => new Request("http://localhost/api/public/registrations", {
  method: "POST",
  headers: { "Content-Type": "application/json", "x-forwarded-for": `t-${Math.random()}` },
  body: JSON.stringify({ eventId: "evt-1", shiftIds: ["s1"], firstName: "Léa", lastName: "M", email: "lea@x.ch", consent: true, ...extra }),
})

describe("POST /api/public/registrations — clears a previous decline (#558)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    m.eventFindFirst.mockResolvedValue({ id: "evt-1", organizationId: "org-a", title: "Fête", organization: { slug: "a", timeZone: null }, confirmationMessage: null })
    m.shiftFindMany.mockResolvedValue([bar])
    m.txCreate.mockResolvedValue({ id: "reg-1", shiftId: "s1", status: "active", waitingPosition: null })
    m.inviteUpdateMany.mockResolvedValue({ count: 1 })
  })

  it("marks the invite used and clears declinedAt when registering from the link", async () => {
    const { POST } = await import("@/app/api/public/registrations/route")
    const res = await POST(post({ inviteToken: "tok" }))
    expect(res.status).toBeLessThan(300)
    expect(m.inviteUpdateMany).toHaveBeenCalledTimes(2)
    const [usedCall, declineCall] = m.inviteUpdateMany.mock.calls
    expect(usedCall[0]).toMatchObject({ where: { eventId: "evt-1", usedAt: null }, data: { usedAt: expect.any(Date) } })
    expect(declineCall[0]).toMatchObject({ where: { eventId: "evt-1", declinedAt: { not: null } }, data: { declinedAt: null } })
  })

  it("touches no invite at all without a token", async () => {
    const { POST } = await import("@/app/api/public/registrations/route")
    const res = await POST(post())
    expect(res.status).toBeLessThan(300)
    expect(m.inviteUpdateMany).not.toHaveBeenCalled()
  })
})
