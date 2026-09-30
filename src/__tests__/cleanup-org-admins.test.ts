import { describe, it, expect, vi, beforeEach } from "vitest"

// Regression: the nightly cleanup deleted a deactivated organization but only SET NULL its admins,
// and then removed inactive ones only. An active admin outlived the organization, email and
// password hash kept indefinitely, and could still sign in (its organization no longer existed,
// so the "organization disabled" check was skipped).
const m = vi.hoisted(() => ({
  orgFindMany: vi.fn(),
  orgDeleteMany: vi.fn(),
  adminFindMany: vi.fn(),
  adminDeleteMany: vi.fn(),
}))

vi.mock("@/lib/prisma", () => {
  const zero = { deleteMany: vi.fn().mockResolvedValue({ count: 0 }), updateMany: vi.fn().mockResolvedValue({ count: 0 }) }
  const tx = {
    organization: { findMany: m.orgFindMany, deleteMany: m.orgDeleteMany },
    adminUser: { findMany: m.adminFindMany, deleteMany: m.adminDeleteMany, updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
    notificationOutbox: { findMany: vi.fn().mockResolvedValue([]), deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
    targetedMessage: { update: vi.fn(), deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
  }
  return {
    prisma: {
      ...tx,
      volunteer: zero, rateLimit: zero,
      $transaction: async (fn: (t: typeof tx) => unknown) => fn(tx),
    },
  }
})
vi.mock("@/lib/env", () => ({ env: { CRON_SECRET: "s" } }))
vi.mock("@/lib/job-runs", () => ({ recordJobRun: (_: string, fn: () => unknown) => fn() }))
vi.mock("@/lib/token-encryption-job", () => ({ encryptLegacyTokens: vi.fn().mockResolvedValue(null) }))

const run = async () => {
  const { GET } = await import("@/app/api/cron/cleanup/route")
  return GET(new Request("http://localhost/api/cron/cleanup", { headers: { authorization: "Bearer s" } }))
}

beforeEach(() => {
  vi.clearAllMocks()
  m.orgDeleteMany.mockResolvedValue({ count: 0 })
  m.adminDeleteMany.mockResolvedValue({ count: 0 })
})

describe("nightly cleanup of deactivated organizations", () => {
  it("deletes the organization's admins, active ones included, with it", async () => {
    m.orgFindMany.mockResolvedValue([{ id: "org-old" }])
    m.adminFindMany.mockResolvedValue([{ id: "owner-1" }, { id: "organizer-1" }])
    m.orgDeleteMany.mockResolvedValue({ count: 1 })
    m.adminDeleteMany.mockResolvedValueOnce({ count: 2 }).mockResolvedValueOnce({ count: 0 })

    const res = await run()
    expect(res.status).toBe(200)
    expect(m.adminFindMany).toHaveBeenCalledWith({ where: { organizationId: { in: ["org-old"] } }, select: { id: true } })
    expect(m.orgDeleteMany).toHaveBeenCalledWith({ where: { id: { in: ["org-old"] } } })
    // No isActive filter: the active owner goes too.
    expect(m.adminDeleteMany.mock.calls[0][0]).toEqual({ where: { id: { in: ["owner-1", "organizer-1"] } } })
    const body = await res.json()
    expect(body.deleted.organizations).toBe(1)
    expect(body.deleted.adminUsers).toBe(2)
  })

  it("touches no admin when no organization is due", async () => {
    m.orgFindMany.mockResolvedValue([])
    await run()
    expect(m.orgDeleteMany).not.toHaveBeenCalled()
    expect(m.adminFindMany).not.toHaveBeenCalled()
  })

  it("also sweeps org accounts orphaned by earlier cleanups, never the super admin", async () => {
    m.orgFindMany.mockResolvedValue([])
    await run()
    const where = m.adminDeleteMany.mock.calls.at(-1)![0].where
    expect(where.OR).toContainEqual({ organizationId: null, role: { not: "super_admin" } })
  })
})
