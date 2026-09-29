import { describe, it, expect, vi, beforeEach } from "vitest"

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

describe("PATCH /api/admin/settings/organization — timeZone (#344)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    requireOrgSessionMock.mockResolvedValue({ organizationId: "org-a", session: { user: { id: "admin-1" } } })
    update.mockImplementation(async ({ data }) => ({
      name: "Org", slug: "org", volunteerCharter: null, hasOrgInsurance: true, publicTitle: null, timeZone: data.timeZone ?? null,
    }))
  })

  it("stores a valid zone on the caller's organization", async () => {
    const { PATCH } = await import("@/app/api/admin/settings/organization/route")
    const res = await PATCH(patch({ timeZone: " America/New_York " }))
    expect(res.status).toBe(200)
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "org-a" }, data: { timeZone: "America/New_York" } }))
    expect((await res.json()).timeZone).toBe("America/New_York")
  })

  it("empty resets to the deployment default (null)", async () => {
    const { PATCH } = await import("@/app/api/admin/settings/organization/route")
    const res = await PATCH(patch({ timeZone: "" }))
    expect(res.status).toBe(200)
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ data: { timeZone: null } }))
  })

  it("rejects an unknown zone without writing", async () => {
    const { PATCH } = await import("@/app/api/admin/settings/organization/route")
    const res = await PATCH(patch({ timeZone: "Europe/Zuric" }))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe("Fuseau horaire inconnu.")
    expect(update).not.toHaveBeenCalled()
  })
})

describe("PATCH /api/admin/settings/organization — onboarding checklist (#369)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    requireOrgSessionMock.mockResolvedValue({ organizationId: "org-a", session: { user: { id: "admin-1" } } })
    update.mockResolvedValue({ name: "Org", slug: "org", volunteerCharter: null, hasOrgInsurance: true, publicTitle: null, timeZone: null })
  })

  it("hides the checklist for the caller's organization", async () => {
    const { PATCH } = await import("@/app/api/admin/settings/organization/route")
    expect((await PATCH(patch({ onboardingDismissed: true }))).status).toBe(200)
    const { where, data } = update.mock.calls[0][0]
    expect(where).toEqual({ id: "org-a" })
    expect(data.onboardingDismissedAt).toBeInstanceOf(Date)
  })

  it("shows it again with false", async () => {
    const { PATCH } = await import("@/app/api/admin/settings/organization/route")
    await PATCH(patch({ onboardingDismissed: false }))
    expect(update.mock.calls[0][0].data).toEqual({ onboardingDismissedAt: null })
  })

  it("ignores a non-boolean value", async () => {
    const { PATCH } = await import("@/app/api/admin/settings/organization/route")
    expect((await PATCH(patch({ onboardingDismissed: "yes" }))).status).toBe(400)
    expect(update).not.toHaveBeenCalled()
  })
})
