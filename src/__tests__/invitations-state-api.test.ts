import { describe, it, expect, vi, beforeEach } from "vitest"

// Invitation state and decline exclusions (#558): GET lists the state per member and the
// counters that add up; the relaunch route skips declined members and says how many.

const requireOrgSessionMock = vi.hoisted(() => vi.fn())
vi.mock("@/lib/auth-guard", () => ({ requireOrgSession: requireOrgSessionMock }))
vi.mock("@/lib/token-vault", () => ({ linkToken: { reveal: (r: { tokenLegacy: string }) => r.tokenLegacy } }))
vi.mock("@/lib/notification-helpers", () => ({ sendMemberInvite: vi.fn().mockResolvedValue({ ok: true }) }))

function params(id = "evt-1") {
  return { params: Promise.resolve({ id }) }
}

const volunteer = (id: string, email: string | null = `${id}@x.ch`) => ({ id, firstName: id, lastName: "L", email, tags: [], active: true })

describe("GET /api/admin/events/[id]/invitations — state and counters (#558)", () => {
  beforeEach(() => vi.clearAllMocks())

  it("derives registered / not_available / no_answer and the counters add up to the total", async () => {
    const db = {
      event: { findFirst: vi.fn().mockResolvedValue({ id: "evt-1" }) },
      memberInvite: {
        findMany: vi.fn().mockResolvedValue([
          { id: "i-alice", sentAt: new Date("2026-06-01"), usedAt: null, declinedAt: null, volunteer: volunteer("alice") },
          { id: "i-bob", sentAt: new Date("2026-06-01"), usedAt: new Date(), declinedAt: new Date("2026-06-02"), volunteer: volunteer("bob") },
          { id: "i-carla", sentAt: new Date("2026-06-01"), usedAt: null, declinedAt: null, volunteer: volunteer("carla") },
        ]),
      },
      registration: { findMany: vi.fn().mockResolvedValue([{ volunteer: { email: "alice@x.ch" }, shift: { id: "s1", label: "Bar", roleName: "Bar", startTime: "10:00", endTime: "12:00" } }]) },
    }
    requireOrgSessionMock.mockResolvedValue({ db, organizationId: "org-a", session: { user: { id: "adm-1" } } })
    const { GET } = await import("@/app/api/admin/events/[id]/invitations/route")
    const res = await GET(new Request("http://localhost/api/admin/events/evt-1/invitations"), params())
    const body = await res.json()
    expect(body.summary).toEqual({ total: 3, registered: 1, notAvailable: 1, noAnswer: 1 })
    const byId = Object.fromEntries(body.invites.map((i: { id: string; state: string }) => [i.id, i.state]))
    expect(byId).toEqual({ "i-alice": "registered", "i-bob": "not_available", "i-carla": "no_answer" })
  })
})

describe("POST /api/admin/events/[id]/invitations/remind — excludes declined (#558)", () => {
  beforeEach(() => vi.clearAllMocks())

  it("does not relaunch a declined member and reports how many were skipped", async () => {
    const db = {
      event: { findFirst: vi.fn().mockResolvedValue({ id: "evt-1", title: "Fête", slug: "fete", startDate: new Date("2026-06-01"), location: null, organization: { name: "Org", slug: "org" } }) },
      memberInvite: {
        findMany: vi.fn().mockResolvedValue([
          { tokenLegacy: "tok-dan", declinedAt: null, volunteer: { firstName: "Dan", email: "dan@x.ch", active: true } },
          { tokenLegacy: "tok-fred", declinedAt: new Date("2026-06-02"), volunteer: { firstName: "Fred", email: "fred@x.ch", active: true } },
        ]),
      },
      registration: { findMany: vi.fn().mockResolvedValue([]) },
    }
    requireOrgSessionMock.mockResolvedValue({ db, organizationId: "org-a", session: { user: { id: "adm-1" } } })
    const { POST } = await import("@/app/api/admin/events/[id]/invitations/remind/route")
    const res = await POST(new Request("http://localhost/api/admin/events/evt-1/invitations/remind", { method: "POST" }), params())
    const body = await res.json()
    expect(body).toMatchObject({ sent: 1, declinedSkipped: 1 })
  })
})
