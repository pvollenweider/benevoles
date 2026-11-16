import { describe, it, expect, vi, beforeEach } from "vitest"

// « Jour J » (#561): a tap on « Présent » must behave exactly like « Marquer présents » on the
// registrations list (#399): same route, same rule (confirmed registrations only), same event log
// entries. Runs the real bulk route and the real setAttendance on a fake org-scoped client.

const requireOrgSessionMock = vi.hoisted(() => vi.fn())
vi.mock("@/lib/auth-guard", () => ({
  requireOrgSession: requireOrgSessionMock,
  // The day-of and bulk routes ask requireFrontDeskOrOrganizer (#1142): for an organiser it is the
  // same session, marked as such. The front-desk side is tested in security/front-desk-*.test.ts.
  requireFrontDeskOrOrganizer: async () => { const g = await requireOrgSessionMock(); return g instanceof Response ? g : { ...g, access: "organizer", grant: null } },
}))
vi.mock("@/lib/prisma", () => ({ prisma: {} }))
const logEvent = vi.hoisted(() => vi.fn().mockResolvedValue("log-1"))
vi.mock("@/lib/event-log", () => ({ logEvent, adminActor: () => ({ type: "admin", id: "adm-1" }) }))
vi.mock("@/lib/notifications", () => ({ sendNotification: vi.fn() }))
vi.mock("@/lib/waitlist", () => ({ promoteNextInWaitlist: vi.fn() }))
vi.mock("@/lib/sector-leaders", () => ({ tagVolunteerAsResponsable: vi.fn() }))
vi.mock("@/lib/notifications/outbox", () => ({ enqueueNotifications: vi.fn(), deliverAfterResponse: vi.fn() }))

import { attendanceRequest, presenceRequest } from "@/lib/day-of"

type Row = { id: string; eventId: string; shiftId: string; status: string; checkedInAt: Date | null; attendanceStatus?: string | null; attendanceAt?: Date | null; attendanceBy?: string | null }
type Where = { id: string; status: string; shiftId: string; checkedInAt: null | { not: null }; attendanceStatus?: string | null }

function fakeDb(rows: Row[]) {
  // Applies the conditional write like the database: the status, the check-in and the absence.
  const updateMany = vi.fn(async ({ where, data }: { where: Where; data: Partial<Row> }) => {
    const r = rows.find((x) =>
      x.id === where.id && x.status === where.status && x.shiftId === where.shiftId
      && (where.checkedInAt === null ? x.checkedInAt === null : x.checkedInAt !== null)
      && (!("attendanceStatus" in where) || (x.attendanceStatus ?? null) === where.attendanceStatus))
    if (!r) return { count: 0 }
    Object.assign(r, data)
    return { count: 1 }
  })
  return {
    updateMany,
    db: {
      event: { findFirst: vi.fn().mockResolvedValue({ id: "evt-1", title: "Fête", organization: { slug: "a" } }) },
      registration: {
        findMany: vi.fn(async ({ where }: { where: { id: { in: string[] } } }) =>
          rows.filter((r) => where.id.in.includes(r.id)).map((r) => ({ ...r, volunteer: { id: "v", firstName: "A", lastName: "B", email: null }, shift: { roleName: "Bar" } }))),
        updateMany,
      },
    },
  }
}

const rows = (): Row[] => [
  { id: "r1", eventId: "evt-1", shiftId: "s1", status: "active", checkedInAt: null },
  { id: "r2", eventId: "evt-1", shiftId: "s1", status: "waiting", checkedInAt: null },
]

/** What the registrations list sends for « Marquer présents » on one row (RegistrationsManager). */
const listRequest = (id: string, present: boolean) => ({
  url: "/api/admin/events/evt-1/registrations/bulk",
  body: { action: present ? "check_in" : "undo_check_in", registrationIds: [id] },
})

