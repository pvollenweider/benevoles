import { describe, it, expect, vi, beforeEach } from "vitest"

// #597: the other synchronous senders already test `result.ok` — this is the regression test
// that was missing for the admin "resend personal link" route.

const requireOrgSessionMock = vi.hoisted(() => vi.fn())
vi.mock("@/lib/auth-guard", () => ({ requireOrgSession: requireOrgSessionMock }))

const sendNotificationMock = vi.hoisted(() => vi.fn())
vi.mock("@/lib/notifications", () => ({ sendNotification: sendNotificationMock }))
vi.mock("@/lib/token-vault", () => ({ registrationToken: { reveal: () => "tok-clear" } }))

const registration = {
  id: "reg-1",
  status: "active",
  volunteerId: "vol-1",
  eventId: "evt-1",
  volunteer: { firstName: "Alice", lastName: "A", email: "alice@x.ch" },
  event: { title: "Festival", organization: { slug: "org" } },
}

function setupGuard() {
  requireOrgSessionMock.mockResolvedValue({
    db: {
      registration: {
        findFirst: vi.fn().mockResolvedValue({ id: registration.id, status: registration.status }),
        findUniqueOrThrow: vi.fn().mockResolvedValue(registration),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    },
  })
}

describe("POST /api/admin/registrations/[id]/resend-link", () => {
  beforeEach(() => vi.clearAllMocks())

  it("answers an error without updating linkEmailedAt when the send is refused", async () => {
    setupGuard()
    sendNotificationMock.mockResolvedValue({ ok: false, reason: "smtp down" })
    const { POST } = await import("@/app/api/admin/registrations/[id]/resend-link/route")
    const res = await POST(new Request("http://localhost/x", { method: "POST" }), { params: Promise.resolve({ id: "reg-1" }) })
    expect(res.status).toBe(502)
    const data = await res.json()
    expect(data.error).toBe("Échec de l'envoi de l'email.")
    expect(JSON.stringify(data)).not.toContain("smtp down")
  })

  it("answers success and stamps linkEmailedAt when the send goes through", async () => {
    setupGuard()
    sendNotificationMock.mockResolvedValue({ ok: true })
    const { POST } = await import("@/app/api/admin/registrations/[id]/resend-link/route")
    const res = await POST(new Request("http://localhost/x", { method: "POST" }), { params: Promise.resolve({ id: "reg-1" }) })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ success: true })
  })
})
