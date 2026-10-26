/**
 * Operator level of the beta gate (#1168): the « Fonctions bêta » route of the super admin space,
 * and the server helper `canAdoptBeta`, against an in-memory PlatformSetting row.
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

  it("lists only known, shipped capabilities: unknown ids stored in PlatformSetting are ignored", async () => {
    m.stored = { open: ["teleportation", "sectors"] }
    const { GET } = await import("@/app/api/super-admin/beta-capabilities/route")
    // sectors is declared but not shipped before #1147: nothing is effectively open.
    expect(await (await GET()).json()).toEqual({ open: [] })
  })

  it("refuses to open a capability this version does not ship", async () => {
    const { PUT } = await import("@/app/api/super-admin/beta-capabilities/route")
    expect((await PUT(put({ open: ["sectors"] }))).status).toBe(400)
    expect((await PUT(put({ open: ["teleportation"] }))).status).toBe(400)
    expect((await PUT(put({ closed: true }))).status).toBe(400)
    expect(m.upsert).not.toHaveBeenCalled()
  })

  it("saving the same list changes and logs nothing, and keeps ids it cannot manage", async () => {
    m.stored = { open: ["future-thing"] }
    const { PUT } = await import("@/app/api/super-admin/beta-capabilities/route")
    const res = await PUT(put({ open: [] }))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ open: [] })
    expect(m.upsert).not.toHaveBeenCalled()
    expect(m.log).not.toHaveBeenCalled()
    expect(m.stored).toEqual({ open: ["future-thing"] })
  })
})

describe("canAdoptBeta (#1168)", () => {
  it("BE01: false while the capability is not open, whatever the organisation", async () => {
    const { canAdoptBeta } = await import("@/lib/beta-access")
    expect(await canAdoptBeta("org-a", "sectors")).toBe(false)
  })

  it("false for an unshipped capability even if the stored list says it is open", async () => {
    m.stored = { open: ["sectors"] }
    const { canAdoptBeta } = await import("@/lib/beta-access")
    expect(await canAdoptBeta("org-a", "sectors")).toBe(false)
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