async function send(req: { url: string; body: unknown }, fake: ReturnType<typeof fakeDb>) {
  requireOrgSessionMock.mockResolvedValue({ db: fake.db, organizationId: "org-a", session: { user: { id: "adm-1" } } })
  const { POST } = await import("@/app/api/admin/events/[id]/registrations/bulk/route")
  const res = await POST(
    new Request(`http://localhost${req.url}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(req.body) }),
    { params: Promise.resolve({ id: "evt-1" }) },
  )
  return { status: res.status, json: await res.json() }
}

/** What the route answers for one registration that changed (#399, plus the per-registration result of #1141). */
const changedAnswer = (state: "present" | "expected" | "absent") => ({
  status: 200,
  json: { done: 1, changedIds: ["r1"], skipped: 0, results: [{ id: "r1", changed: true, state, checkedInAt: state === "present" ? expect.any(String) : null }] },
})
/** What it answers when nothing changed: the state as it is in the database. */
const unchangedAnswer = (id: string, state: "present" | "expected" | "absent") => ({
  status: 200,
  json: { done: 0, changedIds: [], skipped: 1, results: [{ id, changed: false, state, checkedInAt: state === "present" ? expect.any(String) : null }] },
})

/** The log entries without the check-in instant, which differs between two runs. */
const loggedActions = () => logEvent.mock.calls.map(([e]) => ({ ...e, changes: { ...e.changes, checkedInAt: { ...e.changes.checkedInAt, to: e.changes.checkedInAt.to ? "set" : null } } }))

beforeEach(() => vi.clearAllMocks())

describe("« Présent » on the day-of page and the registrations list's check-in", () => {
  it("targets the same route with the same body", () => {
    expect(presenceRequest("evt-1", "r1", true)).toEqual(listRequest("r1", true))
    expect(presenceRequest("evt-1", "r1", false)).toEqual(listRequest("r1", false))
  })

  it("records the same check-in and the same log entries, then the same undo", async () => {
    const fromList = fakeDb(rows())
    expect(await send(listRequest("r1", true), fromList)).toEqual(changedAnswer("present"))
    expect(await send(listRequest("r1", false), fromList)).toEqual(changedAnswer("expected"))
    const listLog = loggedActions()
    logEvent.mockClear()

    const fromDayOf = fakeDb(rows())
    expect(await send(presenceRequest("evt-1", "r1", true), fromDayOf)).toEqual(changedAnswer("present"))
    expect(await send(presenceRequest("evt-1", "r1", false), fromDayOf)).toEqual(changedAnswer("expected"))
    expect(loggedActions()).toEqual(listLog)
    expect(listLog.map((e) => e.action)).toEqual(["registration.checked_in", "registration.check_in_undone"])
  })

  it("only confirmed registrations: a waitlist entry is left alone and nothing is logged", async () => {
    const fake = fakeDb(rows())
    expect(await send(presenceRequest("evt-1", "r2", true), fake)).toEqual(unchangedAnswer("r2", "expected"))
    expect(fake.updateMany).not.toHaveBeenCalled()
    expect(logEvent).not.toHaveBeenCalled()
  })

  it("a second tap on someone already present changes nothing and logs nothing", async () => {
    const fake = fakeDb(rows())
    await send(presenceRequest("evt-1", "r1", true), fake)
    logEvent.mockClear()
    expect(await send(presenceRequest("evt-1", "r1", true), fake)).toEqual(unchangedAnswer("r1", "present"))
    expect(logEvent).not.toHaveBeenCalled()
  })
})

// The « absent » state (#1141), through the real route and the real setAttendance.
describe("« Marquer absent » on the day-of page", () => {
  it("records the absence, then its undo, with their own log entries", async () => {
    const fake = fakeDb(rows())
    expect(await send(attendanceRequest("evt-1", "r1", "mark_absent"), fake)).toEqual(changedAnswer("absent"))
    expect(await send(attendanceRequest("evt-1", "r1", "undo_absent"), fake)).toEqual(changedAnswer("expected"))
    expect(logEvent.mock.calls.map(([e]) => [e.action, e.changes])).toEqual([
      ["registration.marked_absent", { attendance: { from: "expected", to: "absent" }, shiftId: { from: "s1", to: "s1" } }],
      ["registration.absence_undone", { attendance: { from: "absent", to: "expected" }, shiftId: { from: "s1", to: "s1" } }],
    ])
  })

  it("two devices never overwrite each other: the second request changes nothing and gets the first one's state", async () => {
    const fake = fakeDb(rows())
    // Both phones show r1 as expected. The first marks it absent, the second then marks it present.
    await send(attendanceRequest("evt-1", "r1", "mark_absent"), fake)
    logEvent.mockClear()
    expect(await send(attendanceRequest("evt-1", "r1", "check_in"), fake)).toEqual(unchangedAnswer("r1", "absent"))
    // And the other way round: present first, then « Marquer absent » from the stale phone.
    const other = fakeDb(rows())
    await send(attendanceRequest("evt-1", "r1", "check_in"), other)
    logEvent.mockClear()
    expect(await send(attendanceRequest("evt-1", "r1", "mark_absent"), other)).toEqual(unchangedAnswer("r1", "present"))
    expect(logEvent).not.toHaveBeenCalled()
  })

  it("only confirmed registrations: a waitlist entry is never marked absent", async () => {
    const fake = fakeDb(rows())
    expect(await send(attendanceRequest("evt-1", "r2", "mark_absent"), fake)).toEqual(unchangedAnswer("r2", "expected"))
    expect(fake.updateMany).not.toHaveBeenCalled()
    expect(logEvent).not.toHaveBeenCalled()
  })

  it("« left_early » is refused: nothing is read or written", async () => {
    const fake = fakeDb(rows())
    const res = await send({ url: "/api/admin/events/evt-1/registrations/bulk", body: { action: "left_early", registrationIds: ["r1"] } }, fake)
    expect(res.status).toBe(400)
    expect(fake.updateMany).not.toHaveBeenCalled()
  })

  // The shift the page showed (#1141): a person swapped to another shift is never marked there.
  it("`observedShifts`: a registration that moved to another shift is not written, not logged, and comes back as moved", async () => {
    // The board showed r1 on s1; a swap has put it on s9 since.
    const moved = rows().map((r) => (r.id === "r1" ? { ...r, shiftId: "s9" } : r))
    for (const action of ["check_in", "undo_check_in", "mark_absent", "undo_absent"] as const) {
      const fake = fakeDb(moved.map((r) => ({ ...r })))
      const res = await send({ url: "/api/admin/events/evt-1/registrations/bulk", body: { action, registrationIds: ["r1"], observedShifts: { r1: "s1" } } }, fake)
      expect(res, action).toEqual({ status: 200, json: { done: 0, changedIds: [], skipped: 1, results: [{ id: "r1", changed: false, state: "expected", checkedInAt: null, moved: true }] } })
      expect(fake.updateMany).not.toHaveBeenCalled()
    }
    expect(logEvent).not.toHaveBeenCalled()
  })

  it("`observedShifts` matching the registration's shift changes nothing to the action, and the day-of request sends it", async () => {
    const fake = fakeDb(rows())
    const req = attendanceRequest("evt-1", "r1", "mark_absent", "s1")
    expect(req.body).toEqual({ action: "mark_absent", registrationIds: ["r1"], observedShifts: { r1: "s1" } })
    expect(await send(req, fake)).toEqual(changedAnswer("absent"))
    expect(fake.updateMany.mock.calls[0][0].where).toMatchObject({ id: "r1", shiftId: "s1" })
  })

  it("a malformed `observedShifts` is refused before anything is read", async () => {
    const fake = fakeDb(rows())
    const res = await send({ url: "/api/admin/events/evt-1/registrations/bulk", body: { action: "check_in", registrationIds: ["r1"], observedShifts: { r1: 3 } } }, fake)
    expect(res.status).toBe(400)
    expect(fake.updateMany).not.toHaveBeenCalled()
  })
})
