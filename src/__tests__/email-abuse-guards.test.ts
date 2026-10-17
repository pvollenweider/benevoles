import { describe, it, expect, vi, beforeEach } from "vitest"

// #1045: the invitation test email goes out for the organisation of the session (send guard and
// a per-organisation quota), and an owner-issued admin invitation never hands the setup link back
// to the owner; a space awaiting validation invites nobody yet.

vi.mock("@/lib/env", () => ({ env: {} }))

const m = vi.hoisted(() => ({
  guard: vi.fn(),
  send: vi.fn(),
  enqueue: vi.fn(),
  adminFindUnique: vi.fn(),
  adminCreate: vi.fn(),
  orgLog: vi.fn(),
}))
vi.mock("@/lib/auth-guard", () => ({ requireOrgSession: m.guard }))
vi.mock("@/lib/notifications", () => ({ sendNotification: m.send }))
vi.mock("@/lib/notifications/outbox", () => ({ enqueueNotifications: m.enqueue, deliverAfterResponse: () => {} }))
vi.mock("@/lib/prisma", () => ({
  prisma: {
    adminUser: { findUnique: m.adminFindUnique, create: m.adminCreate },
    orgLog: { create: m.orgLog },
    async $transaction(fn: (tx: unknown) => unknown) { return fn(this) },
  },
}))
vi.mock("bcryptjs", () => ({ default: { hash: vi.fn().mockResolvedValue("$h") }, hash: vi.fn().mockResolvedValue("$h") }))

const event = {
  id: "evt-1",
  title: "Festival",
  slug: "festival",
  startDate: new Date("2026-06-01T00:00:00Z"),
  location: "Lausanne",
  organization: { name: "Org", slug: "org" },
}

const post = (url: string, body: unknown) =>
  new Request(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })

describe("POST /api/admin/events/[id]/invitations/test-email (#1045)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    m.send.mockResolvedValue({ ok: true })
  })

  const asOrg = (organizationId: string) =>
    m.guard.mockResolvedValue({ organizationId, session: { user: { id: "adm" } }, db: { event: { findFirst: vi.fn().mockResolvedValue(event) } } })

  const sendTest = async () => {
    const { POST } = await import("@/app/api/admin/events/[id]/invitations/test-email/route")
    return POST(post("http://localhost/x", { email: "anyone@example.org" }), { params: Promise.resolve({ id: "evt-1" }) })
  }

  it("sends for the organisation of the session, so the organisation send guard applies", async () => {
    asOrg("org-guarded")
    expect((await sendTest()).status).toBe(200)
    expect(m.send).toHaveBeenCalledWith(expect.objectContaining({ kind: "member_invite", organizationId: "org-guarded" }))
  })

  it("explains a refusal of a space awaiting validation", async () => {
    asOrg("org-pending")
    m.send.mockResolvedValue({ ok: false, reason: "org_pending", permanent: true, blocked: true })
    const res = await sendTest()
    expect(res.status).toBe(403)
    expect((await res.json()).error).toMatch(/en attente de validation/)
  })

  it("allows five tests an hour per organisation, then refuses without sending", async () => {
    asOrg("org-quota")
    for (let i = 0; i < 5; i++) expect((await sendTest()).status).toBe(200)
    const res = await sendTest()
    expect(res.status).toBe(429)
    expect(m.send).toHaveBeenCalledTimes(5)
    // Another organisation keeps its own quota.
    asOrg("org-other")
    expect((await sendTest()).status).toBe(200)
  })
})

describe("POST /api/admin/settings/admins (#1045)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    m.adminFindUnique.mockResolvedValue(null)
    m.adminCreate.mockResolvedValue({ id: "adm-2", name: "Léa", email: "lea@example.org", role: "organizer", isActive: false, createdAt: new Date(), setupTokenExpiresAt: new Date() })
    m.enqueue.mockResolvedValue(["row-1"])
    m.orgLog.mockResolvedValue({ id: "log" })
  })

  const asOwner = (outboundEmailApprovedAt: Date | null) =>
    m.guard.mockResolvedValue({
      organizationId: "org-a",
      session: { user: { id: "owner", email: "owner@example.org", role: "admin" } },
      db: { organization: { findUnique: vi.fn().mockResolvedValue({ name: "Org A", outboundEmailApprovedAt }) } },
    })

  const invite = async () => {
    const { POST } = await import("@/app/api/admin/settings/admins/route")
    return POST(post("http://localhost/x", { name: "Léa", email: "lea@example.org", role: "organizer" }))
  }

  it("never returns the setup link to the owner; it goes in the invitation email only", async () => {
    asOwner(new Date())
    const res = await invite()
    expect(res.status).toBe(201)
    const text = await res.text()
    expect(text).not.toMatch(/accept-invite|inviteUrl/)
    const [payloads] = m.enqueue.mock.calls[0]
    expect(payloads[0]).toMatchObject({ kind: "admin_invite", recipient: { email: "lea@example.org" } })
    const link = String(payloads[0].data.inviteUrl)
    expect(link).toMatch(/\/admin\/accept-invite\?token=[0-9a-f]{64}$/)
    expect(text).not.toContain(link.slice(-64))
  })

  it("defers the invitation while the space awaits validation: no account, no email", async () => {
    asOwner(null)
    const res = await invite()
    expect(res.status).toBe(403)
    const body = await res.json()
    expect(body.code).toBe("org_pending")
    expect(body.error).toMatch(/une fois qu'il sera validé/)
    expect(m.adminCreate).not.toHaveBeenCalled()
    expect(m.enqueue).not.toHaveBeenCalled()
  })
})
