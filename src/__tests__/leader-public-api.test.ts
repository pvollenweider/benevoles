import { describe, it, expect, vi, beforeEach } from "vitest"

// The link's organisation, open: its links give data (src/lib/org-lifecycle.ts).
const OPEN_ORG = { active: true, suspendedAt: null }

const findUnique = vi.hoisted(() => vi.fn())
const findMany = vi.hoisted(() => vi.fn())
// The role's shifts with a minimum of people (#949); none unless a test says so.
const shiftFindMany = vi.hoisted(() => vi.fn<(args?: unknown) => Promise<unknown[]>>(async () => []))
vi.mock("@/lib/prisma", () => ({
  prisma: { sectorLeader: { findUnique }, registration: { findMany }, shift: { findMany: shiftFindMany } },
}))

function get(token: string) {
  return new Request(`http://localhost/api/public/leader/${token}`)
}

describe("GET /api/public/leader/[token]", () => {
  beforeEach(() => vi.clearAllMocks())

  it("404s for an unknown token", async () => {
    findUnique.mockResolvedValue(null)
    const { GET } = await import("@/app/api/public/leader/[token]/route")
    const res = await GET(get("nope"), { params: Promise.resolve({ token: "nope" }) })
    expect(res.status).toBe(404)
  })

  it("returns the roster scoped to the leader's roleName, active and waiting only", async () => {
    findUnique.mockResolvedValue({
      id: "l1", eventId: "evt-1", roleName: "Bar", name: "Alice", token: "tok",
      event: { id: "evt-1", title: "Festival", slug: "festival", organization: OPEN_ORG },
    })
    findMany.mockResolvedValue([
      {
        id: "r1", status: "active", comment: null,
        volunteer: { firstName: "Bob", lastName: "L", email: "bob@x.com", phone: "0791234567" },
        shift: { label: "Bar", date: new Date("2026-06-01"), startTime: "18:00", endTime: "22:00" },
      },
    ])
    const { GET } = await import("@/app/api/public/leader/[token]/route")
    const res = await GET(get("tok"), { params: Promise.resolve({ token: "tok" }) })
    expect(res.status).toBe(200)

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { eventId: "evt-1", status: { in: ["active", "waiting"] }, shift: { roleName: "Bar" } },
      }),
    )

    const body = await res.json()
    expect(body.roleName).toBe("Bar")
    expect(body.registrations).toHaveLength(1)
    expect(body.registrations[0].volunteer.email).toBe("bob@x.com")
  })

  it("lists the role's shifts with a minimum and their state, none without one (#949)", async () => {
    findUnique.mockResolvedValue({
      id: "l1", eventId: "evt-1", roleName: "Bar", name: "Alice", token: "tok",
      event: { id: "evt-1", title: "Festival", slug: "festival", organization: OPEN_ORG },
    })
    findMany.mockResolvedValue([])
    shiftFindMany.mockResolvedValueOnce([
      { id: "s1", label: "Bar", date: new Date("2026-06-01"), startTime: "18:00", endTime: "22:00", capacity: 4, minVolunteers: 2, registrations: [{ status: "active" }] },
      { id: "s2", label: "Bar", date: new Date("2026-06-02"), startTime: "18:00", endTime: "22:00", capacity: 4, minVolunteers: 2, registrations: [{ status: "active" }, { status: "requested" }] },
    ])
    const { GET } = await import("@/app/api/public/leader/[token]/route")
    const res = await GET(get("tok"), { params: Promise.resolve({ token: "tok" }) })
    expect(shiftFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { eventId: "evt-1", roleName: "Bar", status: { not: "cancelled" }, minVolunteers: { not: null } },
    }))
    const body = await res.json()
    expect(body.staffing.map((s: { active: number; state: string }) => [s.active, s.state])).toEqual([[1, "below_minimum"], [1, "minimum_reached"]])

    shiftFindMany.mockResolvedValueOnce([])
    const none = await (await GET(get("tok"), { params: Promise.resolve({ token: "tok" }) })).json()
    expect(none.staffing).toEqual([])
  })
})
