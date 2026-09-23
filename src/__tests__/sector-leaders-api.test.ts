import { describe, it, expect, vi, beforeEach } from "vitest"

const requireOrgSessionMock = vi.hoisted(() => vi.fn())
vi.mock("@/lib/auth-guard", () => ({ requireOrgSession: requireOrgSessionMock }))

const findMany = vi.hoisted(() => vi.fn())
const findFirst = vi.hoisted(() => vi.fn())
const create = vi.hoisted(() => vi.fn())
const logCreate = vi.hoisted(() => vi.fn())
const volunteerFindFirst = vi.hoisted(() => vi.fn())
const volunteerUpdate = vi.hoisted(() => vi.fn())
vi.mock("@/lib/prisma", () => ({
  prisma: {
    sectorLeader: { findMany, findFirst, create },
    eventLog: { create: logCreate },
    volunteer: { findFirst: volunteerFindFirst, update: volunteerUpdate },
  },
}))

const sendNotificationMock = vi.hoisted(() => vi.fn())
vi.mock("@/lib/notifications", () => ({ sendNotification: sendNotificationMock }))

function get() {
  return new Request("http://localhost/api/admin/events/evt-1/sector-leaders")
}
function post(body: unknown) {
  return new Request("http://localhost/api/admin/events/evt-1/sector-leaders", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

describe("GET/POST /api/admin/events/[id]/sector-leaders", () => {
  let eventFindFirst: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.clearAllMocks()
    eventFindFirst = vi.fn().mockResolvedValue({ title: "Festival", organization: { slug: "org-a" } })
    requireOrgSessionMock.mockResolvedValue({
      db: { event: { findFirst: eventFindFirst } },
      organizationId: "org-a",
      session: { user: { id: "admin-1" } },
    })
    logCreate.mockResolvedValue({ id: "log-1" })
    sendNotificationMock.mockResolvedValue({ ok: true })
    volunteerFindFirst.mockResolvedValue(null)
  })

  it("GET 404s when the event isn't owned by the caller's org", async () => {
    eventFindFirst.mockResolvedValue(null)
    const { GET } = await import("@/app/api/admin/events/[id]/sector-leaders/route")
    const res = await GET(get(), { params: Promise.resolve({ id: "evt-1" }) })
    expect(res.status).toBe(404)
  })

  it("GET lists leaders ordered by role then creation date", async () => {
    findMany.mockResolvedValue([{ id: "l1", roleName: "Bar", name: "Alice", email: "a@x.com" }])
    const { GET } = await import("@/app/api/admin/events/[id]/sector-leaders/route")
    const res = await GET(get(), { params: Promise.resolve({ id: "evt-1" }) })
    expect(res.status).toBe(200)
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { eventId: "evt-1" }, orderBy: [{ roleName: "asc" }, { createdAt: "asc" }] }),
    )
  })

  it("POST rejects an invalid email", async () => {
    const { POST } = await import("@/app/api/admin/events/[id]/sector-leaders/route")
    const res = await POST(post({ roleName: "Bar", name: "Alice", email: "not-an-email" }), { params: Promise.resolve({ id: "evt-1" }) })
    expect(res.status).toBe(400)
    expect(create).not.toHaveBeenCalled()
  })

  it("POST 409s when the same person is already responsible for that role", async () => {
    findFirst.mockResolvedValue({ id: "l1" })
    const { POST } = await import("@/app/api/admin/events/[id]/sector-leaders/route")
    const res = await POST(post({ roleName: "Bar", name: "Alice", email: "a@x.com" }), { params: Promise.resolve({ id: "evt-1" }) })
    expect(res.status).toBe(409)
    expect(create).not.toHaveBeenCalled()
  })

  it("POST creates a leader, logs it without PII, and sends the invite email", async () => {
    findFirst.mockResolvedValue(null)
    create.mockResolvedValue({ id: "l2", eventId: "evt-1", roleName: "Bar", name: "Alice", email: "a@x.com", token: "tok123" })
    const { POST } = await import("@/app/api/admin/events/[id]/sector-leaders/route")
    const res = await POST(post({ roleName: "Bar", name: "Alice", email: "a@x.com" }), { params: Promise.resolve({ id: "evt-1" }) })
    expect(res.status).toBe(201)

    const logged = JSON.stringify(logCreate.mock.calls[0][0])
    expect(logged).not.toContain("Alice")
    expect(logged).not.toContain("a@x.com")
    expect(logCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: "sectorleader.added", entityType: "SectorLeader" }) }),
    )

    expect(sendNotificationMock).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "sector_leader_invite", recipient: { email: "a@x.com", name: "Alice" } }),
    )
  })

  it("POST tags the matching volunteer as 'responsable' in the member pool", async () => {
    findFirst.mockResolvedValue(null)
    create.mockResolvedValue({ id: "l2", eventId: "evt-1", roleName: "Bar", name: "Alice", email: "a@x.com", token: "tok123" })
    volunteerFindFirst.mockResolvedValue({ id: "vol-1", tags: ["cuisine"] })
    const { POST } = await import("@/app/api/admin/events/[id]/sector-leaders/route")
    await POST(post({ roleName: "Bar", name: "Alice", email: "a@x.com" }), { params: Promise.resolve({ id: "evt-1" }) })

    expect(volunteerFindFirst).toHaveBeenCalledWith({ where: { organizationId: "org-a", email: "a@x.com" } })
    expect(volunteerUpdate).toHaveBeenCalledWith({ where: { id: "vol-1" }, data: { tags: { push: "responsable" } } })
  })
})
