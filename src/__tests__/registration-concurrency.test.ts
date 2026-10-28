import { describe, it, expect, vi, beforeEach } from "vitest"
// Workload protection (#1171) runs on Postgres (src/__integration__/workload-policy.int.test.ts): off here.
vi.mock("@/lib/workload-guard", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/workload-guard")>()),
  lockWorkloadShared: vi.fn(), lockVolunteerRows: vi.fn(), readWorkloadGate: vi.fn(async () => ({ kind: "off" })),
  committedDuty: vi.fn(async () => []), checkScheduleEdit: vi.fn(async () => []),
}))

// The link's organisation, open: its links give data (src/lib/org-lifecycle.ts).
const OPEN_ORG = { active: true, suspendedAt: null }

// Route-level behavior of the concurrency fixes (#264), with Prisma mocked: what each route does
// when the locked re-check or a conditional update tells it another request got there first.
// The actual locking/serialization is exercised against Postgres in e2e/registration-concurrency.spec.ts.

const m = vi.hoisted(() => ({
  eventFindFirst: vi.fn(),
  shiftFindMany: vi.fn(),
  shiftFindUnique: vi.fn(),
  regFindFirst: vi.fn(),
  regFindMany: vi.fn(),
  regFindUniqueOrThrow: vi.fn(),
  regUpdateMany: vi.fn(),
  regUpdate: vi.fn(),
  regCount: vi.fn(),
  regAggregate: vi.fn(),
  regCreate: vi.fn(),
  eventLogFindFirst: vi.fn(),
  transaction: vi.fn(),
}))

vi.mock("@/lib/prisma", () => {
  const registration = {
    findFirst: m.regFindFirst,
    findMany: m.regFindMany,
    findUniqueOrThrow: m.regFindUniqueOrThrow,
    updateMany: m.regUpdateMany,
    update: m.regUpdate,
    count: m.regCount,
    aggregate: m.regAggregate,
    create: m.regCreate,
  }
  const tx = {
    $queryRaw: vi.fn().mockResolvedValue([{ id: "locked" }]), // the member lock (#285): the row it locked
    registration,
    shift: { findUnique: m.shiftFindUnique, findMany: vi.fn().mockResolvedValue([]) },
    volunteer: { createMany: vi.fn().mockResolvedValue({ count: 1 }), findFirstOrThrow: vi.fn().mockResolvedValue({ id: "vol-1" }) },
    charterVersion: { upsert: vi.fn() },
    rosterConsent: { findUnique: vi.fn().mockResolvedValue(null), upsert: vi.fn() },
  }
  m.transaction.mockImplementation(async (fn: (t: typeof tx) => unknown) => fn(tx))
  return {
    prisma: {
    eventQuestion: { findMany: vi.fn().mockResolvedValue([]) }, // no custom question (#483)
      event: { findFirst: m.eventFindFirst },
      shift: { findMany: m.shiftFindMany, findUnique: m.shiftFindUnique },
      volunteer: { findFirst: vi.fn().mockResolvedValue(null), create: vi.fn().mockResolvedValue({ id: "vol-1" }), update: vi.fn() },
      registration,
      eventLog: { findFirst: m.eventLogFindFirst },
      $transaction: m.transaction,
    },
  }
})
vi.mock("@/lib/notification-helpers", () => ({ sendConfirmationEmail: vi.fn(), sendAdminNotification: vi.fn() }))
vi.mock("@/lib/notifications", () => ({ sendNotification: vi.fn().mockResolvedValue({ ok: true }) }))
const outboxMocks = vi.hoisted(() => ({
  enqueueAndDeliver: vi.fn().mockResolvedValue(undefined),
  enqueueNotifications: vi.fn().mockResolvedValue(["row-1"]),
  deliverAfterResponse: vi.fn(),
}))
const { enqueueAndDeliver, enqueueNotifications, deliverAfterResponse } = outboxMocks
vi.mock("@/lib/notifications/outbox", () => ({ ...outboxMocks, collectNotifications: () => ({ payloads: [], send: async () => ({ ok: true }) }) }))
vi.mock("@/lib/sector-leaders", () => ({ notifySectorLeadersOfSignup: vi.fn() }))
vi.mock("@/lib/event-log", () => ({ logEvent: vi.fn().mockResolvedValue("log-1"), SYSTEM_ACTOR: { type: "system" } }))

const ip = () => ({ "x-forwarded-for": `t-${Math.random()}` })

beforeEach(() => {
  for (const fn of Object.values(m)) if (fn !== m.transaction) fn.mockReset()
})

