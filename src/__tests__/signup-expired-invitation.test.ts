import { describe, it, expect, vi, beforeEach } from "vitest"

// #1053: the self-service sign-up treats an expired, never-activated invitation as no account,
// and its confirmation replaces it; an active account or a valid invitation still holds the address.
const m = vi.hoisted(() => ({
  findFirst: vi.fn(),
  count: vi.fn(),
  deleteMany: vi.fn(),
  requestCreate: vi.fn(),
  requestFind: vi.fn(),
  requestClaim: vi.fn(),
  requestUpdate: vi.fn(),
  orgCreate: vi.fn(),
  enqueue: vi.fn(),
}))
vi.mock("@/lib/prisma", () => ({
  prisma: {
    adminUser: { findFirst: m.findFirst, count: m.count, deleteMany: m.deleteMany },
    signupRequest: { create: m.requestCreate, findUnique: m.requestFind, updateMany: m.requestClaim, update: m.requestUpdate },
    signupBlock: { findMany: vi.fn().mockResolvedValue([]) },
    organization: { findUnique: vi.fn().mockResolvedValue(null), create: m.orgCreate },
    async $transaction(fn: (tx: unknown) => unknown) { return fn(this) },
  },
}))
vi.mock("@/lib/notifications/outbox", () => ({ enqueueNotifications: m.enqueue, deliverAfterResponse: () => {} }))
vi.mock("@/lib/operator-alerts", () => ({ notifyOperator: vi.fn().mockResolvedValue(undefined) }))
vi.mock("bcryptjs", () => ({ default: { hash: vi.fn().mockResolvedValue("$h") }, hash: vi.fn().mockResolvedValue("$h") }))

import { confirmSignupRequest, createSignupRequest } from "@/lib/signup-server"

const DAY = 24 * 60 * 60 * 1000
const now = new Date("2026-10-17T12:00:00Z")
const expired = { id: "old-1", organizationId: "org-b", isActive: false, setupTokenHash: "old-hash", setupTokenExpiresAt: new Date(now.getTime() - DAY) }
const valid = { ...expired, setupTokenExpiresAt: new Date(now.getTime() + DAY) }
const active = { ...expired, isActive: true, setupTokenHash: null, setupTokenExpiresAt: null }
const input = { organizationName: "Fête", contactName: "Camille", email: "camille@example.org", description: "Fête de village, une centaine de bénévoles." }

describe("sign-up and an address held by an invitation (#1053)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    m.enqueue.mockResolvedValue(["row-1"])
    m.deleteMany.mockResolvedValue({ count: 1 })
    m.count.mockResolvedValue(1) // the invitation's organisation has an active admin
    m.requestFind.mockResolvedValue({ id: "req-1", email: "camille@example.org", organizationName: "Fête", contactName: "Camille", description: "x", expiresAt: new Date(now.getTime() + DAY), confirmedAt: null })
    m.requestClaim.mockResolvedValue({ count: 1 })
    m.orgCreate.mockResolvedValue({ id: "org-new", slug: "fete", name: "Fête" })
  })

  it("sends the confirmation when the address only has an expired invitation, without deleting anything yet", async () => {
    m.findFirst.mockResolvedValue(expired)
    expect(await createSignupRequest(input, now)).toEqual({ queued: true })
    expect(m.requestCreate).toHaveBeenCalledTimes(1)
    expect(m.deleteMany).not.toHaveBeenCalled()
  })

  it("still sends nothing for an active account or a valid invitation", async () => {
    for (const holder of [active, valid]) {
      m.findFirst.mockResolvedValueOnce(holder)
      expect(await createSignupRequest(input, now)).toEqual({ queued: false })
    }
    expect(m.requestCreate).not.toHaveBeenCalled()
  })

  it("confirmation replaces the expired invitation, then creates the space and its owner", async () => {
    m.findFirst.mockResolvedValue(expired)
    const result = await confirmSignupRequest("tok", now)
    expect(result.ok).toBe(true)
    expect(m.deleteMany.mock.calls[0][0].where).toEqual({ id: "old-1", isActive: false, setupTokenHash: "old-hash", setupTokenExpiresAt: { lt: new Date(now.getTime() - 60 * 60 * 1000) } })
    expect(m.deleteMany.mock.invocationCallOrder[0]).toBeLessThan(m.orgCreate.mock.invocationCallOrder[0])
  })

  it("confirmation sets the owner's address as reply-to and keeps the space awaiting validation (#1067)", async () => {
    m.findFirst.mockResolvedValue(null)
    expect((await confirmSignupRequest("tok", now)).ok).toBe(true)
    const data = m.orgCreate.mock.calls[0][0].data
    expect(data.replyToEmail).toBe("camille@example.org")
    expect(data.publicationApprovedAt).toBeNull()
    expect(data.outboundEmailApprovedAt).toBeNull()
  })

  it("confirmation keeps refusing an active account or a valid invitation, deleting nothing", async () => {
    for (const holder of [active, valid]) {
      m.findFirst.mockResolvedValueOnce(holder)
      expect(await confirmSignupRequest("tok", now)).toEqual({ ok: false, reason: "taken" })
    }
    expect(m.deleteMany).not.toHaveBeenCalled()
    expect(m.orgCreate).not.toHaveBeenCalled()
  })

  it("keeps the expired first account of a space with no active admin: no confirmation, still taken", async () => {
    m.findFirst.mockResolvedValue(expired)
    m.count.mockResolvedValue(0)
    expect(await createSignupRequest(input, now)).toEqual({ queued: false })
    expect(await confirmSignupRequest("tok", now)).toEqual({ ok: false, reason: "taken" })
    expect(m.deleteMany).not.toHaveBeenCalled()
    expect(m.orgCreate).not.toHaveBeenCalled()
  })

  it("confirmation refuses when the expired invitation was renewed meanwhile", async () => {
    m.findFirst.mockResolvedValue(expired)
    m.deleteMany.mockResolvedValue({ count: 0 })
    expect(await confirmSignupRequest("tok", now)).toEqual({ ok: false, reason: "taken" })
    expect(m.orgCreate).not.toHaveBeenCalled()
  })
})
