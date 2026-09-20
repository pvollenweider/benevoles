import { describe, it, expect, vi, beforeEach } from "vitest"

const requireOrgSessionMock = vi.hoisted(() => vi.fn())
vi.mock("@/lib/auth-guard", () => ({ requireOrgSession: requireOrgSessionMock }))

const update = vi.hoisted(() => vi.fn())
vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: async (fn: (tx: unknown) => unknown) =>
      fn({ organization: { update }, orgSlugHistory: { deleteMany: vi.fn(), create: vi.fn() } }),
    organization: { findUnique: vi.fn(), findFirst: vi.fn() },
    orgSlugHistory: { findFirst: vi.fn() },
  },
}))

function patch(body: unknown) {
  return new Request("http://localhost/api/admin/settings/organization", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

describe("PATCH /api/admin/settings/organization — publicTitle", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    requireOrgSessionMock.mockResolvedValue({ organizationId: "org-a", db: {}, session: {} })
    update.mockImplementation(async ({ data }: { data: { publicTitle?: string | null } }) => ({
      name: "Org A",
      slug: "org-a",
      volunteerCharter: null,
      hasOrgInsurance: true,
      publicTitle: data.publicTitle ?? null,
    }))
  })

  it("stores a trimmed title for the caller's organization only", async () => {
    const { PATCH } = await import("@/app/api/admin/settings/organization/route")
    const res = await PATCH(patch({ publicTitle: "  Festival du Rhône  " }))
    expect(res.status).toBe(200)
    expect((await res.json()).publicTitle).toBe("Festival du Rhône")
    expect(update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "org-a" },
      data: { publicTitle: "Festival du Rhône" },
    }))
  })

  it("resets to the default (null) with an empty or whitespace-only value", async () => {
    const { PATCH } = await import("@/app/api/admin/settings/organization/route")
    for (const publicTitle of ["", "   ", null]) {
      update.mockClear()
      const res = await PATCH(patch({ publicTitle }))
      expect(res.status).toBe(200)
      expect(update).toHaveBeenCalledWith(expect.objectContaining({ data: { publicTitle: null } }))
    }
  })

  it("rejects a 1-character or 101-character title", async () => {
    const { PATCH } = await import("@/app/api/admin/settings/organization/route")
    expect((await PATCH(patch({ publicTitle: "A" }))).status).toBe(400)
    expect((await PATCH(patch({ publicTitle: "x".repeat(101) }))).status).toBe(400)
    expect(update).not.toHaveBeenCalled()
  })

  it("accepts exactly 100 characters", async () => {
    const { PATCH } = await import("@/app/api/admin/settings/organization/route")
    expect((await PATCH(patch({ publicTitle: "x".repeat(100) }))).status).toBe(200)
  })
})
