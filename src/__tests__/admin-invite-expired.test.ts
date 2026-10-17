import { describe, it, expect, vi, beforeEach } from "vitest"

// #1053: an owner's invitation replaces an expired, never-activated invitation holding the address
// (any organisation), and is refused for an active account or a valid invitation, with a message
// that names nothing when the holder is in another organisation.
const m = vi.hoisted(() => ({
  guard: vi.fn(),
  findFirst: vi.fn(),
  count: vi.fn(),
  deleteMany: vi.fn(),
  create: vi.fn(),
  enqueue: vi.fn(),
  orgLog: vi.fn().mockResolvedValue({ id: "log" }),
}))
vi.mock("@/lib/auth-guard", () => ({ requireOrgSession: m.guard }))
vi.mock("@/lib/prisma", () => ({
  prisma: {
    adminUser: { findFirst: m.findFirst, count: m.count, deleteMany: m.deleteMany, create: m.create },
    orgLog: { create: m.orgLog },
    async $transaction(fn: (tx: unknown) => unknown) { return fn(this) },
  },
}))
vi.mock("@/lib/notifications/outbox", () => ({ enqueueNotifications: m.enqueue, deliverAfterResponse: () => {} }))
vi.mock("bcryptjs", () => ({ default: { hash: vi.fn().mockResolvedValue("$h") }, hash: vi.fn().mockResolvedValue("$h") }))

import { ADMIN_INVITE_SAME_ORG_ERROR, ADMIN_INVITE_UNAVAILABLE_ERROR } from "@/lib/admin-invitation"

const DAY = 24 * 60 * 60 * 1000
const holder = (over: object = {}) => ({
  id: "old-1",
  organizationId: "org-b",
  isActive: false,
  setupTokenHash: "old-hash",
  setupTokenExpiresAt: new Date(Date.now() - DAY),
  ...over,
})
const invite = () => new Request("http://localhost/x", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email: "Camille@Example.org", name: "Camille" }),
})

async function post() {
  const { POST } = await import("@/app/api/admin/settings/admins/route")
  return POST(invite())
}

