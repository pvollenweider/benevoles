/**
 * Operator level of the beta gate (#1168): the « Fonctions bêta » route of the super admin space,
 * and the server helper `canAdoptBeta`, against an in-memory PlatformSetting row. Since #1311 the
 * sectors and sector leaders are graduated: ignored by the screen, available without the beta.
 */
import { describe, it, expect, vi, beforeEach } from "vitest"
import { NextResponse } from "next/server"

const m = vi.hoisted(() => ({
  guard: vi.fn(),
  stored: null as unknown,
  upsert: vi.fn(),
  log: vi.fn(),
  org: null as null | { active: boolean; suspendedAt: Date | null; betaOptInAt: Date | null },
}))

vi.mock("@/lib/auth-guard", () => ({ requireSuperAdmin: m.guard }))
vi.mock("@/lib/prisma", () => {
  const platformSetting = { findUnique: vi.fn(async () => (m.stored === null ? null : { value: m.stored })), upsert: m.upsert }
  const tx = { platformSetting, operatorLog: { create: m.log } }
  return {
    prisma: {
      platformSetting,
      organization: { findUnique: vi.fn(async () => m.org) },
      $transaction: async (fn: (t: typeof tx) => unknown) => fn(tx),
    },
  }
})

const put = (body: unknown) => new Request("http://localhost/api/super-admin/beta-capabilities", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })

beforeEach(() => {
  vi.clearAllMocks()
  m.stored = null
  m.org = { active: true, suspendedAt: null, betaOptInAt: new Date("2026-10-26T08:00:00Z") }
  m.guard.mockResolvedValue({ db: {}, session: { user: { id: "sa-1", role: "super_admin", name: "Opérateur" } } })
  m.upsert.mockImplementation(async ({ create }) => { m.stored = create.value })
})

describe("/api/super-admin/beta-capabilities (#1168)", () => {
  it("is for the super admin only", async () => {
    m.guard.mockResolvedValue(NextResponse.json({ error: "Accès refusé" }, { status: 403 }))
    const { PUT, GET } = await import("@/app/api/super-admin/beta-capabilities/route")
    expect((await PUT(put({ open: [] }))).status).toBe(403)
    expect((await GET()).status).toBe(403)
    expect(m.upsert).not.toHaveBeenCalled()
  })

  it("lists only known, shipped beta capabilities: unknown and graduated ids stored in PlatformSetting are ignored", async () => {
    m.stored = { open: ["teleportation", "sectors", "sectorLeaders", "shiftSwaps"] }
    const { GET } = await import("@/app/api/super-admin/beta-capabilities/route")
    // Sectors and sector leaders left the beta (#1311); shift swaps are still openable.
    expect(await (await GET()).json()).toEqual({ open: ["shiftSwaps"] })
  })

  it("refuses to open a capability this version does not ship, or a graduated one", async () => {
    const { PUT } = await import("@/app/api/super-admin/beta-capabilities/route")
    expect((await PUT(put({ open: ["shiftSwaps", "teleportation"] }))).status).toBe(400)
    expect((await PUT(put({ open: ["teleportation"] }))).status).toBe(400)
    expect((await PUT(put({ open: ["sectors"] }))).status).toBe(400)
    expect((await PUT(put({ open: ["sectorLeaders"] }))).status).toBe(400)
    expect((await PUT(put({ closed: true }))).status).toBe(400)
    expect(m.upsert).not.toHaveBeenCalled()
  })

  it("saving the same list changes and logs nothing, and keeps ids it cannot manage", async () => {
    m.stored = { open: ["future-thing", "sectors"] }
    const { PUT } = await import("@/app/api/super-admin/beta-capabilities/route")
    const res = await PUT(put({ open: [] }))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ open: [] })
    expect(m.upsert).not.toHaveBeenCalled()
    expect(m.log).not.toHaveBeenCalled()
    // The graduated id is kept untouched, like an unknown one.
    expect(m.stored).toEqual({ open: ["future-thing", "sectors"] })
  })
})

describe("canAdoptBeta (#1168)", () => {
  it("BE01: false while a beta capability is not open, whatever the organisation", async () => {
    const { canAdoptBeta } = await import("@/lib/beta-access")
    expect(await canAdoptBeta("org-a", "shiftSwaps")).toBe(false)
  })

  it("a beta capability is true once open for an organisation taking part, false when it does not", async () => {
    m.stored = { open: ["shiftSwaps"] }
    const { canAdoptBeta } = await import("@/lib/beta-access")
    expect(await canAdoptBeta("org-a", "shiftSwaps")).toBe(true)
    m.org = { active: true, suspendedAt: null, betaOptInAt: null }
    expect(await canAdoptBeta("org-a", "shiftSwaps")).toBe(false)
  })

  it("#1311: sectors and sector leaders are true for an active organisation, without opt-in or open list", async () => {
    m.org = { active: true, suspendedAt: null, betaOptInAt: null }
    const { canAdoptBeta } = await import("@/lib/beta-access")
    expect(await canAdoptBeta("org-a", "sectors")).toBe(true)
    expect(await canAdoptBeta("org-a", "sectorLeaders")).toBe(true)
    m.stored = { open: [] }
    expect(await canAdoptBeta("org-a", "sectors")).toBe(true)
  })

  it("false for a suspended or inactive organisation, even for sectors", async () => {
    m.org = { active: true, suspendedAt: new Date(), betaOptInAt: new Date() }
    const { canAdoptBeta } = await import("@/lib/beta-access")
    expect(await canAdoptBeta("org-a", "sectors")).toBe(false)
    m.org = { active: false, suspendedAt: null, betaOptInAt: new Date() }
    expect(await canAdoptBeta("org-a", "sectorLeaders")).toBe(false)
  })

  it("false for a missing organisation", async () => {
    m.org = null
    const { canAdoptBeta } = await import("@/lib/beta-access")
    expect(await canAdoptBeta("org-x", "sectors")).toBe(false)
  })

  it("reads through the client it is given (a transaction)", async () => {
    const { canAdoptBeta } = await import("@/lib/beta-access")
    const tx = {
      platformSetting: { findUnique: vi.fn(async () => null) },
      organization: { findUnique: vi.fn(async () => null) },
    }
    await canAdoptBeta("org-a", "sectors", tx)
    expect(tx.platformSetting.findUnique).toHaveBeenCalledWith({ where: { key: "beta.capabilities" }, select: { value: true } })
    expect(tx.organization.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "org-a" } }))
  })
})
