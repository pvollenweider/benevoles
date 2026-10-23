import { describe, it, expect, vi, beforeEach } from "vitest"
import { hashToken } from "@/lib/token-hash"
import { keepLinkValid, keepUpdate } from "@/lib/org-keep"

// « Conserver mon organisation » (#811): a link of the check's emails, looked up by its hash, used
// once for the whole organisation, never for a space already deactivated or suspended.

const m = vi.hoisted(() => ({
  find: vi.fn(), orgUpdate: vi.fn(), linksDelete: vi.fn(), orgLog: vi.fn(), lock: vi.fn(),
  stepsFind: vi.fn(async () => [{ id: "step-1" }]), stepsDelete: vi.fn(), outboxCancel: vi.fn(),
}))
vi.mock("@/lib/prisma", () => {
  const db = {
    orgKeepLink: { findUnique: m.find, deleteMany: m.linksDelete },
    organization: { update: m.orgUpdate },
    orgLog: { create: m.orgLog },
    orgInactivityStep: { findMany: m.stepsFind, deleteMany: m.stepsDelete },
    notificationOutbox: { updateMany: m.outboxCancel },
    $queryRaw: m.lock,
    async $transaction(fn: (tx: unknown) => unknown) { return fn(db) },
  }
  return { prisma: db }
})

const post = (body: unknown) => new Request("http://localhost/api/public/org-keep", {
  method: "POST",
  headers: { "Content-Type": "application/json", "x-forwarded-for": `t-${Math.random()}` },
  body: JSON.stringify(body),
})
const secret = "b".repeat(64)
const active = { name: "Fête du village", active: true, suspendedAt: null }

beforeEach(() => { vi.clearAllMocks(); m.find.mockReset() })

describe("keep link rule (#811)", () => {
  it("works before expiry, for an active space only", () => {
    const now = new Date("2027-06-10T00:00:00Z")
    const link = { expiresAt: new Date("2027-08-15T00:00:00Z"), organization: active }
    expect(keepLinkValid(link, now)).toBe(true)
    expect(keepLinkValid({ ...link, expiresAt: new Date("2027-06-09T00:00:00Z") }, now)).toBe(false)
    expect(keepLinkValid({ ...link, organization: { ...active, active: false } }, now)).toBe(false)
    expect(keepLinkValid({ ...link, organization: { ...active, suspendedAt: new Date() } }, now)).toBe(false)
  })

  it("records the confirmation and stops the procedure", () => {
    const now = new Date("2027-06-10T00:00:00Z")
    expect(keepUpdate(now)).toEqual({ lastRetentionConfirmedAt: now, inactivityNoticeAt: null, inactivityEmailsSent: 0 })
  })
})

describe("POST /api/public/org-keep (#811)", () => {
  it("keeps the space, deletes every link of the organisation and logs who answered", async () => {
    m.find.mockResolvedValue({ organizationId: "org-1", adminUserId: "a1", expiresAt: new Date(Date.now() + 86_400_000), organization: active })
    const { POST } = await import("@/app/api/public/org-keep/route")
    expect(await (await POST(post({ token: secret }))).json()).toEqual({ ok: true, organizationName: "Fête du village" })
    expect(m.find.mock.calls[0][0].where).toEqual({ tokenHash: hashToken(secret) })
    // The organisation row is locked before the link is read again (#1114).
    expect(m.lock).toHaveBeenCalledTimes(1)
    expect(m.find).toHaveBeenCalledTimes(2)
    expect(m.orgUpdate).toHaveBeenCalledWith({ where: { id: "org-1" }, data: expect.objectContaining({ inactivityNoticeAt: null, inactivityEmailsSent: 0 }) })
    expect(m.orgUpdate).toHaveBeenCalledWith({ where: { id: "org-1" }, data: expect.objectContaining({ inactivityPlannedAt: null, inactivityBlockedAt: null }) })
    expect(m.linksDelete).toHaveBeenCalledWith({ where: { organizationId: "org-1" } })
    // The procedure's queued reminders are cancelled and its steps deleted.
    expect(m.outboxCancel).toHaveBeenCalledWith({ where: { inactivityStepId: { in: ["step-1"] }, status: "pending" }, data: expect.objectContaining({ status: "cancelled" }) })
    expect(m.stepsDelete).toHaveBeenCalledWith({ where: { organizationId: "org-1" } })
    expect(m.orgLog).toHaveBeenCalledWith({ data: expect.objectContaining({ action: "organization.kept", actorId: "a1" }) })
  })

  it("refuses a link that stopped working while waiting for the lock (deactivated meanwhile)", async () => {
    const { POST } = await import("@/app/api/public/org-keep/route")
    m.find
      .mockResolvedValueOnce({ organizationId: "org-1", adminUserId: "a1", expiresAt: new Date(Date.now() + 86_400_000), organization: active })
      .mockResolvedValueOnce(null)
    expect((await POST(post({ token: secret }))).status).toBe(400)
    expect(m.orgUpdate).not.toHaveBeenCalled()
  })

  it("refuses an unknown, expired or short link, and a deactivated space", async () => {
    const { POST } = await import("@/app/api/public/org-keep/route")
    m.find.mockResolvedValueOnce(null)
    expect((await POST(post({ token: secret }))).status).toBe(400)
    m.find.mockResolvedValue({ organizationId: "org-1", adminUserId: "a1", expiresAt: new Date(Date.now() - 1000), organization: active })
    expect((await POST(post({ token: secret }))).status).toBe(400)
    m.find.mockResolvedValue({ organizationId: "org-1", adminUserId: "a1", expiresAt: new Date(Date.now() + 1000), organization: { ...active, active: false } })
    expect((await POST(post({ token: secret }))).status).toBe(400)
    expect((await POST(post({ token: "short" }))).status).toBe(400)
    expect(m.orgUpdate).not.toHaveBeenCalled()
  })
})
