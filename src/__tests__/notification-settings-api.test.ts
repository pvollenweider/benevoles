import { describe, it, expect, vi, beforeEach } from "vitest"

// Notification settings per organization (#381): read, patch, test email.

const m = vi.hoisted(() => ({
  findUnique: vi.fn(), update: vi.fn(), logOrgEvent: vi.fn(), enqueue: vi.fn().mockResolvedValue(["n1"]), deliver: vi.fn(), rateLimit: vi.fn().mockResolvedValue({ ok: true }),
}))
vi.mock("@/lib/auth-guard", () => ({
  requireOrgSession: vi.fn().mockResolvedValue({ db: {}, organizationId: "org-a", session: { user: { id: "adm-1", email: "lea@org.ch", name: "Léa" } } }),
}))
vi.mock("@/lib/prisma", () => ({ prisma: { organization: { findUnique: m.findUnique, update: m.update } } }))
vi.mock("@/lib/org-log", () => ({ logOrgEvent: m.logOrgEvent, adminActor: () => ({ type: "admin", id: "adm-1" }) }))
vi.mock("@/lib/notifications/outbox", () => ({ enqueueNotifications: m.enqueue, deliverAfterResponse: m.deliver }))
vi.mock("@/lib/rate-limit", () => ({ rateLimit: m.rateLimit }))

const patch = (body: unknown) => new Request("http://localhost/api/admin/settings/notifications", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })

describe("notification settings API", () => {
  beforeEach(() => { vi.clearAllMocks(); m.rateLimit.mockResolvedValue({ ok: true }) })

  it("GET returns defaults for an organization that never set anything", async () => {
    m.findUnique.mockResolvedValue({ replyToEmail: null, notificationSettings: null })
    const { GET } = await import("@/app/api/admin/settings/notifications/route")
    const body = await (await GET()).json()
    expect(body).toEqual({ replyToEmail: null, settings: { reminders: { j2: true, j1: true, dd: true }, signupAdminEmail: true, withdrawalAdminEmail: true } })
  })

  it("PATCH merges a partial change on the session's organization and logs it", async () => {
    m.findUnique.mockResolvedValue({ replyToEmail: null, notificationSettings: { reminders: { j2: false } } })
    m.update.mockImplementation(async ({ data }: { data: { replyToEmail: string | null; notificationSettings: unknown } }) => data)
    const { PATCH } = await import("@/app/api/admin/settings/notifications/route")
    const res = await PATCH(patch({ replyToEmail: "Contact@Org.ch", settings: { reminders: { dd: false } } }))
    expect(res.status).toBe(200)
    const call = m.update.mock.calls[0][0]
    expect(call.where).toEqual({ id: "org-a" })
    expect(call.data).toEqual({ replyToEmail: "contact@org.ch", notificationSettings: { reminders: { j2: false, j1: true, dd: false }, signupAdminEmail: true, withdrawalAdminEmail: true } })
    expect(m.logOrgEvent).toHaveBeenCalledWith(expect.objectContaining({ organizationId: "org-a", action: "organization.notifications_updated", entityType: "Organization" }))
    expect((await res.json()).settings.reminders).toEqual({ j2: false, j1: true, dd: false })
  })

  it("PATCH rejects a bad address and logs nothing when nothing changes", async () => {
    const { PATCH } = await import("@/app/api/admin/settings/notifications/route")
    expect((await PATCH(patch({ replyToEmail: "nope" }))).status).toBe(400)
    m.findUnique.mockResolvedValue({ replyToEmail: "c@o.ch", notificationSettings: null })
    m.update.mockResolvedValue({ replyToEmail: "c@o.ch", notificationSettings: { reminders: { j2: true, j1: true, dd: true }, signupAdminEmail: true } })
    await PATCH(patch({ replyToEmail: "c@o.ch" }))
    expect(m.logOrgEvent).not.toHaveBeenCalled()
  })

  it("test email goes to the admin who asks, through the outbox with the organization, throttled", async () => {
    m.findUnique.mockResolvedValue({ name: "Org A", slug: "org-a", replyToEmail: "c@o.ch" })
    const { POST } = await import("@/app/api/admin/settings/notifications/test/route")
    const res = await POST()
    expect(res.status).toBe(200)
    expect(m.enqueue).toHaveBeenCalledWith([expect.objectContaining({ kind: "targeted_message", organizationId: "org-a", recipient: { email: "lea@org.ch", name: "Léa" } })])
    expect(m.enqueue.mock.calls[0][0][0].data.message).toContain("c@o.ch")
    expect(m.deliver).toHaveBeenCalledWith(["n1"])
    m.rateLimit.mockResolvedValue({ ok: false })
    expect((await POST()).status).toBe(429)
  })
})
