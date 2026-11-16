import { describe, it, expect, vi, beforeEach } from "vitest"

// Admin routes: strict input on the reorder routes, the places and the workload preview offered
// only where the workload protection is, and no workload lock taken on an event of another
// organisation.

const m = vi.hoisted(() => ({
  guard: vi.fn(),
  canAdopt: vi.fn(),
  shipped: vi.fn(),
  rateLimit: vi.fn(),
}))
vi.mock("@/lib/auth-guard", () => ({ requireOrgSession: m.guard }))
vi.mock("@/lib/beta-access", () => ({ canAdoptBeta: m.canAdopt }))
vi.mock("@/lib/workload-shipped", () => ({ workloadProtectionShipped: m.shipped }))
vi.mock("@/lib/rate-limit", () => ({ rateLimit: m.rateLimit }))
vi.mock("@/lib/event-log", () => ({ logEvent: vi.fn(), adminActor: () => ({ type: "admin", id: "adm-1" }) }))

const json = (body: unknown) => new Request("http://localhost/x", { method: "POST", headers: { "Content-Type": "application/json" }, body: typeof body === "string" ? body : JSON.stringify(body) })
const params = (id = "evt-a") => ({ params: Promise.resolve({ id }) })

function withDb(event: object | null) {
  const db = {
    event: { findFirst: vi.fn().mockResolvedValue(event) },
    eventPage: { updateMany: vi.fn() },
    shift: { updateMany: vi.fn(), findMany: vi.fn().mockResolvedValue([]) },
    eventPlace: { findMany: vi.fn().mockResolvedValue([]), create: vi.fn(async ({ data }: { data: object }) => ({ id: "pl-1", archivedAt: null, ...data })), update: vi.fn() },
    registration: { findMany: vi.fn().mockResolvedValue([]) },
  }
  m.guard.mockResolvedValue({ db, organizationId: "org-a", session: { user: { id: "adm-1" } } })
  return db
}

beforeEach(() => {
  vi.clearAllMocks()
  m.shipped.mockReturnValue(true)
  m.canAdopt.mockResolvedValue(false)
  m.rateLimit.mockResolvedValue({ ok: true, remaining: 10, retryAfter: 0 })
})

describe("reorder routes take a bounded list of ids only", () => {
  it.each([
    ["an object item", { pageIds: [{ not: "zzz" }] }],
    ["a number item", { pageIds: [1, 2] }],
    ["more than 200 items", { pageIds: Array.from({ length: 201 }, (_, i) => `pg-${i}`) }],
    ["an over-long id", { pageIds: ["x".repeat(65)] }],
    ["no list", {}],
  ])("pages/reorder answers 400 for %s and writes nothing", async (_label, body) => {
    const db = withDb({ id: "evt-a" })
    const { POST } = await import("@/app/api/admin/events/[id]/pages/reorder/route")
    expect((await POST(json(body), params())).status).toBe(400)
    expect(db.eventPage.updateMany).not.toHaveBeenCalled()
  })

  it("pages/reorder answers 400 for a body that is not JSON", async () => {
    withDb({ id: "evt-a" })
    const { POST } = await import("@/app/api/admin/events/[id]/pages/reorder/route")
    expect((await POST(json("{"), params())).status).toBe(400)
  })

  it.each([
    ["an object item", { roleOrder: [{ contains: "" }] }],
    ["an empty name", { roleOrder: [""] }],
    ["more than 200 items", { roleOrder: Array.from({ length: 201 }, (_, i) => `Poste ${i}`) }],
    ["no list", { roleOrder: "Bar" }],
  ])("reorder-roles answers 400 for %s and writes nothing", async (_label, body) => {
    const db = withDb({ id: "evt-a" })
    const { POST } = await import("@/app/api/admin/events/[id]/reorder-roles/route")
    expect((await POST(json(body), params())).status).toBe(400)
    expect(db.shift.updateMany).not.toHaveBeenCalled()
  })

  it("reorder-roles still orders the postes of a valid list, 100 apart", async () => {
    const db = withDb({ id: "evt-a" })
    const { POST } = await import("@/app/api/admin/events/[id]/reorder-roles/route")
    expect((await POST(json({ roleOrder: ["Bar", "Accueil"] }), params())).status).toBe(200)
    expect(db.shift.updateMany.mock.calls.map((c) => [c[0].where.roleName, c[0].data.displayOrder])).toEqual([["Bar", 0], ["Accueil", 100]])
  })
})

