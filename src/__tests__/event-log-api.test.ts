import { describe, it, expect, vi, beforeEach } from "vitest"

const requireOrgSessionMock = vi.hoisted(() => vi.fn())
vi.mock("@/lib/auth-guard", () => ({ requireOrgSession: requireOrgSessionMock }))

const listEventLogs = vi.hoisted(() => vi.fn())
const getCausalChain = vi.hoisted(() => vi.fn())
vi.mock("@/lib/event-log-read", () => ({ listEventLogs, getCausalChain }))

function get(path: string) {
  return new Request(`http://localhost${path}`)
}

describe("GET /api/admin/events/[id]/log", () => {
  let findFirst: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.clearAllMocks()
    findFirst = vi.fn().mockResolvedValue({ id: "evt-1" })
    requireOrgSessionMock.mockResolvedValue({
      db: { event: { findFirst } },
      organizationId: "org-a",
      session: { user: { id: "admin-1" } },
    })
  })

  it("404s when the event does not belong to the caller's org", async () => {
    findFirst.mockResolvedValue(null)
    const { GET } = await import("@/app/api/admin/events/[id]/log/route")
    const res = await GET(get("/api/admin/events/evt-1/log"), { params: Promise.resolve({ id: "evt-1" }) })
    expect(res.status).toBe(404)
    expect(listEventLogs).not.toHaveBeenCalled()
  })

  it("passes query filters through to listEventLogs", async () => {
    listEventLogs.mockResolvedValue({ entries: [], nextCursor: null, shiftLabels: {} })
    const { GET } = await import("@/app/api/admin/events/[id]/log/route")
    await GET(
      get("/api/admin/events/evt-1/log?entityType=Shift&entityId=shift-1&actorType=admin&action=shift&limit=10"),
      { params: Promise.resolve({ id: "evt-1" }) },
    )
    expect(listEventLogs).toHaveBeenCalledWith(
      "evt-1",
      expect.objectContaining({ entityType: "Shift", entityId: "shift-1", actorType: "admin", action: "shift", limit: 10 }),
    )
  })

  it("routes ?chainOf= to getCausalChain instead of the filtered list", async () => {
    getCausalChain.mockResolvedValue({ entries: [{ id: "log-1", eventId: "evt-1" }], shiftLabels: {} })
    const { GET } = await import("@/app/api/admin/events/[id]/log/route")
    const res = await GET(get("/api/admin/events/evt-1/log?chainOf=log-1"), { params: Promise.resolve({ id: "evt-1" }) })
    expect(res.status).toBe(200)
    expect(getCausalChain).toHaveBeenCalledWith("log-1")
    expect(listEventLogs).not.toHaveBeenCalled()
  })

  it("refuses a chain that belongs to a different event (cross-tenant guard)", async () => {
    getCausalChain.mockResolvedValue({ entries: [{ id: "log-1", eventId: "some-other-event" }], shiftLabels: {} })
    const { GET } = await import("@/app/api/admin/events/[id]/log/route")
    const res = await GET(get("/api/admin/events/evt-1/log?chainOf=log-1"), { params: Promise.resolve({ id: "evt-1" }) })
    expect(res.status).toBe(404)
  })
})
