// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { describe, it, expect, vi, beforeEach } from "vitest"

// Public sign-up through a share link for one shift (#1386): the code scopes the sign-up to that
// one shift, stores shiftShareLinkId, never goes to the waitlist, and only bypasses the event's
// registration window when the link's checkbox is on.

vi.mock("@/lib/workload-guard", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/workload-guard")>()),
  lockWorkloadShared: vi.fn(), lockVolunteerRows: vi.fn(), readWorkloadGate: vi.fn(async () => ({ kind: "off" })),
  committedDuty: vi.fn(async () => []), checkScheduleEdit: vi.fn(async () => []),
}))

const m = vi.hoisted(() => ({
  eventFindFirst: vi.fn(),
  linkFindFirst: vi.fn(),
  shiftFindMany: vi.fn(),
  txShiftFindMany: vi.fn(),
  txCreate: vi.fn(),
  txRegFindMany: vi.fn(),
}))
vi.mock("@/lib/prisma", async () => {
  const locked = (await import("./helpers/locked-shifts")).lockedShiftReads()
  return {
    prisma: {
      charterVersion: { upsert: vi.fn() },
      eventQuestion: { findMany: vi.fn().mockResolvedValue([]) },
      eventGroupLink: { findFirst: vi.fn().mockResolvedValue(null) },
      event: { findFirst: m.eventFindFirst },
      shiftShareLink: { findFirst: m.linkFindFirst },
      shift: { findMany: locked.top(m.shiftFindMany) },
      volunteer: { findFirst: vi.fn().mockResolvedValue(null) },
      registration: { findMany: vi.fn().mockResolvedValue([]), findFirst: vi.fn().mockResolvedValue(null) },
      memberInvite: { findFirst: vi.fn().mockResolvedValue(null), findUnique: vi.fn().mockResolvedValue(null), updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
      $transaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn({
        $queryRaw: vi.fn().mockResolvedValue([{ id: "vol-1", erasedAt: null, email: "lea@x.ch" }]),
        shift: { findMany: locked.tx(m.txShiftFindMany) },
        volunteer: { createMany: vi.fn().mockResolvedValue({ count: 1 }), findFirstOrThrow: vi.fn().mockResolvedValue({ id: "vol-1" }), findFirst: vi.fn().mockResolvedValue({ email: "lea@x.ch", firstName: "Léa", lastName: "M" }) },
        event: { findFirst: m.eventFindFirst },
        charterVersion: { upsert: vi.fn() },
        rosterConsent: { findUnique: vi.fn().mockResolvedValue(null), upsert: vi.fn() },
        shiftDecline: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
        registration: {
          findFirst: vi.fn().mockResolvedValue(null),
          findMany: m.txRegFindMany,
          count: vi.fn().mockResolvedValue(0),
          aggregate: vi.fn().mockResolvedValue({ _max: { waitingPosition: null } }),
          create: m.txCreate,
        },
      })),
    },
  }
})
vi.mock("@/lib/notification-helpers", () => ({ sendConfirmationEmail: vi.fn(), sendAdminNotification: vi.fn() }))
vi.mock("@/lib/notifications", () => ({ sendNotification: vi.fn() }))
vi.mock("@/lib/notifications/outbox", () => ({ collectNotifications: () => ({ send: vi.fn(), payloads: [] }), enqueueNotifications: vi.fn().mockResolvedValue([]), deliverAfterResponse: vi.fn() }))
vi.mock("@/lib/sector-leaders", () => ({ notifySectorLeadersOfSignup: vi.fn() }))
vi.mock("@/lib/event-log", () => ({ logEvent: vi.fn() }))

const EVENT = {
  id: "evt-1", organizationId: "org-a", title: "Fête", publicStatus: "published", registrationsOpen: true,
  registrationOpensAt: null, registrationClosesAt: null, confirmationMessage: null, requirePhone: false,
  requireEmailConfirmation: false, organization: { slug: "a", timeZone: null },
}

