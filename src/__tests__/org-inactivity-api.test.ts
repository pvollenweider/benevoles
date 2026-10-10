import { describe, it, expect, vi, beforeEach } from "vitest"
import { NextResponse } from "next/server"

// The operator's hand on the periodic check of inactive organisations (#811): super admin only,
// one change at a time, logged in the operator log.
const m = vi.hoisted(() => ({ guard: vi.fn(), find: vi.fn(), update: vi.fn(), log: vi.fn() }))
vi.mock("@/lib/auth-guard", () => ({ requireSuperAdmin: m.guard }))
vi.mock("@/lib/prisma", () => {
  const tx = { organization: { update: m.update }, operatorLog: { create: m.log } }
  return {
    prisma: {
      organization: { findUnique: m.find },
      $transaction: async (fn: (t: typeof tx) => unknown) => fn(tx),
    },
  }
})

const put = (body: unknown) => new Request("http://localhost/api/super-admin/organizations/org-1/inactivity", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
const params = { params: Promise.resolve({ id: "org-1" }) }

beforeEach(() => {
  vi.clearAllMocks()
  m.guard.mockResolvedValue({ db: {}, session: { user: { id: "sa-1", role: "super_admin", name: "Opérateur" } } })
  m.find.mockResolvedValue({ id: "org-1", name: "Fête du village", slug: "fete" })
  m.update.mockImplementation(async ({ data }) => ({ inactivityPostponedUntil: data.inactivityPostponedUntil ?? null, inactivityExempt: data.inactivityExempt ?? false }))
})

describe("inactivity operator API (#811)", () => {
  it("is for the super admin only", async () => {
    m.guard.mockResolvedValueOnce(NextResponse.json({ error: "Non autorisé" }, { status: 403 }))
    const { PUT } = await import("@/app/api/super-admin/organizations/[id]/inactivity/route")
    expect((await PUT(put({ exempt: true }), params)).status).toBe(403)
    expect(m.update).not.toHaveBeenCalled()
  })

  it("refuses a body with both changes, none, or an unknown duration", async () => {
    const { PUT } = await import("@/app/api/super-admin/organizations/[id]/inactivity/route")
    expect((await PUT(put({}), params)).status).toBe(400)
    expect((await PUT(put({ postponeMonths: 6, exempt: true }), params)).status).toBe(400)
    expect((await PUT(put({ postponeMonths: 24 }), params)).status).toBe(400)
    expect((await PUT(put({ exempt: "yes" }), params)).status).toBe(400)
    expect(m.update).not.toHaveBeenCalled()
  })

  it("answers 404 for an unknown organisation", async () => {
    m.find.mockResolvedValueOnce(null)
    const { PUT } = await import("@/app/api/super-admin/organizations/[id]/inactivity/route")
    expect((await PUT(put({ exempt: true }), params)).status).toBe(404)
  })

  it("postpones from today and logs the date, then cancels", async () => {
    const { PUT } = await import("@/app/api/super-admin/organizations/[id]/inactivity/route")
    const res = await PUT(put({ postponeMonths: 3 }), params)
    expect(res.status).toBe(200)
    const until = m.update.mock.calls[0][0].data.inactivityPostponedUntil as Date
    const days = (until.getTime() - Date.now()) / 86_400_000
    expect(days).toBeGreaterThan(88)
    expect(days).toBeLessThan(93)
    expect(m.log).toHaveBeenCalledWith({ data: expect.objectContaining({ action: "organization.inactivity_postponed", entityId: "org-1", target: "Fête du village (fete)", detail: expect.stringMatching(/^Jusqu'au /) }) })

    await PUT(put({ postponeMonths: null }), params)
    expect(m.update.mock.calls[1][0].data).toEqual({ inactivityPostponedUntil: null })
    expect(m.log).toHaveBeenLastCalledWith({ data: expect.objectContaining({ action: "organization.inactivity_postponement_cancelled", detail: null }) })
  })

  it("excludes the organisation for good, and puts it back", async () => {
    const { PUT } = await import("@/app/api/super-admin/organizations/[id]/inactivity/route")
    expect(await (await PUT(put({ exempt: true }), params)).json()).toEqual({ postponedUntil: null, exempt: true })
    expect(m.log).toHaveBeenLastCalledWith({ data: expect.objectContaining({ action: "organization.inactivity_exempted" }) })
    await PUT(put({ exempt: false }), params)
    expect(m.log).toHaveBeenLastCalledWith({ data: expect.objectContaining({ action: "organization.inactivity_exemption_lifted" }) })
  })
})
