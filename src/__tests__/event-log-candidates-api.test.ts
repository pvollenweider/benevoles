import { describe, it, expect, vi, beforeEach } from "vitest"

const requireOrgSessionMock = vi.hoisted(() => vi.fn())
vi.mock("@/lib/auth-guard", () => ({ requireOrgSession: requireOrgSessionMock }))

const listReplayCandidates = vi.hoisted(() => vi.fn())
const listStoryCandidates = vi.hoisted(() => vi.fn())
vi.mock("@/lib/event-log-read", () => ({ listReplayCandidates, listStoryCandidates }))

function get(path: string) {
  return new Request(`http://localhost${path}`)
}

describe("GET /api/admin/events/[id]/log/candidates", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    requireOrgSessionMock.mockResolvedValue({
      db: { event: { findFirst: vi.fn().mockResolvedValue({ id: "evt-1" }) } },
      organizationId: "org-a",
      session: { user: { id: "admin-1" } },
    })
  })

  it("404s when the event does not belong to the caller's org", async () => {
    requireOrgSessionMock.mockResolvedValue({
      db: { event: { findFirst: vi.fn().mockResolvedValue(null) } },
      organizationId: "org-a",
      session: { user: { id: "admin-1" } },
    })
    const { GET } = await import("@/app/api/admin/events/[id]/log/candidates/route")
    const res = await GET(get("/api/admin/events/evt-1/log/candidates"), { params: Promise.resolve({ id: "evt-1" }) })
    expect(res.status).toBe(404)
  })

  it("defaults to replay candidates", async () => {
    listReplayCandidates.mockResolvedValue([{ entityType: "Shift", entityId: "s1", label: "Bar", count: 3 }])
    const { GET } = await import("@/app/api/admin/events/[id]/log/candidates/route")
    const res = await GET(get("/api/admin/events/evt-1/log/candidates"), { params: Promise.resolve({ id: "evt-1" }) })
    expect(await res.json()).toEqual({ candidates: [{ entityType: "Shift", entityId: "s1", label: "Bar", count: 3 }] })
    expect(listReplayCandidates).toHaveBeenCalledWith("evt-1")
    expect(listStoryCandidates).not.toHaveBeenCalled()
  })

  it("routes ?kind=story to listStoryCandidates", async () => {
    listStoryCandidates.mockResolvedValue([{ logId: "log-1", label: "Alain · 3 étapes", entryCount: 3 }])
    const { GET } = await import("@/app/api/admin/events/[id]/log/candidates/route")
    const res = await GET(get("/api/admin/events/evt-1/log/candidates?kind=story"), { params: Promise.resolve({ id: "evt-1" }) })
    expect(await res.json()).toEqual({ candidates: [{ logId: "log-1", label: "Alain · 3 étapes", entryCount: 3 }] })
    expect(listStoryCandidates).toHaveBeenCalledWith("evt-1")
    expect(listReplayCandidates).not.toHaveBeenCalled()
  })
})
