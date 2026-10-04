import { describe, it, expect, vi, beforeEach } from "vitest"

// #597: the other synchronous senders already test `result.ok` — this is the regression test
// that was missing for the super-admin "(re)send activation link" route. The token is rotated
// regardless of the email outcome (the caller needs the fresh link either way), so this route
// reports `sent: false` rather than an error status — unlike the invitation routes.

const requireSuperAdminMock = vi.hoisted(() => vi.fn())
vi.mock("@/lib/auth-guard", () => ({ requireSuperAdmin: requireSuperAdminMock }))

const sendNotificationMock = vi.hoisted(() => vi.fn())
vi.mock("@/lib/notifications", () => ({ sendNotification: sendNotificationMock }))

const admin = { id: "adm-1", email: "pending@x.ch", name: "Pending" }

function setupGuard() {
  requireSuperAdminMock.mockResolvedValue({
    db: undefined,
  })
}

const orgFindUnique = vi.hoisted(() => vi.fn())
const adminUserUpdate = vi.hoisted(() => vi.fn())
vi.mock("@/lib/prisma", () => ({
  prisma: {
    organization: { findUnique: orgFindUnique },
    adminUser: { update: adminUserUpdate },
  },
}))

function post() {
  return new Request("http://localhost/x", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" })
}

describe("POST /api/super-admin/organizations/[id]/send-invite", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setupGuard()
    orgFindUnique.mockResolvedValue({ name: "Org", admins: [admin] })
    adminUserUpdate.mockResolvedValue({})
  })

  it("reports sent: false when the email is refused, without the SMTP reason", async () => {
    sendNotificationMock.mockResolvedValue({ ok: false, reason: "550 5.1.1 mailbox unavailable" })
    const { POST } = await import("@/app/api/super-admin/organizations/[id]/send-invite/route")
    const res = await POST(post(), { params: Promise.resolve({ id: "org-1" }) })
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.sent).toBe(false)
  })

  it("reports sent: true when the email goes through", async () => {
    sendNotificationMock.mockResolvedValue({ ok: true })
    const { POST } = await import("@/app/api/super-admin/organizations/[id]/send-invite/route")
    const res = await POST(post(), { params: Promise.resolve({ id: "org-1" }) })
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.sent).toBe(true)
    expect(data.emailError).toBeNull()
  })
})
