import { describe, it, expect, vi, beforeEach } from "vitest"

const requireOrgSessionMock = vi.hoisted(() => vi.fn())
vi.mock("@/lib/auth-guard", () => ({ requireOrgSession: requireOrgSessionMock }))
const logEvent = vi.hoisted(() => vi.fn().mockResolvedValue("log-1"))
vi.mock("@/lib/event-log", () => ({ logEvent, adminActor: () => ({ type: "admin", id: "a" }), diffFields: (a: Record<string, unknown>, b: Record<string, unknown>, f: string[]) => {
  const out: Record<string, { from: unknown; to: unknown }> = {}
  for (const k of f) if (a[k] !== b[k]) out[k] = { from: a[k], to: b[k] }
  return Object.keys(out).length ? out : null
} }))
vi.mock("@/lib/org-log", () => ({ diffFields: () => null }))
const getHeader = vi.hoisted(() => vi.fn())
vi.mock("next/headers", () => ({ headers: () => Promise.resolve({ get: getHeader }) }))
const publicFindMany = vi.hoisted(() => vi.fn())
vi.mock("@/lib/prisma", () => ({ prisma: { event: { findMany: publicFindMany } } }))

// Unlisted events (#414).
describe("PATCH /api/admin/events/[id] — isListed", () => {
  const update = vi.fn()
  const patch = (body: unknown) =>
    new Request("http://localhost/api/admin/events/evt-a", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
  const params = { params: Promise.resolve({ id: "evt-a" }) }
  const owned = { id: "evt-a", title: "F", publicStatus: "published", isListed: true, startDate: new Date(0), endDate: new Date(0), publicInstructions: null, remindersEnabled: true, requirePhone: false }

  beforeEach(() => {
    vi.clearAllMocks()
    update.mockImplementation(async ({ data }: { data: object }) => ({ ...owned, ...data }))
    requireOrgSessionMock.mockResolvedValue({ db: { event: { findFirst: vi.fn().mockResolvedValue(owned), update }, shift: { count: vi.fn().mockResolvedValue(1) } }, organizationId: "org-a", session: {} })
  })

  it("lets an admin unlist and relist an event, logging the visibility change", async () => {
    const { PATCH } = await import("@/app/api/admin/events/[id]/route")
    const res = await PATCH(patch({ isListed: false }), params)
    expect(res.status).toBe(200)
    expect(update.mock.calls[0][0].data).toEqual({ isListed: false })
    expect(logEvent.mock.calls[0][0]).toMatchObject({ action: "event.updated", changes: { isListed: { from: true, to: false } } })
  })

  it("refuses anything but a boolean, and never lets isListed publish an event", async () => {
    const { PATCH } = await import("@/app/api/admin/events/[id]/route")
    expect((await PATCH(patch({ isListed: "yes" }), params)).status).toBe(400)
    expect((await PATCH(patch({ isListed: 1 }), params)).status).toBe(400)
    expect(update).not.toHaveBeenCalled()
  })

  // The « Rappels automatiques » box of the event form saves through the same PATCH.
  it("saves and logs remindersEnabled from the event form, refusing a non-boolean", async () => {
    const { PATCH } = await import("@/app/api/admin/events/[id]/route")
    expect((await PATCH(patch({ remindersEnabled: "no" }), params)).status).toBe(400)
    expect(update).not.toHaveBeenCalled()
    const res = await PATCH(patch({ remindersEnabled: false }), params)
    expect(res.status).toBe(200)
    expect(update.mock.calls[0][0].data).toEqual({ remindersEnabled: false })
    expect(logEvent.mock.calls[0][0]).toMatchObject({ action: "event.updated", changes: { remindersEnabled: { from: true, to: false } } })
  })
})

describe("GET /api/public/events — listed events of one organization", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    publicFindMany.mockResolvedValue([])
  })

  it("filters on published + listed, scoped to the host's organization", async () => {
    getHeader.mockImplementation((n: string) => (n === "x-org-slug" ? "fete" : null))
    const { GET } = await import("@/app/api/public/events/route")
    const res = await GET(new Request("http://localhost/api/public/events"))
    expect(res.status).toBe(200)
    expect(publicFindMany.mock.calls[0][0].where).toEqual({ publicStatus: "published", isListed: true, organization: { slug: "fete", active: true } })
  })

  it("accepts ?org= and refuses a request without organization: no list across tenants", async () => {
    getHeader.mockReturnValue(null)
    const { GET } = await import("@/app/api/public/events/route")
    expect((await GET(new Request("http://localhost/api/public/events"))).status).toBe(404)
    expect(publicFindMany).not.toHaveBeenCalled()
    expect((await GET(new Request("http://localhost/api/public/events?org=fete"))).status).toBe(200)
    expect(publicFindMany.mock.calls[0][0].where.organization).toEqual({ slug: "fete", active: true })
  })
})
