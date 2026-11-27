// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { describe, it, expect, vi, beforeEach } from "vitest"
import { NextResponse } from "next/server"

const requireOrgSessionMock = vi.hoisted(() => vi.fn())
vi.mock("@/lib/auth-guard", () => ({ requireOrgSession: requireOrgSessionMock }))

const update = vi.hoisted(() => vi.fn())
vi.mock("@/lib/prisma", () => ({
  prisma: { $transaction: (fn: (tx: unknown) => unknown) => fn({ organization: { update } }) },
}))

function patch(body: unknown) {
  return new Request("http://localhost/api/admin/settings/organization", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

const org = (over: Record<string, unknown> = {}) => ({
  name: "Org", slug: "org", publicTitle: null, timeZone: null, shiftRosterDefault: true,
  sectorsDefault: false, shiftSwapsDefault: true, volunteerHourRateCents: null,
  volunteerHourRateCurrency: null, volunteerHourRateSetAt: null, ...over,
})

// « Demander aux bénévoles d'accepter une convention » (#1468): the owner-only boolean, refused
// rather than silently ignored when it is not a boolean.
describe("PATCH /api/admin/settings/organization — volunteerConventionEnabled (#1468)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    requireOrgSessionMock.mockResolvedValue({ organizationId: "org-a", session: { user: { id: "admin-1" } } })
    update.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => org(data))
  })

  it("saves the boolean on the caller's organisation", async () => {
    const { PATCH } = await import("@/app/api/admin/settings/organization/route")
    const res = await PATCH(patch({ volunteerConventionEnabled: false }))
    expect(res.status).toBe(200)
    expect(update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "org-a" },
      data: { volunteerConventionEnabled: false },
    }))
  })

  it("is reserved to the owner", async () => {
    requireOrgSessionMock.mockResolvedValue(NextResponse.json({ error: "Réservé aux propriétaires." }, { status: 403 }))
    const { PATCH } = await import("@/app/api/admin/settings/organization/route")
    const res = await PATCH(patch({ volunteerConventionEnabled: false }))
    expect(res.status).toBe(403)
    expect(requireOrgSessionMock).toHaveBeenCalledWith("owner")
    expect(update).not.toHaveBeenCalled()
  })

  it("refuses a value that is not a boolean without writing", async () => {
    const { PATCH } = await import("@/app/api/admin/settings/organization/route")
    const res = await PATCH(patch({ volunteerConventionEnabled: "non" }))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toContain("convention des bénévoles")
    expect(update).not.toHaveBeenCalled()
  })
})
