// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { describe, it, expect, vi, beforeEach } from "vitest"
// Workload protection (#1171) runs on Postgres (src/__integration__/workload-policy.int.test.ts): off here.
vi.mock("@/lib/workload-guard", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/workload-guard")>()),
  lockWorkloadShared: vi.fn(), lockVolunteerRows: vi.fn(), readWorkloadGate: vi.fn(async () => ({ kind: "off" })),
  committedDuty: vi.fn(async () => []), checkScheduleEdit: vi.fn(async () => []),
}))

// Share links per group (#947): a public sign-up made through `?groupe=<code>` records that link,
// resolved by the server from the code within the event. An unknown code, another event's code or
// a client-sent id never attributes anything, and never blocks the sign-up.

const eventFindFirst = vi.hoisted(() => vi.fn())
const groupLinkFindFirst = vi.hoisted(() => vi.fn())
const registrationCreate = vi.hoisted(() => vi.fn())
const logEvent = vi.hoisted(() => vi.fn())

vi.mock("@/lib/prisma", () => ({
  prisma: {
    event: { findFirst: eventFindFirst },
    eventGroupLink: { findFirst: groupLinkFindFirst },
    eventQuestion: { findMany: vi.fn().mockResolvedValue([]) },
    shift: {
      findMany: vi.fn().mockResolvedValue([
        { id: "shift-1", roleName: "Bar", label: "Bar", capacity: 5, minAge: null, waitlistEnabled: false, requiresApproval: false, registrations: [], date: new Date("2099-10-10T00:00:00Z"), startTime: "10:00", endTime: "12:00", reservedTags: [] },
      ]),
    },
    volunteer: { findFirst: vi.fn().mockResolvedValue(null), update: vi.fn() },
    registration: { findMany: vi.fn().mockResolvedValue([]) },
    $transaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn({
      $queryRaw: vi.fn(),
      shift: { findMany: vi.fn().mockResolvedValue([]) },
      charterVersion: { upsert: vi.fn() },
      rosterConsent: { findUnique: vi.fn().mockResolvedValue(null), upsert: vi.fn() },
      questionAnswer: { upsert: vi.fn(), createMany: vi.fn(), deleteMany: vi.fn() },
      registration: {
        findMany: vi.fn().mockResolvedValue([]),
        count: vi.fn().mockResolvedValue(0),
        aggregate: vi.fn().mockResolvedValue({ _max: { waitingPosition: null } }),
        create: registrationCreate,
      },
    })),
  },
}))
vi.mock("@/lib/registration-capacity", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/registration-capacity")>()),
  lockShifts: vi.fn(),
}))
vi.mock("@/lib/signup-volunteer", () => ({
  lockSignupVolunteer: vi.fn().mockResolvedValue({ volunteerId: "vol-1", createdNow: true, matchErased: false }),
}))
vi.mock("@/lib/signup-notifications", () => ({ buildSignupNotifications: vi.fn().mockResolvedValue([]) }))
vi.mock("@/lib/notifications/outbox", () => ({ enqueueNotifications: vi.fn().mockResolvedValue([]), deliverAfterResponse: vi.fn() }))
vi.mock("@/lib/notifications", () => ({ sendNotification: vi.fn() }))
vi.mock("@/lib/org-activity", () => ({ touchOrgActivity: vi.fn() }))
vi.mock("@/lib/event-log", () => ({ logEvent }))

function post(extra: Record<string, unknown> = {}) {
  return new Request("http://localhost/api/public/registrations", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-forwarded-for": `group-${Math.random()}` },
    body: JSON.stringify({ eventId: "evt-1", shiftIds: ["shift-1"], firstName: "A", lastName: "B", email: "a@x.com", consent: true, charterAccepted: true, ...extra }),
  })
}

describe("POST /api/public/registrations — group link attribution (#947)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    eventFindFirst.mockResolvedValue({
      id: "evt-1", organizationId: "org-a", title: "Fête", confirmationMessage: null, requirePhone: false,
      organization: { slug: "org-a", timeZone: "Europe/Zurich", volunteerCharter: null },
    })
    registrationCreate.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: "reg-1", shiftId: data.shiftId, status: "active", waitingPosition: null }))
  })

  it("records the link of this event with that code, and logs its name", async () => {
    groupLinkFindFirst.mockResolvedValue({ id: "link-1", name: "Amicale des pompiers" })
    const { POST } = await import("@/app/api/public/registrations/route")
    const res = await POST(post({ groupCode: "ABCD2345" }))
    expect(res.status).toBe(201)
    // Looked up within the event, by the normalised code: never by an id sent by the page.
    expect(groupLinkFindFirst).toHaveBeenCalledWith({ where: { eventId: "evt-1", code: "abcd2345" }, select: { id: true, name: true } })
    expect(registrationCreate.mock.calls[0][0].data.groupLinkId).toBe("link-1")
    expect(logEvent.mock.calls[0][0].changes.groupLink).toEqual({ from: null, to: "Amicale des pompiers" })
  })

  it("an unknown code (or another event's) attributes nothing and the sign-up goes through", async () => {
    groupLinkFindFirst.mockResolvedValue(null)
    const { POST } = await import("@/app/api/public/registrations/route")
    const res = await POST(post({ groupCode: "zzzz2222" }))
    expect(res.status).toBe(201)
    expect(registrationCreate.mock.calls[0][0].data.groupLinkId).toBeNull()
    expect(logEvent.mock.calls[0][0].changes.groupLink).toBeUndefined()
  })

  it("a malformed code is not even looked up", async () => {
    const { POST } = await import("@/app/api/public/registrations/route")
    const res = await POST(post({ groupCode: "link-1' OR 1=1" }))
    expect(res.status).toBe(201)
    expect(groupLinkFindFirst).not.toHaveBeenCalled()
    expect(registrationCreate.mock.calls[0][0].data.groupLinkId).toBeNull()
  })

  it("a client-sent groupLinkId is ignored", async () => {
    const { POST } = await import("@/app/api/public/registrations/route")
    const res = await POST(post({ groupLinkId: "link-of-another-org" }))
    expect(res.status).toBe(201)
    expect(groupLinkFindFirst).not.toHaveBeenCalled()
    expect(registrationCreate.mock.calls[0][0].data.groupLinkId).toBeNull()
  })

  it("the main link (no code) records no group", async () => {
    const { POST } = await import("@/app/api/public/registrations/route")
    expect((await POST(post())).status).toBe(201)
    expect(registrationCreate.mock.calls[0][0].data.groupLinkId).toBeNull()
  })
})