describe("POST /api/admin/settings/admins with an address already held (#1053)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    m.guard.mockResolvedValue({
      db: { organization: { findUnique: vi.fn().mockResolvedValue({ name: "Org A", outboundEmailApprovedAt: new Date() }) } },
      organizationId: "org-a",
      session: { user: { id: "owner-1", email: "owner@x.ch", role: "admin" } },
    })
    m.deleteMany.mockResolvedValue({ count: 1 })
    m.count.mockResolvedValue(1) // the holder's organisation has an active admin
    m.create.mockImplementation(async ({ data }: { data: { email: string; name: string; role: string } }) => ({ id: "new-1", ...data, isActive: false }))
    m.enqueue.mockResolvedValue(["row-1"])
  })

  it("looks the address up case-insensitively, like the unique index", async () => {
    m.findFirst.mockResolvedValue(null)
    expect((await post()).status).toBe(201)
    expect(m.findFirst.mock.calls[0][0].where).toEqual({ email: { equals: "camille@example.org", mode: "insensitive" } })
    expect(m.deleteMany).not.toHaveBeenCalled()
  })

  it("replaces an expired invitation of another organisation, only while it is still that expired invitation", async () => {
    m.findFirst.mockResolvedValue(holder())
    const res = await post()
    expect(res.status).toBe(201)
    const where = m.deleteMany.mock.calls[0][0].where
    expect(where).toMatchObject({ id: "old-1", isActive: false, setupTokenHash: "old-hash" })
    expect(where.setupTokenExpiresAt.lt).toBeInstanceOf(Date)
    expect(m.count).toHaveBeenCalledWith({ where: { organizationId: "org-b", isActive: true } })
    expect(m.create.mock.calls[0][0].data).toMatchObject({ organizationId: "org-a", email: "camille@example.org", isActive: false })
    expect(m.deleteMany.mock.invocationCallOrder[0]).toBeLessThan(m.create.mock.invocationCallOrder[0])
    expect(m.enqueue).toHaveBeenCalledTimes(1)
  })

  it("leaves an invitation that expired less than an hour ago alone (an activation may be finishing)", async () => {
    m.findFirst.mockResolvedValue(holder({ setupTokenExpiresAt: new Date(Date.now() - 5 * 60 * 1000) }))
    const res = await post()
    expect(res.status).toBe(409)
    expect(m.deleteMany).not.toHaveBeenCalled()
    expect(m.create).not.toHaveBeenCalled()
  })

  it("lets the same organisation invite again once its invitation has expired", async () => {
    m.findFirst.mockResolvedValue(holder({ organizationId: "org-a" }))
    expect((await post()).status).toBe(201)
    expect(m.deleteMany).toHaveBeenCalledTimes(1)
    expect(m.create).toHaveBeenCalledTimes(1)
  })

  it("keeps the expired first account of another space with no active admin (sign-up owner, operator-created)", async () => {
    m.findFirst.mockResolvedValue(holder())
    m.count.mockResolvedValue(0)
    const res = await post()
    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({ error: ADMIN_INVITE_UNAVAILABLE_ERROR })
    expect(m.deleteMany).not.toHaveBeenCalled()
    expect(m.create).not.toHaveBeenCalled()
  })

  it("refuses a valid invitation of another organisation without saying where the address is used", async () => {
    m.findFirst.mockResolvedValue(holder({ setupTokenExpiresAt: new Date(Date.now() + DAY) }))
    const res = await post()
    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({ error: ADMIN_INVITE_UNAVAILABLE_ERROR })
    expect(m.deleteMany).not.toHaveBeenCalled()
    expect(m.create).not.toHaveBeenCalled()
  })

  it("never touches an active account, here or elsewhere", async () => {
    m.findFirst.mockResolvedValue(holder({ isActive: true, setupTokenHash: null, setupTokenExpiresAt: null }))
    const elsewhere = await post()
    expect(elsewhere.status).toBe(409)
    expect(await elsewhere.json()).toEqual({ error: ADMIN_INVITE_UNAVAILABLE_ERROR })

    m.findFirst.mockResolvedValue(holder({ organizationId: "org-a", isActive: true, setupTokenHash: null, setupTokenExpiresAt: null }))
    const here = await post()
    expect(here.status).toBe(409)
    expect(await here.json()).toEqual({ error: ADMIN_INVITE_SAME_ORG_ERROR })
    expect(m.deleteMany).not.toHaveBeenCalled()
    expect(m.create).not.toHaveBeenCalled()
  })

  it("tells the same organisation its invitation is still valid", async () => {
    m.findFirst.mockResolvedValue(holder({ organizationId: "org-a", setupTokenExpiresAt: new Date(Date.now() + DAY) }))
    const res = await post()
    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({ error: ADMIN_INVITE_SAME_ORG_ERROR })
    expect(m.create).not.toHaveBeenCalled()
  })

  it("creates nothing when the expired invitation was activated or renewed meanwhile", async () => {
    m.findFirst.mockResolvedValue(holder())
    m.deleteMany.mockResolvedValue({ count: 0 })
    const res = await post()
    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({ error: ADMIN_INVITE_UNAVAILABLE_ERROR })
    expect(m.create).not.toHaveBeenCalled()
    expect(m.enqueue).not.toHaveBeenCalled()
  })

  it("answers the same conflict when the address is taken between the check and the write", async () => {
    m.findFirst.mockResolvedValue(null)
    m.create.mockRejectedValue(Object.assign(new Error("unique"), { code: "P2002" }))
    const res = await post()
    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({ error: ADMIN_INVITE_UNAVAILABLE_ERROR })
    expect(m.orgLog).not.toHaveBeenCalled()
  })
})
