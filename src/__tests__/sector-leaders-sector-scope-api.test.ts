import { describe, it, expect, vi, beforeEach } from "vitest"
import { prisma as prismaMock } from "@/lib/prisma"

/**
 * POST /api/admin/events/[id]/sector-leaders for a sector (#1169): exactly one of poste or sector,
 * the beta capability « sectorLeaders », an event that adopted sectors, an active sector of this
 * event, read under the event's then the sector's row lock.
 */

const requireOrgSessionMock = vi.hoisted(() => vi.fn())
vi.mock("@/lib/auth-guard", () => ({ requireOrgSession: requireOrgSessionMock }))
const canAdoptBeta = vi.hoisted(() => vi.fn())
vi.mock("@/lib/beta-access", () => ({ canAdoptBeta }))

const findFirst = vi.hoisted(() => vi.fn())
const create = vi.hoisted(() => vi.fn())
const queryRaw = vi.hoisted(() => vi.fn())
vi.mock("@/lib/prisma", () => ({
  prisma: {
    sectorLeader: { findFirst, create },
    eventLog: { create: vi.fn().mockResolvedValue({ id: "log" }) },
    volunteer: { findFirst: vi.fn().mockResolvedValue(null), update: vi.fn() },
    $queryRaw: queryRaw,
    async $transaction(fn: (tx: unknown) => unknown) { return fn(this) },
  },
}))
const queued = vi.hoisted(() => vi.fn())
vi.mock("@/lib/notifications/outbox", () => ({
  enqueueNotifications: async (payloads: unknown[]) => { payloads.forEach((p) => queued(p)); return payloads.map((_, i) => `row-${i}`) },
  deliverAfterResponse: () => {},
}))
vi.mock("@/lib/notifications", () => ({ sendNotification: vi.fn() }))

const post = (body: unknown) => new Request("http://localhost/api/admin/events/evt-1/sector-leaders", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
const params = { params: Promise.resolve({ id: "evt-1" }) }
const sectorBody = { sectorId: "sec-parking", name: "Paula Martin", email: "Paula@Example.org" }

describe("POST sector-leaders with a sector (#1169)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    requireOrgSessionMock.mockResolvedValue({
      db: { ...prismaMock, event: { findFirst: vi.fn().mockResolvedValue({ title: "Festival", organization: { slug: "org-a" } }) } },
      organizationId: "org-a",
      session: { user: { id: "admin-1" } },
    })
    canAdoptBeta.mockResolvedValue(true)
    findFirst.mockResolvedValue(null)
    // The event's lock (adopted), then the sector's (active, this event).
    queryRaw
      .mockResolvedValueOnce([{ id: "evt-1", sectorsEnabled: true, sectorsAdoptedAt: new Date("2026-10-01") }])
      .mockResolvedValueOnce([{ id: "sec-parking", name: "Parking", archivedAt: null }])
    create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: "l-new", eventId: "evt-1", roleName: data.roleName, sectorId: data.sectorId, name: data.name, email: data.email, createdAt: new Date() }))
  })

  it("creates a sector leader with no poste, and emails a sector invitation", async () => {
    const { POST } = await import("@/app/api/admin/events/[id]/sector-leaders/route")
    const res = await POST(post(sectorBody), params)
    expect(res.status).toBe(201)
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ eventId: "evt-1", roleName: null, sectorId: "sec-parking", email: "paula@example.org" }) }))
    expect(queued).toHaveBeenCalledWith(expect.objectContaining({ kind: "sector_leader_invite", data: expect.objectContaining({ roleName: "Parking", scopeKind: "sector" }) }))
    expect(canAdoptBeta).toHaveBeenCalledWith("org-a", "sectorLeaders")
  })

  it("B01: naming a leader creates no registration and takes no place", async () => {
    const db = (await requireOrgSessionMock()).db as Record<string, unknown>
    expect(db.registration).toBeUndefined() // the route would throw if it touched registrations
    const { POST } = await import("@/app/api/admin/events/[id]/sector-leaders/route")
    expect((await POST(post(sectorBody), params)).status).toBe(201)
  })

  it("refuses a sector while the beta capability is closed (403), before any write", async () => {
    canAdoptBeta.mockResolvedValue(false)
    const { POST } = await import("@/app/api/admin/events/[id]/sector-leaders/route")
    const res = await POST(post(sectorBody), params)
    expect(res.status).toBe(403)
    expect(create).not.toHaveBeenCalled()
  })

  it("refuses both a poste and a sector, or neither (400)", async () => {
    const { POST } = await import("@/app/api/admin/events/[id]/sector-leaders/route")
    expect((await POST(post({ ...sectorBody, roleName: "Bar" }), params)).status).toBe(400)
    expect((await POST(post({ name: "X", email: "x@example.org" }), params)).status).toBe(400)
  })

  it("refuses an event that has not adopted sectors (409)", async () => {
    queryRaw.mockReset().mockResolvedValueOnce([{ id: "evt-1", sectorsEnabled: true, sectorsAdoptedAt: null }])
    const { POST } = await import("@/app/api/admin/events/[id]/sector-leaders/route")
    const res = await POST(post(sectorBody), params)
    expect(res.status).toBe(409)
    expect(create).not.toHaveBeenCalled()
  })

  it("refuses an archived sector (409)", async () => {
    queryRaw.mockReset()
      .mockResolvedValueOnce([{ id: "evt-1", sectorsEnabled: true, sectorsAdoptedAt: new Date() }])
      .mockResolvedValueOnce([{ id: "sec-parking", name: "Parking", archivedAt: new Date() }])
    const { POST } = await import("@/app/api/admin/events/[id]/sector-leaders/route")
    const res = await POST(post(sectorBody), params)
    expect(res.status).toBe(409)
    expect((await res.json()).error).toMatch(/archivé/)
    expect(create).not.toHaveBeenCalled()
  })

  it("refuses a sector of another event or organisation (404): the lock reads it within this event", async () => {
    queryRaw.mockReset()
      .mockResolvedValueOnce([{ id: "evt-1", sectorsEnabled: true, sectorsAdoptedAt: new Date() }])
      .mockResolvedValueOnce([])
    const { POST } = await import("@/app/api/admin/events/[id]/sector-leaders/route")
    const res = await POST(post({ ...sectorBody, sectorId: "sec-of-org-b" }), params)
    expect(res.status).toBe(404)
    expect(create).not.toHaveBeenCalled()
  })

  it("says the person already leads this sector (409)", async () => {
    findFirst.mockResolvedValue({ id: "l1" })
    const { POST } = await import("@/app/api/admin/events/[id]/sector-leaders/route")
    const res = await POST(post(sectorBody), params)
    expect(res.status).toBe(409)
    expect((await res.json()).error).toBe("Cette personne est déjà responsable de ce secteur")
    expect(findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { eventId: "evt-1", sectorId: "sec-parking", email: "paula@example.org" } }))
  })

  it("a poste leader needs neither the capability nor sectors, as before #1169", async () => {
    canAdoptBeta.mockResolvedValue(false)
    const { POST } = await import("@/app/api/admin/events/[id]/sector-leaders/route")
    const res = await POST(post({ roleName: "Bar", name: "Bob", email: "bob@example.org" }), params)
    expect(res.status).toBe(201)
    expect(canAdoptBeta).not.toHaveBeenCalled()
    expect(queryRaw).not.toHaveBeenCalled()
    expect(queued).toHaveBeenCalledWith(expect.objectContaining({ data: expect.not.objectContaining({ scopeKind: "sector" }) }))
  })
})