describe("POST /api/public/registrations under contention", () => {
  const body = { eventId: "evt-1", shiftIds: ["shift-1"], firstName: "A", lastName: "B", email: "a@x.com", consent: true, charterAccepted: true }
  const post = () => new Request("http://localhost/api/public/registrations", {
    method: "POST", headers: { "Content-Type": "application/json", ...ip() }, body: JSON.stringify(body),
  })

  beforeEach(() => {
    m.eventFindFirst.mockResolvedValue({ id: "evt-1", organizationId: "org-a", title: "F", organization: { slug: "a" }, confirmationMessage: null })
    // Looked free before the lock...
    m.shiftFindMany.mockResolvedValue([
      { id: "shift-1", label: "Bar", capacity: 1, minAge: null, waitlistEnabled: false, registrations: [], date: new Date(), startTime: "10:00", endTime: "12:00" },
    ])
    m.regFindMany.mockResolvedValue([])
    m.regAggregate.mockResolvedValue({ _max: { waitingPosition: null } })
  })

  it("refuses with 409 when the last spot was taken between the early check and the lock", async () => {
    m.regCount.mockResolvedValue(1) // ...but full once re-read under lock
    const { POST } = await import("@/app/api/public/registrations/route")
    const res = await POST(post())
    expect(res.status).toBe(409)
    expect((await res.json()).fullShiftId).toBe("shift-1")
    expect(m.regCreate).not.toHaveBeenCalled()
  })

  it("answers 409 'already registered' when a racing duplicate hits the unique index", async () => {
    m.regCount.mockResolvedValue(0)
    m.regCreate.mockRejectedValue(Object.assign(new Error("unique"), { code: "P2002" }))
    m.regFindFirst.mockResolvedValue({
      editTokenLegacy: "existing-tok", editTokenEnc: null,
      volunteer: { firstName: "A", lastName: "B", email: "a@x.com" },
      event: { title: "F", organization: { slug: "a" } },
    })
    const { POST } = await import("@/app/api/public/registrations/route")
    const res = await POST(post())
    expect(res.status).toBe(409)
    const data = await res.json()
    expect(data.error).toContain("déjà une inscription")
    // Never the existing registration's token (#285): it goes to the owner by email instead.
    expect(JSON.stringify(data)).not.toContain("existing-tok")
  })
})

// A shift a week ahead, 10:00 in the deployment's zone (#946: the offer window depends on its start).
const weekAhead = () => new Date(`${new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10)}T00:00:00Z`)

describe("promoteNextInWaitlist under contention", () => {
  it("offers the spot when one is free", async () => {
    m.shiftFindUnique.mockResolvedValue({ capacity: 2, status: "open", date: weekAhead(), startTime: "10:00" })
    m.regCount.mockResolvedValue(1)
    m.regFindFirst.mockResolvedValue({ id: "w1" })
    m.regFindUniqueOrThrow.mockResolvedValue({
      id: "w1", eventId: "evt-1", editTokenLegacy: "t", editTokenEnc: null,
      volunteer: { email: "w@x.com", firstName: "W" },
      shift: { label: "Bar", date: new Date(), startTime: "10:00", endTime: "12:00" },
      event: { title: "F", organization: { slug: "a", name: "A" } },
    })
    const { promoteNextInWaitlist } = await import("@/lib/waitlist")
    await promoteNextInWaitlist("shift-1")
    expect(m.regUpdate).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "w1" }, data: expect.objectContaining({ status: "offered" }) }))
    // The offer email is stored in the offer's transaction (#352), then delivered after commit.
    const [payloads, db] = enqueueNotifications.mock.calls.at(-1)!
    expect(payloads[0]).toEqual(expect.objectContaining({ kind: "waitlist_offered" }))
    expect(db).toHaveProperty("registration")
    expect(db).not.toHaveProperty("$transaction")
    expect(deliverAfterResponse).toHaveBeenLastCalledWith(["row-1"])
  })

  it("doesn't offer when no spot is actually free (e.g. second promotion for the same freed spot)", async () => {
    m.shiftFindUnique.mockResolvedValue({ capacity: 2, status: "open", date: weekAhead(), startTime: "10:00" })
    m.regCount.mockResolvedValue(2) // the first promotion's offer already holds the spot
    const { promoteNextInWaitlist } = await import("@/lib/waitlist")
    enqueueNotifications.mockClear()
    await promoteNextInWaitlist("shift-1")
    expect(m.regFindFirst).not.toHaveBeenCalled()
    expect(m.regUpdate).not.toHaveBeenCalled()
    expect(enqueueNotifications).not.toHaveBeenCalled()
  })

  // #946: the 24-hour answer window never runs past the shift's start; within the hour, no offer.
  it("caps the offer's expiry at the shift's start", async () => {
    const now = new Date("2026-07-03T20:00:00Z")
    m.shiftFindUnique.mockResolvedValue({ capacity: 2, status: "open", date: new Date("2026-07-04T00:00:00Z"), startTime: "10:00", event: { publicStatus: "published", registrationsOpen: true, registrationOpensAt: null, registrationClosesAt: null, organization: { timeZone: "Europe/Zurich" } } })
    m.regCount.mockResolvedValue(1)
    m.regFindFirst.mockResolvedValue({ id: "w1" })
    m.regFindUniqueOrThrow.mockResolvedValue({
      id: "w1", eventId: "evt-1", editTokenLegacy: "t", editTokenEnc: null,
      volunteer: { email: "w@x.com", firstName: "W" },
      shift: { label: "Bar", date: new Date("2026-07-04T00:00:00Z"), startTime: "10:00", endTime: "12:00" },
      event: { title: "F", organization: { slug: "a", name: "A", timeZone: "Europe/Zurich" } },
    })
    m.regUpdate.mockClear()
    const { promoteNextInWaitlist } = await import("@/lib/waitlist")
    await promoteNextInWaitlist("shift-1", undefined, now)
    expect(m.regUpdate.mock.calls[0][0].data.waitingExpiresAt).toEqual(new Date("2026-07-04T08:00:00Z"))
  })

  it("does not offer a spot when the shift starts within the hour", async () => {
    const now = new Date("2026-07-04T07:30:00Z")
    m.shiftFindUnique.mockResolvedValue({ capacity: 2, status: "open", date: new Date("2026-07-04T00:00:00Z"), startTime: "10:00", event: { publicStatus: "published", registrationsOpen: true, registrationOpensAt: null, registrationClosesAt: null, organization: { timeZone: "Europe/Zurich" } } })
    m.regCount.mockResolvedValue(1)
    m.regFindFirst.mockClear()
    m.regUpdate.mockClear()
    enqueueNotifications.mockClear()
    const { promoteNextInWaitlist } = await import("@/lib/waitlist")
    expect(await promoteNextInWaitlist("shift-1", undefined, now)).toBe(false)
    expect(m.regFindFirst).not.toHaveBeenCalled()
    expect(m.regUpdate).not.toHaveBeenCalled()
    expect(enqueueNotifications).not.toHaveBeenCalled()
  })
})

