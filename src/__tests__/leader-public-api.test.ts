import { describe, it, expect, vi, beforeEach } from "vitest"

const findUnique = vi.hoisted(() => vi.fn())
const findMany = vi.hoisted(() => vi.fn())
vi.mock("@/lib/prisma", () => ({
  prisma: { sectorLeader: { findUnique }, registration: { findMany } },
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
      event: { id: "evt-1", title: "Festival", slug: "festival" },
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
})
