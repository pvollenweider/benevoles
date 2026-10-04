import { describe, it, expect, vi, beforeEach } from "vitest"

// #597: the other synchronous senders already test `result.ok` — this is the regression test
// that was missing for the manual "send reminder" route.

const requireOrgSessionMock = vi.hoisted(() => vi.fn())
vi.mock("@/lib/auth-guard", () => ({ requireOrgSession: requireOrgSessionMock }))

const sendNotificationMock = vi.hoisted(() => vi.fn())
vi.mock("@/lib/notifications", () => ({ sendNotification: sendNotificationMock }))
vi.mock("@/lib/token-vault", () => ({ registrationToken: { reveal: () => "tok-clear" } }))

const event = {
  id: "evt-1",
  organizationId: "org-a",
  title: "Festival",
  reminderMessage: "À bientôt !",
  organization: { name: "Org", slug: "org" },
}

function regs() {
  return [
    {
      volunteerId: "vol-1",
      volunteer: { id: "vol-1", firstName: "Alice", email: "alice@x.ch" },
      shift: { label: "Accueil", roleName: "Rôle", date: new Date("2026-06-01T00:00:00Z"), startTime: "09:00", endTime: "12:00" },
    },
    {
      volunteerId: "vol-2",
      volunteer: { id: "vol-2", firstName: "Bob", email: "bob@x.ch" },
      shift: { label: "Buvette", roleName: "Rôle", date: new Date("2026-06-01T00:00:00Z"), startTime: "12:00", endTime: "15:00" },
    },
  ]
}

function setupGuard() {
  requireOrgSessionMock.mockResolvedValue({
    db: {
      event: { findFirst: vi.fn().mockResolvedValue(event), update: vi.fn().mockResolvedValue(event) },
      registration: { findMany: vi.fn().mockResolvedValue(regs()) },
    },
  })
}

describe("POST /api/admin/events/[id]/send-reminder", () => {
  beforeEach(() => vi.clearAllMocks())

  it("counts a refused send in failed, not sent", async () => {
    setupGuard()
    sendNotificationMock
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({ ok: false, reason: "smtp down" })

    const { POST } = await import("@/app/api/admin/events/[id]/send-reminder/route")
    const res = await POST(new Request("http://localhost/x", { method: "POST" }), { params: Promise.resolve({ id: "evt-1" }) })
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data).toEqual({ sent: 1, failed: 1, totalVolunteers: 2 })
  })
})