describe("conditional transitions", () => {
  it("public cancel: a second concurrent cancel gets 404 and doesn't promote again", async () => {
    m.regFindFirst.mockResolvedValue({
      id: "r1", eventId: "evt-1", shiftId: "shift-1", volunteerId: "v1", status: "active",
      shift: { date: weekAhead(), startTime: "10:00", endTime: "12:00" }, event: { organization: { ...OPEN_ORG, timeZone: "Europe/Zurich" } },
    })
    m.regUpdateMany.mockResolvedValue({ count: 0 })
    const { DELETE } = await import("@/app/api/public/registrations/[token]/route")
    const res = await DELETE(new Request("http://localhost/x", { method: "DELETE", headers: ip() }), { params: Promise.resolve({ token: "tok" }) })
    expect(res.status).toBe(404)
    expect(m.transaction).not.toHaveBeenCalled()
  })

  it("waitlist confirm: a second concurrent confirm gets 404 and sends nothing", async () => {
    m.regFindFirst.mockResolvedValue({
      id: "r1", eventId: "evt-1", volunteerId: "v1", editTokenLegacy: "tok", editTokenEnc: null, waitingExpiresAt: new Date(Date.now() + 3600_000),
      volunteer: { email: "a@x.com", firstName: "A" }, shift: { label: "Bar", date: new Date(), startTime: "10:00", endTime: "12:00" },
      event: { title: "F", organization: { ...OPEN_ORG, slug: "a" } },
    })
    m.regUpdateMany.mockResolvedValue({ count: 0 })
    enqueueAndDeliver.mockClear()
    const { POST } = await import("@/app/api/public/waitlist/[token]/confirm/route")
    const res = await POST(new Request("http://localhost/x", { method: "POST", headers: ip() }), { params: Promise.resolve({ token: "tok" }) })
    expect(res.status).toBe(404)
    expect(enqueueAndDeliver).not.toHaveBeenCalled()
  })

  it("waitlist confirm: no GET handler, a link scanner following the URL accepts nothing (#1044)", async () => {
    const route = await import("@/app/api/public/waitlist/[token]/confirm/route")
    expect(Object.keys(route)).toEqual(["POST"])
  })

  it("waitlist confirm on a « Sur validation » shift: the offered spot becomes a request (#484)", async () => {
    m.regFindFirst.mockResolvedValue({
      id: "r1", eventId: "evt-1", volunteerId: "v1", editTokenLegacy: "tok", editTokenEnc: null, waitingExpiresAt: new Date(Date.now() + 3600_000),
      volunteer: { email: "a@x.com", firstName: "A" }, shift: { label: "Navette", date: new Date(), startTime: "10:00", endTime: "12:00", requiresApproval: true },
      event: { title: "F", organizationId: "org-a", organization: { ...OPEN_ORG, slug: "a" } },
    })
    m.regUpdateMany.mockResolvedValue({ count: 1 })
    m.eventLogFindFirst.mockResolvedValue(null)
    enqueueNotifications.mockClear()
    const { POST } = await import("@/app/api/public/waitlist/[token]/confirm/route")
    const res = await POST(new Request("http://localhost/x", { method: "POST", headers: ip() }), { params: Promise.resolve({ token: "tok" }) })
    expect(await res.json()).toMatchObject({ success: true, requested: true })
    expect(m.regUpdateMany.mock.calls[0][0].data.status).toBe("requested")
    expect(enqueueNotifications.mock.calls[0][0][0].kind).toBe("registration_requested")
  })
})
