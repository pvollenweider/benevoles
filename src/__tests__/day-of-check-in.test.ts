import { describe, it, expect, vi, beforeEach } from "vitest"

// « Jour J » (#561): a tap on « Présent » must behave exactly like « Marquer présents » on the
// registrations list (#399): same route, same rule (confirmed registrations only), same event log
// entries. Runs the real bulk route and the real setPresence on a fake org-scoped client.

const requireOrgSessionMock = vi.hoisted(() => vi.fn())
vi.mock("@/lib/auth-guard", () => ({ requireOrgSession: requireOrgSessionMock }))
vi.mock("@/lib/prisma", () => ({ prisma: {} }))
const logEvent = vi.hoisted(() => vi.fn().mockResolvedValue("log-1"))
vi.mock("@/lib/event-log", () => ({ logEvent, adminActor: () => ({ type: "admin", id: "adm-1" }) }))
vi.mock("@/lib/notifications", () => ({ sendNotification: vi.fn() }))
vi.mock("@/lib/waitlist", () => ({ promoteNextInWaitlist: vi.fn() }))
vi.mock("@/lib/sector-leaders", () => ({ tagVolunteerAsResponsable: vi.fn() }))
vi.mock("@/lib/notifications/outbox", () => ({ enqueueNotifications: vi.fn(), deliverAfterResponse: vi.fn() }))

import { presenceRequest } from "@/lib/day-of"

type Row = { id: string; eventId: string; shiftId: string; status: string; checkedInAt: Date | null }

function fakeDb(rows: Row[]) {
  const updateMany = vi.fn(async ({ where, data }: { where: { id: string; status: string; checkedInAt: null | { not: null } }; data: { checkedInAt: Date | null } }) => {
    const r = rows.find((x) => x.id === where.id && x.status === where.status && (where.checkedInAt === null ? x.checkedInAt === null : x.checkedInAt !== null))
    if (!r) return { count: 0 }
    r.checkedInAt = data.checkedInAt
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
    expect(await send(listRequest("r1", true), fromList)).toEqual({ status: 200, json: { done: 1, changedIds: ["r1"], skipped: 0 } })
    expect(await send(listRequest("r1", false), fromList)).toEqual({ status: 200, json: { done: 1, changedIds: ["r1"], skipped: 0 } })
    const listLog = loggedActions()
    logEvent.mockClear()

    const fromDayOf = fakeDb(rows())
    expect(await send(presenceRequest("evt-1", "r1", true), fromDayOf)).toEqual({ status: 200, json: { done: 1, changedIds: ["r1"], skipped: 0 } })
    expect(await send(presenceRequest("evt-1", "r1", false), fromDayOf)).toEqual({ status: 200, json: { done: 1, changedIds: ["r1"], skipped: 0 } })
    expect(loggedActions()).toEqual(listLog)
    expect(listLog.map((e) => e.action)).toEqual(["registration.checked_in", "registration.check_in_undone"])
  })

  it("only confirmed registrations: a waitlist entry is left alone and nothing is logged", async () => {
    const fake = fakeDb(rows())
    expect(await send(presenceRequest("evt-1", "r2", true), fake)).toEqual({ status: 200, json: { done: 0, changedIds: [], skipped: 1 } })
    expect(fake.updateMany).not.toHaveBeenCalled()
    expect(logEvent).not.toHaveBeenCalled()
  })

  it("a second tap on someone already present changes nothing and logs nothing", async () => {
    const fake = fakeDb(rows())
    await send(presenceRequest("evt-1", "r1", true), fake)
    logEvent.mockClear()
    expect(await send(presenceRequest("evt-1", "r1", true), fake)).toEqual({ status: 200, json: { done: 0, changedIds: [], skipped: 1 } })
    expect(logEvent).not.toHaveBeenCalled()
  })
})
