import { describe, it, expect, vi, beforeEach } from "vitest"

// #597: a refused test email (SMTP error) must be reported as a failure, never as sent. The test
// email is the one invitation sent directly (#1105: invitations and reminders go through the
// outbox, src/__tests__/invitations-outbox-api.test.ts). `sendNotification` is mocked directly (not
// `sendMemberInvite`) so the real `sendMemberInvite` is exercised end to end.

vi.mock("@/lib/env", () => ({ env: {} }))

const requireOrgSessionMock = vi.hoisted(() => vi.fn())
vi.mock("@/lib/auth-guard", () => ({ requireOrgSession: requireOrgSessionMock }))

vi.mock("@/lib/event-log", () => ({
  adminActor: () => ({ type: "admin", id: "adm-1" }),
  logEvent: vi.fn().mockResolvedValue("log-1"),
}))
vi.mock("@/lib/token-vault", () => ({
  linkToken: {
    data: () => ({ tokenHash: "h", tokenEnc: "e", tokenLegacy: null }),
    select: { tokenEnc: true, tokenLegacy: true },
    reveal: () => "tok-clear",
  },
}))

const sendNotificationMock = vi.hoisted(() => vi.fn())
vi.mock("@/lib/notifications", () => ({ sendNotification: sendNotificationMock }))

const event = {
  id: "evt-1",
  title: "Festival",
  slug: "festival",
  startDate: new Date("2026-06-01T00:00:00Z"),
  location: "Lausanne",
  organization: { name: "Org", slug: "org" },
}

function postReq(url: string, body: unknown) {
  return new Request(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

function params(id = "evt-1") {
  return { params: Promise.resolve({ id }) }
}

describe("POST /api/admin/events/[id]/invitations/test-email", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("answers an error status when the send is refused, without the SMTP reason", async () => {
    requireOrgSessionMock.mockResolvedValue({
      session: { user: { id: "adm-1" } },
      db: { event: { findFirst: vi.fn().mockResolvedValue(event) } },
    })
    sendNotificationMock.mockResolvedValue({ ok: false, reason: "550 5.1.1 mailbox unavailable" })

    const { POST } = await import("@/app/api/admin/events/[id]/invitations/test-email/route")
    const res = await POST(postReq("http://localhost/api/admin/events/evt-1/invitations/test-email", { email: "test@x.ch" }), params())
    expect(res.status).toBe(502)
    const data = await res.json()
    expect(data.error).toBe("Échec de l'envoi de l'email.")
    expect(JSON.stringify(data)).not.toContain("550")
    expect(JSON.stringify(data)).not.toContain("test@x.ch")
  })

  it("answers ok when the send succeeds", async () => {
    requireOrgSessionMock.mockResolvedValue({
      session: { user: { id: "adm-1" } },
      db: { event: { findFirst: vi.fn().mockResolvedValue(event) } },
    })
    sendNotificationMock.mockResolvedValue({ ok: true })

    const { POST } = await import("@/app/api/admin/events/[id]/invitations/test-email/route")
    const res = await POST(postReq("http://localhost/api/admin/events/evt-1/invitations/test-email", { email: "test@x.ch" }), params())
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
  })
})
