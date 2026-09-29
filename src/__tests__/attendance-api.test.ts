import { describe, it, expect, vi, beforeEach } from "vitest"

const requireOrgSessionMock = vi.hoisted(() => vi.fn())
vi.mock("@/lib/auth-guard", () => ({ requireOrgSession: requireOrgSessionMock }))
vi.mock("@/lib/prisma", () => ({ prisma: {} }))

const logEvent = vi.hoisted(() => vi.fn().mockResolvedValue("log-1"))
vi.mock("@/lib/event-log", () => ({ logEvent, adminActor: () => ({ type: "admin", id: "adm-1" }) }))
vi.mock("@/lib/notifications", () => ({ sendNotification: vi.fn() }))
vi.mock("@/lib/waitlist", () => ({ promoteNextInWaitlist: vi.fn() }))
vi.mock("@/lib/sector-leaders", () => ({ tagVolunteerAsResponsable: vi.fn() }))
vi.mock("@/lib/notifications/outbox", () => ({ enqueueNotifications: vi.fn(), deliverAfterResponse: vi.fn() }))

// Lightweight check-in (#399).
describe("GET /api/admin/events/[id]/export/attendance", () => {
  const event = {
    id: "evt-a", title: "Fête d'été", slug: "fete", organization: { timeZone: "Europe/Zurich" },
    registrations: [
      { phone: null, checkedInAt: new Date("2026-07-04T08:05:00Z"), volunteer: { firstName: "Alice", lastName: "Martin", email: "a@x.ch", phone: "079 1" }, shift: { roleName: "Bar", label: "Bar", date: new Date("2026-07-04T00:00:00Z"), startTime: "10:00", endTime: "12:00" } },
      { phone: "078 2", checkedInAt: null, volunteer: { firstName: "Bob", lastName: "Durand", email: null, phone: null }, shift: { roleName: "Bar", label: "Bar soir", date: new Date("2026-07-04T00:00:00Z"), startTime: "18:00", endTime: "20:00" } },
    ],
  }

  it("streams a CSV attachment of the confirmed registrations", async () => {
    requireOrgSessionMock.mockResolvedValue({ db: { event: { findFirst: vi.fn().mockResolvedValue(event) } }, organizationId: "org-a", session: {} })
    const { GET } = await import("@/app/api/admin/events/[id]/export/attendance/route")
    const res = await GET(new Request("http://localhost/api/admin/events/evt-a/export/attendance"), { params: Promise.resolve({ id: "evt-a" }) })
    expect(res.status).toBe(200)
    expect(res.headers.get("Content-Type")).toContain("text/csv")
    expect(res.headers.get("Content-Disposition")).toBe('attachment; filename="presences-fete-d-ete.csv"')
    const lines = (await res.text()).split("\r\n")
    expect(lines[1]).toBe("Alice;Martin;a@x.ch;079 1;Bar;;2026-07-04;10:00;12:00;oui;04.07.2026 10:05")
    expect(lines[2]).toBe("Bob;Durand;;078 2;Bar;Bar soir;2026-07-04;18:00;20:00;non;")
  })

  it("returns 404 for an event outside the organization", async () => {
    requireOrgSessionMock.mockResolvedValue({ db: { event: { findFirst: vi.fn().mockResolvedValue(null) } }, organizationId: "org-a", session: {} })
    const { GET } = await import("@/app/api/admin/events/[id]/export/attendance/route")
    const res = await GET(new Request("http://localhost/api/admin/events/evt-b/export/attendance"), { params: Promise.resolve({ id: "evt-b" }) })
    expect(res.status).toBe(404)
  })
})

describe("setPresence", () => {
  const updateMany = vi.fn()
  beforeEach(() => {
    vi.clearAllMocks()
    updateMany.mockResolvedValue({ count: 1 })
  })
  const target = (id: string, status = "active") => ({ id, eventId: "evt-a", shiftId: "s1", status })

  it("marks confirmed rows present once each and logs them; other statuses skipped", async () => {
    const { setPresence } = await import("@/lib/admin-registration-actions")
    const now = new Date("2026-07-04T08:05:00Z")
    const db = { registration: { updateMany } }
    updateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 })
    const changed = await setPresence(db as never, { type: "admin", id: "adm-1" } as never, [target("r1"), target("r2"), target("r3", "waiting")], true, now)
    expect(changed).toEqual(["r1"])
    expect(updateMany).toHaveBeenCalledTimes(2)
    expect(updateMany.mock.calls[0][0]).toEqual({ where: { id: "r1", status: "active", checkedInAt: null }, data: { checkedInAt: now } })
    expect(logEvent).toHaveBeenCalledTimes(1)
    expect(logEvent.mock.calls[0][0]).toMatchObject({ action: "registration.checked_in", entityId: "r1" })
  })

  it("undoes only rows that were marked", async () => {
    const { setPresence } = await import("@/lib/admin-registration-actions")
    const db = { registration: { updateMany } }
    await setPresence(db as never, { type: "admin", id: "adm-1" } as never, [target("r1")], false)
    expect(updateMany.mock.calls[0][0]).toEqual({ where: { id: "r1", status: "active", checkedInAt: { not: null } }, data: { checkedInAt: null } })
    expect(logEvent.mock.calls[0][0]).toMatchObject({ action: "registration.check_in_undone" })
  })
})