describe("places and the workload preview follow the workload protection's beta gate", () => {
  it("refuses the places of an event without protection when the organisation may not adopt it", async () => {
    const db = withDb({ id: "evt-a", workloadProtectionEnabled: false })
    const { GET, POST } = await import("@/app/api/admin/events/[id]/places/route")
    const one = await import("@/app/api/admin/events/[id]/places/[placeId]/route")
    expect((await GET(new Request("http://localhost/x"), params())).status).toBe(403)
    expect((await POST(json({ name: "Halle des fêtes" }), params())).status).toBe(403)
    const patch = new Request("http://localhost/x", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: "Hall" }) })
    expect((await one.PATCH(patch, { params: Promise.resolve({ id: "evt-a", placeId: "pl-1" }) })).status).toBe(403)
    expect(m.canAdopt).toHaveBeenCalledWith("org-a", "workloadProtection")
    expect(db.eventPlace.create).not.toHaveBeenCalled()
    expect(db.eventPlace.update).not.toHaveBeenCalled()
  })

  it("refuses them while the capability is not shipped, whatever the organisation", async () => {
    m.shipped.mockReturnValue(false)
    m.canAdopt.mockResolvedValue(true)
    withDb({ id: "evt-a", workloadProtectionEnabled: false })
    const { POST } = await import("@/app/api/admin/events/[id]/places/route")
    expect((await POST(json({ name: "Halle des fêtes" }), params())).status).toBe(403)
  })

  it("keeps them for an event that already has protection on, and for an organisation that may adopt it", async () => {
    const { POST } = await import("@/app/api/admin/events/[id]/places/route")
    withDb({ id: "evt-a", workloadProtectionEnabled: true })
    expect((await POST(json({ name: "Halle des fêtes" }), params())).status).toBe(201)
    expect(m.canAdopt).not.toHaveBeenCalled()
    m.canAdopt.mockResolvedValue(true)
    withDb({ id: "evt-a", workloadProtectionEnabled: false })
    expect((await POST(json({ name: "Chapiteau" }), params())).status).toBe(201)
  })

  it("still answers 404, not 403, for an event of another organisation", async () => {
    withDb(null)
    const { POST } = await import("@/app/api/admin/events/[id]/places/route")
    expect((await POST(json({ name: "Halle des fêtes" }), params("evt-b"))).status).toBe(404)
    expect(m.canAdopt).not.toHaveBeenCalled()
  })

  it("refuses the workload preview where protection is not offered, and bounds it per organisation", async () => {
    withDb({ id: "evt-a", workloadProtectionEnabled: false })
    const { POST } = await import("@/app/api/admin/events/[id]/workload-policy/preview/route")
    expect((await POST(json({ values: {} }), params())).status).toBe(403)
    expect(m.rateLimit).not.toHaveBeenCalled()
    withDb({ id: "evt-a", workloadProtectionEnabled: true })
    m.rateLimit.mockResolvedValue({ ok: false, remaining: 0, retryAfter: 60 })
    expect((await POST(json({ values: {} }), params())).status).toBe(429)
    expect(m.rateLimit).toHaveBeenCalledWith("org:org-a", "workload-preview", expect.any(Number), expect.any(Number))
  })
})

describe("workload policy write: no lock before the ownership check", () => {
  it("answers 404 for an event of another organisation without taking the event's workload lock", async () => {
    const { setWorkloadPolicy } = await import("@/lib/workload-policy-data")
    const tx = { event: { findFirst: vi.fn().mockResolvedValue(null), update: vi.fn() }, $executeRaw: vi.fn() }
    const db = { $transaction: (fn: (t: typeof tx) => unknown) => fn(tx) }
    const result = await setWorkloadPolicy(db, "org-a", "evt-b", { enabled: false })
    expect(result).toMatchObject({ ok: false, status: 404 })
    expect(tx.$executeRaw).not.toHaveBeenCalled()
    expect(tx.event.update).not.toHaveBeenCalled()
  })

  it("takes the lock after the scoped read, then reads the event again", async () => {
    const { setWorkloadPolicy } = await import("@/lib/workload-policy-data")
    const order: string[] = []
    const tx = {
      event: {
        findFirst: vi.fn(async () => { order.push("read"); return { id: "evt-a", workloadProtectionEnabled: false, workloadPolicy: null, organization: { timeZone: null }, startDate: new Date("2030-06-01"), endDate: new Date("2030-06-01") } }),
        update: vi.fn(),
      },
      $executeRaw: vi.fn(async () => { order.push("lock") }),
    }
    const db = { $transaction: (fn: (t: typeof tx) => unknown) => fn(tx) }
    expect(await setWorkloadPolicy(db, "org-a", "evt-a", { enabled: false })).toMatchObject({ ok: true })
    expect(order).toEqual(["read", "lock", "read"])
  })
})
