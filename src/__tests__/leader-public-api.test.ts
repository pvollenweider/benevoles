import { describe, it, expect, vi, beforeEach } from "vitest"

// The link's organisation, open: its links give data (src/lib/org-lifecycle.ts).
const OPEN_ORG = { active: true, suspendedAt: null }

const findUnique = vi.hoisted(() => vi.fn())
const findMany = vi.hoisted(() => vi.fn())
// The role's shifts with a minimum of people (#949); none unless a test says so.
const shiftFindMany = vi.hoisted(() => vi.fn<(args?: unknown) => Promise<unknown[]>>(async () => []))
const sectorFindFirst = vi.hoisted(() => vi.fn())
const sectorFindMany = vi.hoisted(() => vi.fn<(args?: unknown) => Promise<unknown[]>>(async () => []))
vi.mock("@/lib/prisma", () => ({
  prisma: { sectorLeader: { findUnique }, registration: { findMany }, shift: { findMany: shiftFindMany }, sector: { findFirst: sectorFindFirst, findMany: sectorFindMany } },
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

  it("keeps a poste leader's heading of before #1169 without sectors, « Responsable de poste » with them", async () => {
    const event = { id: "evt-1", title: "Festival", slug: "festival", organization: OPEN_ORG, sectorsEnabled: false, sectorsAdoptedAt: null }
    findUnique.mockResolvedValue({ id: "l1", eventId: "evt-1", roleName: "Bar", sectorId: null, name: "Alice", event })
    findMany.mockResolvedValue([])
    const { GET } = await import("@/app/api/public/leader/[token]/route")
    const without = await (await GET(get("tok"), { params: Promise.resolve({ token: "tok" }) })).json()
    expect(without).toMatchObject({ heading: "Responsable · Bar", roleName: "Bar", scope: { kind: "poste", name: "Bar" }, postes: ["Bar"] })
    findUnique.mockResolvedValue({ id: "l1", eventId: "evt-1", roleName: "Bar", sectorId: null, name: "Alice", event: { ...event, sectorsAdoptedAt: new Date() } })
    const withSectors = await (await GET(get("tok"), { params: Promise.resolve({ token: "tok" }) })).json()
    expect(withSectors.heading).toBe("Responsable de poste · Bar")
  })
})

describe("GET /api/public/leader/[token] for a sector leader (#1169)", () => {
  const event = { id: "evt-1", title: "Festival", slug: "festival", organization: OPEN_ORG, sectorsEnabled: true, sectorsAdoptedAt: new Date("2026-10-01") }
  const parking = { id: "l2", eventId: "evt-1", roleName: null, sectorId: "sec-parking", name: "Paula", event }
  // Live shifts of the event: Nord, Sud and École in Parking, Bar elsewhere.
  const live = [
    { roleName: "Parking Nord", sectorId: "sec-parking", updatedAt: new Date() },
    { roleName: "Parking Sud", sectorId: "sec-parking", updatedAt: new Date() },
    { roleName: "École", sectorId: "sec-parking", updatedAt: new Date() },
    { roleName: "Bar", sectorId: null, updatedAt: new Date() },
  ]

  beforeEach(() => {
    vi.clearAllMocks()
    findUnique.mockResolvedValue(parking)
    sectorFindFirst.mockResolvedValue({ name: "Parking" })
    sectorFindMany.mockResolvedValue([{ id: "sec-parking", archivedAt: null }])
    findMany.mockResolvedValue([])
    shiftFindMany.mockImplementation(async (args?: unknown) => ((args as { select: { updatedAt?: boolean } }).select.updatedAt ? live : []))
  })

  it("aggregates the postes of the sector only, read before any registration (B05)", async () => {
    const { GET } = await import("@/app/api/public/leader/[token]/route")
    const body = await (await GET(get("tok"), { params: Promise.resolve({ token: "tok" }) })).json()
    expect(body).toMatchObject({ heading: "Responsable de secteur · Parking", scope: { kind: "sector", name: "Parking" }, postes: ["École", "Parking Nord", "Parking Sud"] })
    expect(sectorFindFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "sec-parking", eventId: "evt-1" } }))
    const scoped = { in: ["École", "Parking Nord", "Parking Sud"] }
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { eventId: "evt-1", status: { in: ["active", "waiting"] }, shift: { roleName: scoped } } }))
    expect(shiftFindMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ roleName: scoped, minVolunteers: { not: null } }) }))
  })

  it("B02: a poste moved out of the sector is gone on the next request", async () => {
    shiftFindMany.mockImplementation(async (args?: unknown) => ((args as { select: { updatedAt?: boolean } }).select.updatedAt ? live.map((s) => (s.roleName === "École" ? { ...s, sectorId: null } : s)) : []))
    const { GET } = await import("@/app/api/public/leader/[token]/route")
    const body = await (await GET(get("tok"), { params: Promise.resolve({ token: "tok" }) })).json()
    expect(body.postes).toEqual(["Parking Nord", "Parking Sud"])
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ shift: { roleName: { in: ["Parking Nord", "Parking Sud"] } } }) }))
  })

  it("an archived sector shows no poste and reads no registration", async () => {
    sectorFindMany.mockResolvedValue([{ id: "sec-parking", archivedAt: new Date() }])
    const { GET } = await import("@/app/api/public/leader/[token]/route")
    const body = await (await GET(get("tok"), { params: Promise.resolve({ token: "tok" }) })).json()
    expect(body.postes).toEqual([])
    expect(body.registrations).toEqual([])
    expect(findMany).not.toHaveBeenCalled()
  })

  it("a sector of another event gives nothing (404)", async () => {
    sectorFindFirst.mockResolvedValue(null)
    const { GET } = await import("@/app/api/public/leader/[token]/route")
    const res = await GET(get("tok"), { params: Promise.resolve({ token: "tok" }) })
    expect(res.status).toBe(404)
    expect(findMany).not.toHaveBeenCalled()
  })

  it("B02: a revoked leader's link gives nothing", async () => {
    findUnique.mockResolvedValue(null)
    const { GET } = await import("@/app/api/public/leader/[token]/route")
    expect((await GET(get("tok"), { params: Promise.resolve({ token: "tok" }) })).status).toBe(404)
    expect(findMany).not.toHaveBeenCalled()
  })

  it("never returns internal notes, question answers or the volunteer's id", async () => {
    findMany.mockResolvedValue([{
      id: "r1", status: "active", comment: "Je viens à vélo", internalNote: "secret", answers: [{ value: "x" }],
      volunteer: { id: "v1", firstName: "Bob", lastName: "L", email: "bob@x.com", phone: "079", notes: "secret" },
      shift: { roleName: "Parking Nord", label: "Matin", date: new Date("2030-06-01"), startTime: "08:00", endTime: "12:00", internalNotes: "secret" },
    }])
    const { GET } = await import("@/app/api/public/leader/[token]/route")
    const text = await (await GET(get("tok"), { params: Promise.resolve({ token: "tok" }) })).text()
    expect(text).not.toContain("secret")
    expect(text).not.toContain("\"v1\"")
    expect(JSON.parse(text).registrations[0].shift.roleName).toBe("Parking Nord")
  })
})

