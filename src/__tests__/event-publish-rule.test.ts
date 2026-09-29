import { describe, it, expect, vi, beforeEach } from "vitest"
import { isPublishing, publishBlocker, PUBLISH_WITHOUT_SHIFT_ERROR } from "@/lib/event-publish"

const requireOrgSessionMock = vi.hoisted(() => vi.fn())
vi.mock("@/lib/auth-guard", () => ({ requireOrgSession: requireOrgSessionMock }))
vi.mock("@/lib/event-log", () => ({ logEvent: vi.fn(), adminActor: () => ({ type: "admin", id: "a" }), diffFields: () => null }))
vi.mock("@/lib/org-log", () => ({ diffFields: () => null }))
vi.mock("@/lib/prisma", () => ({ prisma: {} }))

// Publication needs at least one live shift, enforced by the API for every interface.
describe("publishBlocker", () => {
  it("blocks without a live shift, allows otherwise", async () => {
    const db = { shift: { count: vi.fn().mockResolvedValue(0) } }
    expect(await publishBlocker(db, "e")).toBe(PUBLISH_WITHOUT_SHIFT_ERROR)
    expect(db.shift.count).toHaveBeenCalledWith({ where: { eventId: "e", status: { not: "cancelled" } } })
    db.shift.count.mockResolvedValue(2)
    expect(await publishBlocker(db, "e")).toBeNull()
    expect(isPublishing("draft", "published")).toBe(true)
    expect(isPublishing("published", "published")).toBe(false)
    expect(isPublishing("published", "draft")).toBe(false)
  })
})

describe("PATCH /api/admin/events/[id] — publication rule", () => {
  const update = vi.fn()
  const count = vi.fn()
  const patch = (body: unknown) =>
    new Request("http://localhost/api/admin/events/evt-a", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
  const params = { params: Promise.resolve({ id: "evt-a" }) }

  beforeEach(() => {
    vi.clearAllMocks()
    update.mockImplementation(async ({ data }: { data: object }) => ({ id: "evt-a", publicStatus: "draft", ...data }))
    requireOrgSessionMock.mockResolvedValue({
      db: {
        event: { findFirst: vi.fn().mockResolvedValue({ id: "evt-a", title: "F", publicStatus: "draft", startDate: new Date(), endDate: new Date(), publicInstructions: null, remindersEnabled: true, requirePhone: false }), update },
        shift: { count },
      },
      organizationId: "org-a", session: {},
    })
  })

  it("answers 409 with the rule when publishing an event without shifts, and nothing is saved", async () => {
    count.mockResolvedValue(0)
    const { PATCH } = await import("@/app/api/admin/events/[id]/route")
    const res = await PATCH(patch({ publicStatus: "published" }), params)
    expect(res.status).toBe(409)
    expect((await res.json()).error).toBe(PUBLISH_WITHOUT_SHIFT_ERROR)
    expect(update).not.toHaveBeenCalled()
  })

  it("publishes once a shift exists, and never blocks other edits", async () => {
    count.mockResolvedValue(1)
    const { PATCH } = await import("@/app/api/admin/events/[id]/route")
    expect((await PATCH(patch({ publicStatus: "published" }), params)).status).toBe(200)
    count.mockResolvedValue(0)
    expect((await PATCH(patch({ title: "Nouveau titre" }), params)).status).toBe(200)
    expect((await PATCH(patch({ publicStatus: "draft" }), params)).status).toBe(200)
  })

  it("keeps internal error details out of the response", async () => {
    count.mockResolvedValue(1)
    update.mockRejectedValue(new Error("PrismaClientKnownRequestError: relation \"Event\" violates constraint"))
    const { PATCH } = await import("@/app/api/admin/events/[id]/route")
    const res = await PATCH(patch({ title: "x" }), params)
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body).toEqual({ error: "Erreur serveur" })
  })
})

describe("POST /api/admin/events — publication rule", () => {
  it("refuses to create an event already published", async () => {
    const create = vi.fn()
    requireOrgSessionMock.mockResolvedValue({ db: { event: { findFirst: vi.fn().mockResolvedValue(null), create } }, organizationId: "org-a", session: {} })
    const { POST } = await import("@/app/api/admin/events/route")
    const res = await POST(new Request("http://localhost/api/admin/events", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: "F", startDate: "2026-07-04", endDate: "2026-07-04", publicStatus: "published" }) }))
    expect(res.status).toBe(409)
    expect(create).not.toHaveBeenCalled()
  })
})
