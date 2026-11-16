import { describe, it, expect, vi, beforeEach } from "vitest"

// #1142: the front-desk purge is its own cleanup step. This file checks what the route does with
// it: the count in the summary, and a failure that never stops the following steps. The purge's
// own behaviour (batches, lock, role condition) is covered by src/lib/__tests__/front-desk-purge.test.ts.
const m = vi.hoisted(() => ({
  orgFindMany: vi.fn(),
  orgDeleteMany: vi.fn(),
  adminDeleteMany: vi.fn(),
  adminFindMany: vi.fn(),
  videoFeedbackDeleteMany: vi.fn(),
  purge: vi.fn(),
  report: vi.fn(),
}))

vi.mock("@/lib/prisma", () => {
  const zero = { deleteMany: vi.fn().mockResolvedValue({ count: 0 }), updateMany: vi.fn().mockResolvedValue({ count: 0 }), findMany: vi.fn().mockResolvedValue([]) }
  const tx = {
    organization: { findMany: m.orgFindMany, deleteMany: m.orgDeleteMany, findUnique: vi.fn().mockResolvedValue(null) },
    adminUser: { findMany: m.adminFindMany, deleteMany: m.adminDeleteMany, updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
    notificationOutbox: { findMany: vi.fn().mockResolvedValue([]), deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
    targetedMessage: { update: vi.fn(), deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
    scheduledMessage: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
    sendBatch: { update: vi.fn(), updateMany: vi.fn(), findMany: vi.fn().mockResolvedValue([]), deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
    orgLog: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
    $executeRaw: vi.fn().mockResolvedValue(0),
  }
  return {
    prisma: {
      ...tx,
      volunteer: zero, rateLimit: zero, revokedSession: zero, deliveryOutcome: zero, emailLimitHit: zero, videoFeedback: { deleteMany: m.videoFeedbackDeleteMany }, signupRequest: zero, signupBlock: zero, operatorLog: zero, notificationDeliveryCount: zero,
      $transaction: async (fn: (t: typeof tx) => unknown) => fn(tx),
    },
  }
})
vi.mock("@/lib/env", () => ({ env: { CRON_SECRET: "s", AUTH_SECRET: "a".repeat(32), ADMIN_NOTIFICATION_EMAIL: undefined } }))
vi.mock("@/lib/operator-alerts", () => ({ notifyOperator: vi.fn().mockResolvedValue(undefined) }))
vi.mock("@/lib/job-runs", () => ({ recordJobRun: (_: string, fn: () => unknown) => fn(), loadJobRuns: vi.fn().mockResolvedValue({}) }))
vi.mock("@/lib/token-encryption-job", () => ({ encryptLegacyTokens: vi.fn().mockResolvedValue(null) }))
vi.mock("@/lib/front-desk-purge", () => ({ purgeDueFrontDeskAccounts: m.purge }))
vi.mock("@/lib/report-error", () => ({ reportError: (context: string) => (error: unknown) => m.report(context, error) }))

const run = async () => {
  const { GET } = await import("@/app/api/cron/cleanup/route")
  return GET(new Request("http://localhost/api/cron/cleanup", { headers: { authorization: "Bearer s" } }))
}

beforeEach(() => {
  vi.clearAllMocks()
  m.orgFindMany.mockResolvedValue([])
  m.orgDeleteMany.mockResolvedValue({ count: 0 })
  m.adminDeleteMany.mockResolvedValue({ count: 0 })
  m.adminFindMany.mockResolvedValue([])
  m.videoFeedbackDeleteMany.mockResolvedValue({ count: 0 })
  m.purge.mockResolvedValue({ deleted: 0, failed: 0 })
})

describe("nightly cleanup of front-desk accounts (#1142)", () => {
  it("puts the step's count, and only a count, in the summary", async () => {
    m.purge.mockResolvedValue({ deleted: 3, failed: 0 })
    const res = await run()
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.deleted.frontDeskAccounts).toBe(3)
    expect(body.deleted.frontDeskAccountsFailed).toBe(0)
    expect(JSON.stringify(body)).not.toMatch(/colette|example\.org/i)
    expect(m.purge).toHaveBeenCalledTimes(1)
  })

  it("reports the count really deleted when some accounts failed", async () => {
    m.purge.mockResolvedValue({ deleted: 2, failed: 1 })
    const res = await run()
    const body = await res.json()
    // The per-account failure is counted by the purge and reported there; the step's own count
    // stays what was really deleted, never zero and never 3.
    expect(body.deleted.frontDeskAccounts).toBe(2)
    expect(body.deleted.frontDeskAccountsFailed).toBe(1)
    expect(m.report).not.toHaveBeenCalledWith("cleanup.front_desk_accounts", expect.anything())
    expect(m.report).not.toHaveBeenCalledWith("frontdesk.account_purge", expect.anything())
  })

  it("keeps a never-activated front-desk account out of the 30-day invitation sweep", async () => {
    await run()
    const where = m.adminDeleteMany.mock.calls[0][0].where
    const inactive = where.OR.find((clause: { isActive?: boolean }) => clause.isActive === false)
    expect(inactive.role).toEqual({ not: "front_desk" })
    expect(inactive.updatedAt.lt).toBeInstanceOf(Date)
    // The orphan-account clause is unchanged.
    expect(where.OR).toContainEqual({ organizationId: null, role: { not: "super_admin" } })
  })

  it("reports a purge failure and still runs the following steps", async () => {
    m.purge.mockRejectedValue(new Error("boom"))
    const res = await run()
    expect(res.status).toBe(200)
    expect(m.report).toHaveBeenCalledWith("cleanup.front_desk_accounts", expect.any(Error))
    // Step 6c (anonymous video feedback) still runs, and the summary is still returned.
    expect(m.videoFeedbackDeleteMany).toHaveBeenCalled()
    const body = await res.json()
    expect(body.deleted.frontDeskAccounts).toBe(0)
    expect(body.deleted.frontDeskAccountsFailed).toBe(0)
  })
})
