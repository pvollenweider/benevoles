import { describe, it, expect, vi, beforeEach } from "vitest"

/**
 * Hourly rate for valuing volunteer work (#867): saved by the owner with its currency, or cleared
 * with it; an invalid amount or a missing currency writes nothing.
 */

const requireOrgSessionMock = vi.hoisted(() => vi.fn())
vi.mock("@/lib/auth-guard", () => ({ requireOrgSession: requireOrgSessionMock }))

const update = vi.hoisted(() => vi.fn())
vi.mock("@/lib/prisma", () => ({
  prisma: { $transaction: (fn: (tx: unknown) => unknown) => fn({ organization: { update } }) },
}))

const patch = (body: unknown) =>
  new Request("http://localhost/api/admin/settings/organization", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })

describe("PATCH /api/admin/settings/organization — volunteerHourRate (#867)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    requireOrgSessionMock.mockResolvedValue({ organizationId: "org-a", session: { user: { id: "admin-1" } } })
    update.mockImplementation(async ({ data }) => ({ name: "Org", slug: "org", publicTitle: null, timeZone: null, shiftRosterDefault: true, ...data }))
  })

  it("stores the rate in cents with its currency and the date it was set", async () => {
    const { PATCH } = await import("@/app/api/admin/settings/organization/route")
    const res = await PATCH(patch({ volunteerHourRate: "28,50", volunteerHourRateCurrency: "CHF" }))
    expect(res.status).toBe(200)
    const { data, where } = update.mock.calls[0][0]
    expect(where).toEqual({ id: "org-a" })
    expect(data).toEqual({ volunteerHourRateCents: 2850, volunteerHourRateCurrency: "CHF", volunteerHourRateSetAt: expect.any(Date) })
    const body = await res.json()
    expect(body).toMatchObject({ volunteerHourRateCents: 2850, volunteerHourRateCurrency: "CHF" })
    expect(typeof body.volunteerHourRateSetAt).toBe("string")
  })

  it("empty clears the rate, its currency and its date together", async () => {
    const { PATCH } = await import("@/app/api/admin/settings/organization/route")
    const res = await PATCH(patch({ volunteerHourRate: "", volunteerHourRateCurrency: "EUR" }))
    expect(res.status).toBe(200)
    expect(update.mock.calls[0][0].data).toEqual({ volunteerHourRateCents: null, volunteerHourRateCurrency: null, volunteerHourRateSetAt: null })
  })

  it("refuses an invalid amount or a missing currency, writing nothing", async () => {
    const { PATCH } = await import("@/app/api/admin/settings/organization/route")
    for (const body of [{ volunteerHourRate: "-3", volunteerHourRateCurrency: "CHF" }, { volunteerHourRate: "25" }, { volunteerHourRate: "25", volunteerHourRateCurrency: "USD" }]) {
      const res = await PATCH(patch(body))
      expect(res.status).toBe(400)
      const json = await res.json()
      expect(typeof json.error).toBe("string")
      expect(json.field).toBe(body.volunteerHourRate === "-3" ? "rate" : "currency")
    }
    expect(update).not.toHaveBeenCalled()
  })

  it("is an owner setting, like the rest of the organisation's settings", async () => {
    const { NextResponse } = await import("next/server")
    requireOrgSessionMock.mockResolvedValue(NextResponse.json({ error: "Accès refusé." }, { status: 403 }))
    const { PATCH } = await import("@/app/api/admin/settings/organization/route")
    expect((await PATCH(patch({ volunteerHourRate: "25", volunteerHourRateCurrency: "CHF" }))).status).toBe(403)
    expect(requireOrgSessionMock).toHaveBeenCalledWith("owner")
    expect(update).not.toHaveBeenCalled()
  })
})