const shiftRow = (over: Record<string, unknown> = {}) => ({
  id: "s1", roleName: "Bar", label: "Bar", description: null, date: new Date("2030-06-01T00:00:00Z"), startTime: "18:00", endTime: "20:00",
  capacity: 3, status: "open", locationDetails: null, contactName: null, contactPhone: null, instructions: null, latitude: null, longitude: null,
  displayOrder: 0, waitlistEnabled: false, requiresApproval: false, minAge: null, colorKey: null, maxPerVolunteer: null, reservedTags: [] as string[],
  overlapAllowed: false, assignedOnly: false, registrations: [] as unknown[],
  ...over,
})

const LINK = (over: Record<string, unknown> = {}) => ({ id: "link-1", shiftId: "s1", acceptsAfterClose: false, ...over })

/** The asked shifts for the first query, all the role's live shifts for the settings query. */
function shiftsInDb(rows: ReturnType<typeof shiftRow>[]) {
  m.shiftFindMany.mockImplementation(async ({ where }: { where: { id?: { in: string[] }; roleName?: { in: string[] } } }) => {
    if (where.id) return rows.filter((r) => where.id!.in.includes(r.id))
    if (!where.roleName) return rows.filter((r) => r.assignedOnly)
    return rows.filter((r) => where.roleName!.in.includes(r.roleName))
  })
}

const post = (shiftIds: string[], extra: Record<string, unknown> = {}) => new Request("http://localhost/api/public/registrations", {
  method: "POST",
  headers: { "Content-Type": "application/json", "x-forwarded-for": `t-${Math.random()}` },
  body: JSON.stringify({ eventId: "evt-1", shiftIds, firstName: "Léa", lastName: "M", email: "lea@x.ch", consent: true, charterAccepted: true, ...extra }),
})

beforeEach(() => {
  vi.clearAllMocks()
  m.eventFindFirst.mockResolvedValue(EVENT)
  m.linkFindFirst.mockResolvedValue(null)
  m.txShiftFindMany.mockResolvedValue([])
  m.txRegFindMany.mockResolvedValue([])
  m.txCreate.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: "reg-1", shiftId: data.shiftId, status: data.status, waitingPosition: null }))
})

