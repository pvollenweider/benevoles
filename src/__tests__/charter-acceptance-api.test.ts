import { describe, it, expect, vi, beforeEach } from "vitest"
import { hashCharterText } from "@/lib/charter-hash"
import { DEFAULT_VOLUNTEER_CHARTER } from "@/lib/volunteer-charter"

// Proof of acceptance of the volunteer charter (#569): the public sign-up refuses without the
// checkbox, and stores the hash of the exact text shown plus the acceptance date on every
// registration it creates, upserting the matching CharterVersion (hash → text) once.

const m = vi.hoisted(() => ({
  eventFindFirst: vi.fn(),
  shiftFindMany: vi.fn(),
  txCreate: vi.fn(),
  charterUpsert: vi.fn(),
}))

vi.mock("@/lib/prisma", () => ({
  prisma: {
    eventQuestion: { findMany: vi.fn().mockResolvedValue([]) },
    event: { findFirst: m.eventFindFirst },
    shift: { findMany: m.shiftFindMany },
    volunteer: { findFirst: vi.fn().mockResolvedValue(null) },
    registration: { findMany: vi.fn().mockResolvedValue([]) },
    memberInvite: { findFirst: vi.fn() },
    $transaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn({
      $queryRaw: vi.fn(),
      shift: { findMany: vi.fn().mockResolvedValue([]) },
      volunteer: { createMany: vi.fn().mockResolvedValue({ count: 1 }), findFirstOrThrow: vi.fn().mockResolvedValue({ id: "vol-1" }) },
      charterVersion: { upsert: m.charterUpsert },
      registration: {
        findMany: vi.fn().mockResolvedValue([]),
        count: vi.fn().mockResolvedValue(0),
        aggregate: vi.fn().mockResolvedValue({ _max: { waitingPosition: null } }),
        create: m.txCreate,
      },
    })),
  },
}))
vi.mock("@/lib/notification-helpers", () => ({ sendConfirmationEmail: vi.fn(), sendAdminNotification: vi.fn() }))
vi.mock("@/lib/notifications", () => ({ sendNotification: vi.fn() }))
vi.mock("@/lib/notifications/outbox", () => ({ collectNotifications: () => ({ send: vi.fn(), payloads: [] }), enqueueNotifications: vi.fn().mockResolvedValue([]), deliverAfterResponse: vi.fn() }))
vi.mock("@/lib/sector-leaders", () => ({ notifySectorLeadersOfSignup: vi.fn() }))
vi.mock("@/lib/event-log", () => ({ logEvent: vi.fn() }))

const bar = { id: "s1", label: "Bar", roleName: "Bar", capacity: 5, minAge: null, waitlistEnabled: false, registrations: [], reservedTags: [], date: new Date("2030-06-01T00:00:00Z"), startTime: "10:00", endTime: "12:00" }

const post = (extra: Record<string, unknown> = {}) => new Request("http://localhost/api/public/registrations", {
  method: "POST",
  headers: { "Content-Type": "application/json", "x-forwarded-for": `t-${Math.random()}` },
  body: JSON.stringify({ eventId: "evt-1", shiftIds: ["s1"], firstName: "Léa", lastName: "M", email: "lea@x.ch", consent: true, charterAccepted: true, ...extra }),
})

describe("POST /api/public/registrations — proof of charter acceptance (#569)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    m.eventFindFirst.mockResolvedValue({
      id: "evt-1", organizationId: "org-a", title: "Fête", confirmationMessage: null,
      organization: { slug: "a", timeZone: null, volunteerCharter: null },
    })
    m.shiftFindMany.mockResolvedValue([bar])
    m.txCreate.mockResolvedValue({ id: "reg-1", shiftId: "s1", status: "active", waitingPosition: null })
  })

  it("refuses an explicit refusal of the charter, with a readable message pointing at the checkbox", async () => {
    const { POST } = await import("@/app/api/public/registrations/route")
    const res = await POST(post({ charterAccepted: false }))
    expect(res.status).toBe(400)
    const data = await res.json()
    expect(data.field).toBe("charterAccepted")
    expect(data.error).toContain("convention des bénévoles")
    expect(data.error).not.toContain("charterAccepted")
    expect(m.shiftFindMany).not.toHaveBeenCalled()
  })

  // A page loaded before #569 shipped showed the checkbox but did not send the field: the sign-up
  // goes through, without a proof of acceptance (owner decision 2026-10-05).
  it("accepts a sign-up from a page that does not send the field yet, without storing a proof", async () => {
    const { POST } = await import("@/app/api/public/registrations/route")
    const res = await POST(post({ charterAccepted: undefined }))
    expect(res.status).toBeLessThan(300)
    expect(m.txCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ charterAcceptedHash: null, charterAcceptedAt: null }),
    }))
    expect(m.charterUpsert).not.toHaveBeenCalled()
  })

  it("stores the hash of the default text and the acceptance date on the created registration", async () => {
    const { POST } = await import("@/app/api/public/registrations/route")
    const res = await POST(post())
    expect(res.status).toBeLessThan(300)
    const expectedHash = hashCharterText(DEFAULT_VOLUNTEER_CHARTER)
    expect(m.txCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ charterAcceptedHash: expectedHash, charterAcceptedAt: expect.any(Date) }),
    }))
    expect(m.charterUpsert).toHaveBeenCalledWith({
      where: { organizationId_hash: { organizationId: "org-a", hash: expectedHash } },
      create: { organizationId: "org-a", hash: expectedHash, text: DEFAULT_VOLUNTEER_CHARTER },
      update: {},
    })
  })

  it("hashes the organization's own custom text instead, when it set one", async () => {
    const custom = "Notre convention à nous, différente du texte par défaut."
    m.eventFindFirst.mockResolvedValue({
      id: "evt-1", organizationId: "org-a", title: "Fête", confirmationMessage: null,
      organization: { slug: "a", timeZone: null, volunteerCharter: custom },
    })
    const { POST } = await import("@/app/api/public/registrations/route")
    await POST(post())
    const expectedHash = hashCharterText(custom)
    expect(m.txCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ charterAcceptedHash: expectedHash }),
    }))
    expect(m.charterUpsert).toHaveBeenCalledWith(expect.objectContaining({
      create: { organizationId: "org-a", hash: expectedHash, text: custom },
    }))
  })
})
