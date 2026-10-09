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

const videoFeedbackDeleteMany = vi.hoisted(() => vi.fn())

vi.mock("@/lib/prisma", () => {
  const zero = { deleteMany: vi.fn().mockResolvedValue({ count: 0 }), updateMany: vi.fn().mockResolvedValue({ count: 0 }), findMany: vi.fn().mockResolvedValue([]) }
  const tx = {
    organization: { findMany: m.orgFindMany, deleteMany: m.orgDeleteMany, findUnique: vi.fn().mockResolvedValue(null) },
    adminUser: { findMany: m.adminFindMany, deleteMany: m.adminDeleteMany, updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
    notificationOutbox: { findMany: vi.fn().mockResolvedValue([]), deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
    targetedMessage: { update: vi.fn(), deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
  }
  return {
    prisma: {
      ...tx,
      volunteer: zero, rateLimit: zero, deliveryOutcome: zero, videoFeedback: { deleteMany: videoFeedbackDeleteMany }, signupRequest: zero, signupBlock: zero, operatorLog: zero,
      $transaction: async (fn: (t: typeof tx) => unknown) => fn(tx),
    },
  }
})
vi.mock("@/lib/env", () => ({ env: { CRON_SECRET: "s", AUTH_SECRET: "a".repeat(32), ADMIN_NOTIFICATION_EMAIL: undefined } }))
vi.mock("@/lib/operator-alerts", () => ({ notifyOperator: vi.fn().mockResolvedValue(undefined) }))
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
  videoFeedbackDeleteMany.mockResolvedValue({ count: 0 })
})

describe("nightly cleanup of deactivated organizations", () => {
  it("deletes the organization's admins, active ones included, with it", async () => {
    // The deactivated organisations to delete; the pending-spaces summary (#810) finds none.
    m.orgFindMany.mockImplementation(async ({ where }: { where: { OR?: unknown; admins?: unknown } }) => (where.OR || where.admins ? [] : [{ id: "org-old" }]))
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

// #810: a sign-up space whose owner never chose a password, deleted with that inactive account.
describe("nightly cleanup of sign-up spaces never activated", () => {
  it("deletes the space and its inactive accounts after RETENTION_DAYS.deactivatedAdmin, and counts it", async () => {
    m.orgFindMany.mockImplementation(async ({ where }: { where: { admins?: unknown } }) => (where.admins ? [{ id: "org-abandoned" }] : []))
    m.orgDeleteMany.mockResolvedValue({ count: 1 })
    const before = Date.now()
    const body = await (await run()).json()

    const where = m.orgFindMany.mock.calls.find(([a]) => a.where.admins)![0].where
    expect(where).toMatchObject({ active: true, suspendedAt: null, publicationApprovedAt: null, outboundEmailApprovedAt: null, admins: { none: { isActive: true } } })
    const { RETENTION_DAYS, DAY_MS } = await import("@/lib/retention")
    expect(before - where.createdAt.lt.getTime()).toBeGreaterThanOrEqual(RETENTION_DAYS.deactivatedAdmin * DAY_MS - 1000)
    expect(m.adminDeleteMany).toHaveBeenCalledWith({ where: { organizationId: { in: ["org-abandoned"] }, isActive: false } })
    expect(m.orgDeleteMany).toHaveBeenCalledWith({ where: { id: { in: ["org-abandoned"] } } })
    expect(body.deleted.abandonedSignupSpaces).toBe(1)
  })
})

// #646: anonymous video feedback, purged after its retention window (src/lib/retention.ts).
describe("nightly cleanup of video feedback", () => {
  it("deletes the answers older than RETENTION_DAYS.videoFeedback, and counts them", async () => {
    m.orgFindMany.mockResolvedValue([])
    videoFeedbackDeleteMany.mockResolvedValue({ count: 4 })
    const before = Date.now()
    const body = await (await run()).json()
    const cutoff: Date = videoFeedbackDeleteMany.mock.calls[0][0].where.answeredOn.lt
    const { RETENTION_DAYS, DAY_MS } = await import("@/lib/retention")
    expect(before - cutoff.getTime()).toBeGreaterThanOrEqual(RETENTION_DAYS.videoFeedback * DAY_MS - 1000)
    expect(before - cutoff.getTime()).toBeLessThanOrEqual(RETENTION_DAYS.videoFeedback * DAY_MS + 1000)
    expect(body.deleted.videoFeedback).toBe(4)
  })
})
