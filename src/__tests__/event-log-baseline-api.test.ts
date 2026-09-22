import { describe, it, expect, vi, beforeEach } from "vitest"

const requireOrgSessionMock = vi.hoisted(() => vi.fn())
vi.mock("@/lib/auth-guard", () => ({ requireOrgSession: requireOrgSessionMock }))

const eventFindFirst = vi.hoisted(() => vi.fn())
const logFindMany = vi.hoisted(() => vi.fn())
const logCreate = vi.hoisted(() => vi.fn())
vi.mock("@/lib/prisma", () => ({
  prisma: { eventLog: { findMany: logFindMany, create: logCreate } },
}))

function post() {
  return new Request("http://localhost/api/admin/events/evt-1/log/baseline", { method: "POST" })
}

const baseEvent = {
  id: "evt-1",
  title: "Kermesse",
  publicStatus: "published",
  startDate: new Date("2026-06-01T00:00:00.000Z"),
  endDate: new Date("2026-06-02T00:00:00.000Z"),
  createdAt: new Date("2026-01-10T09:00:00.000Z"),
  shifts: [
    {
      id: "shift-1", roleName: "Accueil", label: "Accueil", date: new Date("2026-06-01T00:00:00.000Z"),
      startTime: "10:00", endTime: "12:00", capacity: 3, status: "open",
      createdAt: new Date("2026-02-15T11:00:00.000Z"),
    },
  ],
  registrations: [
    { id: "reg-1", shiftId: "shift-1", status: "active", source: "public_form", createdAt: new Date("2026-03-20T14:30:00.000Z") },
  ],
  memberInvites: [{ id: "invite-1", sentAt: new Date("2026-03-18T08:00:00.000Z") }],
}

describe("POST /api/admin/events/[id]/log/baseline", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    requireOrgSessionMock.mockResolvedValue({
      db: { event: { findFirst: eventFindFirst } },
      organizationId: "org-a",
      session: { user: { id: "admin-1" } },
    })
    logCreate.mockResolvedValue({ id: "log-x" })
  })

  it("404s when the event is not found or not owned by the caller's org", async () => {
    eventFindFirst.mockResolvedValue(null)
    const { POST } = await import("@/app/api/admin/events/[id]/log/baseline/route")
    const res = await POST(post(), { params: Promise.resolve({ id: "evt-1" }) })
    expect(res.status).toBe(404)
    expect(logCreate).not.toHaveBeenCalled()
  })

  it("creates one baseline entry per entity that has no log entry yet", async () => {
    eventFindFirst.mockResolvedValue(baseEvent)
    logFindMany.mockResolvedValue([]) // nothing logged yet for this event
    const { POST } = await import("@/app/api/admin/events/[id]/log/baseline/route")
    const res = await POST(post(), { params: Promise.resolve({ id: "evt-1" }) })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ created: 4 }) // event + shift + registration + invite

    const actions = logCreate.mock.calls.map((c) => c[0].data.action)
    expect(actions.sort()).toEqual(["event.baseline", "memberinvite.baseline", "registration.baseline", "shift.baseline"])
    expect(logCreate.mock.calls.every((c) => c[0].data.actorType === "system")).toBe(true)
  })

  it("captures current field values as { from: null, to: value }", async () => {
    eventFindFirst.mockResolvedValue(baseEvent)
    logFindMany.mockResolvedValue([])
    const { POST } = await import("@/app/api/admin/events/[id]/log/baseline/route")
    await POST(post(), { params: Promise.resolve({ id: "evt-1" }) })

    const shiftCall = logCreate.mock.calls.find((c) => c[0].data.action === "shift.baseline")
    expect(shiftCall?.[0].data.changes).toMatchObject({
      capacity: { from: null, to: 3 },
      status: { from: null, to: "open" },
    })
  })

  it("backdates each baseline entry to the entity's own real creation date, not now", async () => {
    eventFindFirst.mockResolvedValue(baseEvent)
    logFindMany.mockResolvedValue([])
    const { POST } = await import("@/app/api/admin/events/[id]/log/baseline/route")
    await POST(post(), { params: Promise.resolve({ id: "evt-1" }) })

    const byAction = (action: string) => logCreate.mock.calls.find((c) => c[0].data.action === action)?.[0].data
    expect(byAction("event.baseline").createdAt).toEqual(baseEvent.createdAt)
    expect(byAction("shift.baseline").createdAt).toEqual(baseEvent.shifts[0].createdAt)
    expect(byAction("registration.baseline").createdAt).toEqual(baseEvent.registrations[0].createdAt)
    expect(byAction("memberinvite.baseline").createdAt).toEqual(baseEvent.memberInvites[0].sentAt)
  })

  it("is idempotent: skips entities that already have a log entry, real or baseline", async () => {
    eventFindFirst.mockResolvedValue(baseEvent)
    logFindMany.mockResolvedValue([{ entityId: "shift-1" }, { entityId: "reg-1" }, { entityId: "evt-1" }, { entityId: "invite-1" }])
    const { POST } = await import("@/app/api/admin/events/[id]/log/baseline/route")
    const res = await POST(post(), { params: Promise.resolve({ id: "evt-1" }) })
    expect(await res.json()).toEqual({ created: 0 })
    expect(logCreate).not.toHaveBeenCalled()
  })

  it("only backfills the entities still missing a log entry", async () => {
    eventFindFirst.mockResolvedValue(baseEvent)
    logFindMany.mockResolvedValue([{ entityId: "shift-1" }]) // shift already logged (real action, say)
    const { POST } = await import("@/app/api/admin/events/[id]/log/baseline/route")
    const res = await POST(post(), { params: Promise.resolve({ id: "evt-1" }) })
    expect(await res.json()).toEqual({ created: 3 })
    expect(logCreate.mock.calls.some((c) => c[0].data.entityId === "shift-1")).toBe(false)
  })
})
