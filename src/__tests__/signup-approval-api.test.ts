import { describe, it, expect, vi, beforeEach } from "vitest"

// Sign-up approval (#484): on a « Sur validation » shift, the public sign-up is a request.
const m = vi.hoisted(() => ({
  txCreate: vi.fn(),
  regFindMany: vi.fn().mockResolvedValue([]),
  txRegFindMany: vi.fn().mockResolvedValue([]),
  payloads: [] as { kind: string; data: Record<string, unknown> }[],
  logEvent: vi.fn(),
  leaders: vi.fn(),
  confirmation: vi.fn(),
}))

vi.mock("@/lib/prisma", () => ({
  prisma: {
    eventQuestion: { findMany: vi.fn().mockResolvedValue([]) },
    event: { findFirst: vi.fn().mockResolvedValue({ id: "evt-1", organizationId: "org-a", title: "Fête", organization: { slug: "a", timeZone: null }, confirmationMessage: "Merci !" }) },
    shift: { findMany: vi.fn().mockResolvedValue([{ id: "s1", label: "Chauffeur navette", roleName: "Chauffeur", capacity: 1, minAge: null, waitlistEnabled: true, requiresApproval: true, registrations: [], date: new Date("2030-06-01T00:00:00Z"), startTime: "08:00", endTime: "12:00" }]) },
    volunteer: { findFirst: vi.fn().mockResolvedValue({ id: "vol-1" }) },
    registration: { findMany: m.regFindMany },
    memberInvite: { findFirst: vi.fn() },
    $transaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn({
      $queryRaw: vi.fn(),
      shift: { findMany: vi.fn().mockResolvedValue([]) },
      volunteer: { createMany: vi.fn(), findFirstOrThrow: vi.fn() },
      registration: {
        findMany: m.txRegFindMany,
        count: vi.fn().mockResolvedValue(0),
        aggregate: vi.fn().mockResolvedValue({ _max: { waitingPosition: null } }),
        create: m.txCreate,
      },
    })),
  },
}))
vi.mock("@/lib/notification-helpers", () => ({ sendConfirmationEmail: m.confirmation, sendAdminNotification: vi.fn() }))
vi.mock("@/lib/notifications", () => ({ sendNotification: vi.fn() }))
vi.mock("@/lib/notifications/outbox", () => ({
  collectNotifications: () => ({ payloads: m.payloads, send: async (p: { kind: string; data: Record<string, unknown> }) => { m.payloads.push(p); return { ok: true } } }),
  enqueueNotifications: vi.fn().mockResolvedValue([]),
  deliverAfterResponse: vi.fn(),
}))
vi.mock("@/lib/sector-leaders", () => ({ notifySectorLeadersOfSignup: m.leaders }))
vi.mock("@/lib/event-log", () => ({ logEvent: m.logEvent }))

function post() {
  return new Request("http://localhost/api/public/registrations", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-forwarded-for": `test-${Math.random()}` },
    body: JSON.stringify({ eventId: "evt-1", shiftIds: ["s1"], firstName: "Marc", lastName: "D", email: "marc@x.ch", consent: true }),
  })
}

describe("public sign-up on a « Sur validation » shift", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    m.payloads.length = 0
    m.txCreate.mockImplementation(async ({ data }: { data: { shiftId: string; status: string } }) => ({ id: "reg-1", shiftId: data.shiftId, status: data.status, waitingPosition: null }))
  })

  it("creates a request, emails « demande reçue » (not a confirmation), leaders told only on acceptance", async () => {
    const { POST } = await import("@/app/api/public/registrations/route")
    const res = await POST(post())
    expect(res.status).toBe(201)
    expect(m.txCreate.mock.calls[0][0].data.status).toBe("requested")
    expect(m.payloads.map((p) => p.kind)).toEqual(["registration_requested"])
    expect(m.confirmation).not.toHaveBeenCalled()
    expect(m.leaders).not.toHaveBeenCalled()
    expect(m.logEvent.mock.calls[0][0].action).toBe("registration.requested")
    expect(await res.json()).toMatchObject({ requestedShifts: 1, activeShifts: 0, onWaitlist: false, confirmationMessage: null })
  })

  it("a pending request counts for the overlap checks, before and under the lock", async () => {
    const { POST } = await import("@/app/api/public/registrations/route")
    await POST(post())
    const overlapQuery = m.regFindMany.mock.calls.find((c) => c[0].include?.shift)
    expect(overlapQuery?.[0].where.status).toEqual({ in: ["active", "requested"] })
    expect(m.txRegFindMany.mock.calls[0][0].where.status).toEqual({ in: ["active", "requested"] })
  })
})
