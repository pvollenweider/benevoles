import { describe, it, expect, vi, beforeEach } from "vitest"

// Communications history (#467): counters survive the nightly purge, and « resend failed »
// resends only the failed emails of the message, once, within the organisation.
const m = vi.hoisted(() => ({
  outboxFindMany: vi.fn(),
  outboxUpdateMany: vi.fn(),
  outboxDeleteMany: vi.fn(),
  messageUpdate: vi.fn(),
  messageDeleteMany: vi.fn(),
  batchUpdate: vi.fn(),
  batchUpdateMany: vi.fn(),
  executeRaw: vi.fn(),
  deliver: vi.fn(),
  logEvent: vi.fn(),
  guard: vi.fn(),
}))

vi.mock("@/lib/prisma", () => {
  const tx = {
    notificationOutbox: { findMany: m.outboxFindMany, deleteMany: m.outboxDeleteMany, updateMany: m.outboxUpdateMany },
    targetedMessage: { update: m.messageUpdate, deleteMany: m.messageDeleteMany },
    scheduledMessage: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
    organization: { findMany: vi.fn().mockResolvedValue([]), findUnique: vi.fn().mockResolvedValue(null) },
    sendBatch: { update: m.batchUpdate, updateMany: m.batchUpdateMany, findMany: vi.fn().mockResolvedValue([]), deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
    orgLog: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
    $executeRaw: m.executeRaw,
  }
  const zero = { deleteMany: vi.fn().mockResolvedValue({ count: 0 }), updateMany: vi.fn().mockResolvedValue({ count: 0 }), findMany: vi.fn().mockResolvedValue([]) }
  return {
    prisma: {
      ...tx,
      volunteer: zero, adminUser: zero, rateLimit: zero, revokedSession: zero, deliveryOutcome: zero, emailLimitHit: zero, videoFeedback: zero, signupRequest: zero, signupBlock: zero, operatorLog: zero,
      $transaction: async (fn: (t: typeof tx) => unknown) => fn(tx),
    },
  }
})
vi.mock("@/lib/env", () => ({ env: { CRON_SECRET: "s", AUTH_SECRET: "a".repeat(32), ADMIN_NOTIFICATION_EMAIL: undefined } }))
vi.mock("@/lib/job-runs", () => ({ recordJobRun: (_: string, fn: () => unknown) => fn() }))
vi.mock("@/lib/token-encryption-job", () => ({ encryptLegacyTokens: vi.fn().mockResolvedValue(null) }))
vi.mock("@/lib/notifications/outbox", () => ({ deliverAfterResponse: m.deliver }))
vi.mock("@/lib/event-log", () => ({ logEvent: m.logEvent, adminActor: () => ({ type: "admin", id: "adm" }) }))
vi.mock("@/lib/auth-guard", () => ({ requireOrgSession: m.guard }))

beforeEach(() => {
  vi.clearAllMocks()
  m.outboxDeleteMany.mockResolvedValue({ count: 0 })
  m.messageDeleteMany.mockResolvedValue({ count: 0 })
})

describe("nightly cleanup", () => {
  it("adds the deleted rows of each message to its counters, then deletes exactly those rows", async () => {
    m.outboxFindMany.mockResolvedValue([
      { id: "o1", targetedMessageId: "msg-1", status: "sent" },
      { id: "o2", targetedMessageId: "msg-1", status: "sent" },
      { id: "o3", targetedMessageId: "msg-1", status: "failed" },
    ])
    m.outboxDeleteMany.mockResolvedValueOnce({ count: 3 }).mockResolvedValueOnce({ count: 5 })
    const { GET } = await import("@/app/api/cron/cleanup/route")
    const res = await GET(new Request("http://localhost/api/cron/cleanup", { headers: { authorization: "Bearer s" } }))
    expect(res.status).toBe(200)
    expect(m.messageUpdate).toHaveBeenCalledWith({ where: { id: "msg-1" }, data: { sentCount: { increment: 2 }, failedCount: { increment: 1 } } })
    expect(m.outboxDeleteMany.mock.calls[0][0]).toEqual({ where: { id: { in: ["o1", "o2", "o3"] } } })
    // Other notifications go by the usual rule, never rows of a message.
    expect(JSON.stringify(m.outboxDeleteMany.mock.calls[1][0])).toContain('"targetedMessageId":null')
    expect((await res.json()).deleted.notificationOutbox).toBe(8)
    // Messages older than 12 months are deleted.
    const cutoff = m.messageDeleteMany.mock.calls[0][0].where.createdAt.lt as Date
    expect(Math.round((Date.now() - cutoff.getTime()) / 86_400_000)).toBe(365)
  })
})

// #1101: a batch keeps the outcome of its purged rows, folded from the same rows as the messages,
// under a lock so two cleanups at once never fold them twice.
describe("nightly cleanup of batches of emails", () => {
  it("folds sent, held then sent, failed and cancelled rows into their batch before deleting them", async () => {
    const at = (s: string) => new Date(`2026-10-22T21:${s}Z`)
    m.outboxFindMany.mockResolvedValue([
      { id: "o1", targetedMessageId: null, sendBatchId: "b1", status: "sent", lastHeldAt: at("00:00"), firstHeldAt: at("00:00"), sentAt: at("01:30") },
      { id: "o2", targetedMessageId: null, sendBatchId: "b1", status: "sent", lastHeldAt: null, firstHeldAt: null, sentAt: at("00:00") },
      { id: "o3", targetedMessageId: "msg-1", sendBatchId: "b2", status: "cancelled", lastHeldAt: null, firstHeldAt: null, sentAt: null },
    ])
    m.outboxDeleteMany.mockResolvedValueOnce({ count: 3 }).mockResolvedValueOnce({ count: 0 })
    const { GET } = await import("@/app/api/cron/cleanup/route")
    const res = await GET(new Request("http://localhost/api/cron/cleanup", { headers: { authorization: "Bearer s" } }))
    expect(res.status).toBe(200)
    expect(m.executeRaw).toHaveBeenCalled()
    expect(m.batchUpdate).toHaveBeenCalledWith({ where: { id: "b1" }, data: { sentCount: { increment: 2 }, heldSentCount: { increment: 1 }, failedCount: { increment: 0 }, cancelledCount: { increment: 0 } } })
    expect(m.batchUpdate).toHaveBeenCalledWith({ where: { id: "b2" }, data: { sentCount: { increment: 0 }, heldSentCount: { increment: 0 }, failedCount: { increment: 0 }, cancelledCount: { increment: 1 } } })
    expect(m.batchUpdateMany).toHaveBeenCalledWith({ where: { id: "b1", maxHeldWaitSec: { lt: 90 } }, data: { maxHeldWaitSec: 90 } })
    expect(m.outboxDeleteMany.mock.calls[0][0]).toEqual({ where: { id: { in: ["o1", "o2", "o3"] } } })
    expect(JSON.stringify(m.outboxDeleteMany.mock.calls[1][0])).toContain('"sendBatchId":null')
  })
})

describe("POST /api/admin/events/[id]/messages/[messageId]/resend-failed", () => {
  const params = (messageId = "msg-1") => ({ params: Promise.resolve({ id: "evt-a", messageId }) })
  const req = () => new Request("http://localhost/x", { method: "POST" })
  const scoped = (found: boolean) => ({ targetedMessage: { findFirst: vi.fn().mockResolvedValue(found ? { id: "msg-1" } : null) } })

  it("re-queues only the failed rows of the message, in this organisation, and logs it", async () => {
    m.guard.mockResolvedValue({ db: scoped(true), organizationId: "org-a", session: {} })
    m.outboxFindMany.mockResolvedValue([{ id: "o3" }, { id: "o4" }])
    m.outboxUpdateMany.mockResolvedValue({ count: 1 })
    const { POST } = await import("@/app/api/admin/events/[id]/messages/[messageId]/resend-failed/route")
    const res = await POST(req(), params())
    expect(await res.json()).toEqual({ resent: 2 })
    expect(m.outboxFindMany).toHaveBeenCalledWith({ where: { targetedMessageId: "msg-1", organizationId: "org-a", status: "failed" }, select: { id: true } })
    expect(m.outboxUpdateMany.mock.calls[0][0].where).toEqual({ id: "o3", status: "failed" })
    expect(m.deliver).toHaveBeenCalledWith(["o3", "o4"])
    expect(m.logEvent.mock.calls[0][0]).toMatchObject({ action: "message.resent", changes: { resent: { to: 2 } } })
  })

  it("resends nothing a second time", async () => {
    m.guard.mockResolvedValue({ db: scoped(true), organizationId: "org-a", session: {} })
    m.outboxFindMany.mockResolvedValue([{ id: "o3" }])
    m.outboxUpdateMany.mockResolvedValue({ count: 0 }) // already re-queued by the first click
    const { POST } = await import("@/app/api/admin/events/[id]/messages/[messageId]/resend-failed/route")
    expect(await (await POST(req(), params())).json()).toEqual({ resent: 0 })
    expect(m.deliver).not.toHaveBeenCalled()
    expect(m.logEvent).not.toHaveBeenCalled()
  })

  it("answers 404 for a message of another organisation, touching nothing", async () => {
    m.guard.mockResolvedValue({ db: scoped(false), organizationId: "org-a", session: {} })
    const { POST } = await import("@/app/api/admin/events/[id]/messages/[messageId]/resend-failed/route")
    expect((await POST(req(), params("msg-of-org-b"))).status).toBe(404)
    expect(m.outboxFindMany).not.toHaveBeenCalled()
    expect(m.outboxUpdateMany).not.toHaveBeenCalled()
  })
})