describe("POST /api/public/registrations through a shift share link", () => {
  it("scopes the sign-up to the link's shift and stores shiftShareLinkId", async () => {
    const s1 = shiftRow()
    shiftsInDb([s1])
    m.linkFindFirst.mockResolvedValue(LINK())
    const { POST } = await import("@/app/api/public/registrations/route")
    const res = await POST(post(["s1"], { shiftLinkCode: "abcd2345" }))
    expect(res.status).toBe(201)
    expect(m.linkFindFirst).toHaveBeenCalledWith({ where: { eventId: "evt-1", code: "abcd2345" }, select: { id: true, shiftId: true, acceptsAfterClose: true } })
    expect(m.txCreate.mock.calls[0][0].data).toMatchObject({ shiftId: "s1", shiftShareLinkId: "link-1" })
  })

  it("refuses another shift id than the link's, as an invalid shift", async () => {
    shiftsInDb([shiftRow(), shiftRow({ id: "s2", roleName: "Cuisine", label: "Cuisine" })])
    m.linkFindFirst.mockResolvedValue(LINK())
    const { POST } = await import("@/app/api/public/registrations/route")
    const res = await POST(post(["s2"], { shiftLinkCode: "abcd2345" }))
    expect(res.status).toBe(409)
    expect(await res.text()).toContain("invalides ou fermés")
    expect(m.txCreate).not.toHaveBeenCalled()
  })

  it("ignores a link of another event (not found through the event's link query)", async () => {
    shiftsInDb([shiftRow()])
    m.linkFindFirst.mockResolvedValue(null) // another event's code: the query is scoped by eventId
    const { POST } = await import("@/app/api/public/registrations/route")
    const res = await POST(post(["s1"], { shiftLinkCode: "abcd2345" }))
    expect(res.status).toBe(201)
    expect(m.txCreate.mock.calls[0][0].data.shiftShareLinkId).toBeNull()
  })

  it("never goes to the waitlist through a link: a full shift answers the existing « complet » refusal", async () => {
    shiftsInDb([shiftRow({ capacity: 1, waitlistEnabled: true, registrations: [{ id: "r1" }] })])
    m.linkFindFirst.mockResolvedValue(LINK())
    const { POST } = await import("@/app/api/public/registrations/route")
    const res = await POST(post(["s1"], { shiftLinkCode: "abcd2345" }))
    expect(res.status).toBe(409)
    expect(await res.json()).toMatchObject({ error: expect.stringContaining("complet"), fullShiftId: "s1" })
    expect(m.txCreate).not.toHaveBeenCalled()
  })

  it("keeps the closed window without the checkbox", async () => {
    shiftsInDb([shiftRow()])
    m.eventFindFirst.mockResolvedValue({ ...EVENT, registrationsOpen: false })
    m.linkFindFirst.mockResolvedValue(LINK({ acceptsAfterClose: false }))
    const { POST } = await import("@/app/api/public/registrations/route")
    const res = await POST(post(["s1"], { shiftLinkCode: "abcd2345" }))
    expect(res.status).toBe(409)
    expect(await res.text()).toContain("fermées")
    expect(m.txCreate).not.toHaveBeenCalled()
  })

  it("bypasses the closed window with the checkbox (option b)", async () => {
    shiftsInDb([shiftRow()])
    m.eventFindFirst.mockResolvedValue({ ...EVENT, registrationsOpen: false })
    m.linkFindFirst.mockResolvedValue(LINK({ acceptsAfterClose: true }))
    const { POST } = await import("@/app/api/public/registrations/route")
    const res = await POST(post(["s1"], { shiftLinkCode: "abcd2345" }))
    expect(res.status).toBe(201)
    expect(m.txCreate).toHaveBeenCalled()
  })

  it("never bypasses a window that has not opened yet, even with the checkbox", async () => {
    shiftsInDb([shiftRow()])
    m.eventFindFirst.mockResolvedValue({ ...EVENT, registrationOpensAt: new Date("2030-05-01T00:00:00Z") })
    m.linkFindFirst.mockResolvedValue(LINK({ acceptsAfterClose: true }))
    const { POST } = await import("@/app/api/public/registrations/route")
    const res = await POST(post(["s1"], { shiftLinkCode: "abcd2345" }))
    expect(res.status).toBe(409)
    expect(await res.text()).toContain("ouvrent")
    expect(m.txCreate).not.toHaveBeenCalled()
  })

  it("refuses a shift that has started, even while it is still running", async () => {
    const now = new Date()
    const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
    shiftsInDb([shiftRow({ date: today, startTime: "00:00", endTime: "23:59" })])
    m.linkFindFirst.mockResolvedValue(LINK())
    const { POST } = await import("@/app/api/public/registrations/route")
    const res = await POST(post(["s1"], { shiftLinkCode: "abcd2345" }))
    expect(res.status).toBe(409)
    expect(await res.text()).toContain("a déjà commencé")
    expect(m.txCreate).not.toHaveBeenCalled()
  })

  it("refuses a shift of a role assigned by the organisation only", async () => {
    shiftsInDb([shiftRow({ id: "s-caisse", roleName: "Caisse", label: "Caisse", assignedOnly: true })])
    m.linkFindFirst.mockResolvedValue(LINK({ shiftId: "s-caisse" }))
    const { POST } = await import("@/app/api/public/registrations/route")
    const res = await POST(post(["s-caisse"], { shiftLinkCode: "abcd2345" }))
    expect(res.status).toBe(409)
    expect(await res.text()).toContain("invalides ou fermés")
    expect(m.txCreate).not.toHaveBeenCalled()
  })
})
