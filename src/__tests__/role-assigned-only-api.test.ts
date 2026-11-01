import { describe, it, expect, vi, beforeEach } from "vitest"
// Workload protection (#1171) runs on Postgres (src/__integration__/workload-policy.int.test.ts): off here.
vi.mock("@/lib/workload-guard", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/workload-guard")>()),
  lockWorkloadShared: vi.fn(), lockVolunteerRows: vi.fn(), readWorkloadGate: vi.fn(async () => ({ kind: "off" })),
  committedDuty: vi.fn(async () => []), checkScheduleEdit: vi.fn(async () => []),
}))

// Roles « Attribué par l'organisation uniquement » (#1145): never offered publicly, refused by the
// public sign-up whatever link or shift id comes with it, absent from every public payload.

const OPEN_ORG = { active: true, suspendedAt: null }

const m = vi.hoisted(() => ({
  eventFindFirst: vi.fn(),
  eventFindMany: vi.fn(),
  shiftFindMany: vi.fn(),
  txShiftFindMany: vi.fn(),
  inviteFindFirst: vi.fn(),
  inviteFindUnique: vi.fn(),
  txCreate: vi.fn(),
  txRegFindMany: vi.fn(),
  getHeader: vi.fn(),
}))
vi.mock("@/lib/prisma", async () => {
  const locked = (await import("./helpers/locked-shifts")).lockedShiftReads()
  return ({
  prisma: {
      charterVersion: { upsert: vi.fn() },
    eventQuestion: { findMany: vi.fn().mockResolvedValue([]) },
    event: { findFirst: m.eventFindFirst, findMany: m.eventFindMany },
    shift: { findMany: locked.top(m.shiftFindMany) },
    volunteer: { findFirst: vi.fn().mockResolvedValue(null) },
    registration: { findMany: vi.fn().mockResolvedValue([]), findFirst: vi.fn().mockResolvedValue(null) },
    memberInvite: { findFirst: m.inviteFindFirst, findUnique: m.inviteFindUnique, updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
    $transaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn({
      $queryRaw: vi.fn().mockResolvedValue([{ id: "vol-1", erasedAt: null, email: "lea@x.ch" }]),
      shift: { findMany: locked.tx(m.txShiftFindMany) },
      volunteer: { createMany: vi.fn().mockResolvedValue({ count: 1 }), findFirstOrThrow: vi.fn().mockResolvedValue({ id: "vol-1" }), findFirst: vi.fn().mockResolvedValue({ email: "a@x.com", firstName: "Alice", lastName: "Martin" }) },
      event: { findFirst: m.eventFindFirst },
      charterVersion: { upsert: vi.fn() },
      rosterConsent: { findUnique: vi.fn().mockResolvedValue(null), upsert: vi.fn() },
      registration: { findFirst: vi.fn().mockResolvedValue(null), findMany: m.txRegFindMany, count: vi.fn().mockResolvedValue(0), aggregate: vi.fn().mockResolvedValue({ _max: { waitingPosition: null } }), create: m.txCreate },
    })),
  },
})
})
vi.mock("@/lib/notification-helpers", () => ({ sendConfirmationEmail: vi.fn(), sendAdminNotification: vi.fn() }))
vi.mock("@/lib/notifications", () => ({ sendNotification: vi.fn() }))
vi.mock("@/lib/notifications/outbox", () => ({ collectNotifications: () => ({ send: vi.fn(), payloads: [] }), enqueueNotifications: vi.fn().mockResolvedValue([]), deliverAfterResponse: vi.fn() }))
vi.mock("@/lib/sector-leaders", () => ({ notifySectorLeadersOfSignup: vi.fn() }))
vi.mock("@/lib/event-log", () => ({ logEvent: vi.fn() }))
vi.mock("next/headers", () => ({ headers: async () => ({ get: m.getHeader }) }))

const shiftRow = (over: Record<string, unknown> = {}) => ({
  id: "s-bar", roleName: "Bar", label: "Bar", description: null, date: new Date("2030-06-01T00:00:00Z"), startTime: "10:00", endTime: "12:00",
  capacity: 3, status: "open", locationDetails: null, contactName: null, contactPhone: null, instructions: null, latitude: null, longitude: null,
  displayOrder: 0, waitlistEnabled: false, requiresApproval: false, minAge: null, colorKey: null, maxPerVolunteer: null, reservedTags: [] as string[],
  overlapAllowed: false, assignedOnly: false, registrations: [] as unknown[],
  ...over,
})
const bar = shiftRow()
const caisse = shiftRow({ id: "s-caisse", roleName: "Caisse confidentielle", label: "Caisse confidentielle", capacity: 7, assignedOnly: true })
// A shift of the same role left without the flag: the role still counts as assigned-only.
const caisseUnflagged = shiftRow({ id: "s-caisse-2", roleName: "Caisse confidentielle", label: "Caisse confidentielle", capacity: 7, assignedOnly: false })

/** The asked shifts for the first query, all the role's live shifts for the settings query. */
function shiftsInDb(rows: ReturnType<typeof shiftRow>[]) {
  m.shiftFindMany.mockImplementation(async ({ where }: { where: { id?: { in: string[] }; roleName?: { in: string[] } } }) => {
    if (where.id) return rows.filter((r) => where.id!.in.includes(r.id))
    if (!where.roleName) return rows.filter((r) => r.assignedOnly) // the event's hidden roles
    return rows.filter((r) => where.roleName!.in.includes(r.roleName))
  })
}

const post = (shiftIds: string[], extra: Record<string, unknown> = {}) => new Request("http://localhost/api/public/registrations", {
  method: "POST",
  headers: { "Content-Type": "application/json", "x-forwarded-for": `t-${Math.random()}` },
  body: JSON.stringify({ eventId: "evt-1", shiftIds, firstName: "Léa", lastName: "M", email: "lea@x.ch", consent: true, charterAccepted: true, ...extra }),
})

describe("POST /api/public/registrations — role assigned by the organisation only", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    m.eventFindFirst.mockResolvedValue({ id: "evt-1", organizationId: "org-a", title: "Fête", organization: { slug: "a", timeZone: null }, confirmationMessage: null })
    m.txShiftFindMany.mockResolvedValue([])
    m.txRegFindMany.mockResolvedValue([])
    m.txCreate.mockResolvedValue({ id: "reg-1", shiftId: "s-bar", status: "active", waitingPosition: null })
  })

  it("refuses a known shift id as an unknown shift, naming no role, and creates nothing", async () => {
    shiftsInDb([bar, caisse])
    const { POST } = await import("@/app/api/public/registrations/route")
    const res = await POST(post(["s-caisse"]))
    expect(res.status).toBe(409)
    const text = await res.text()
    expect(text).toContain("invalides ou fermés")
    expect(text).not.toContain("Caisse")
    expect(m.txCreate).not.toHaveBeenCalled()
  })

  it("refuses it within a selection that also holds a public shift", async () => {
    shiftsInDb([bar, caisse])
    const { POST } = await import("@/app/api/public/registrations/route")
    expect((await POST(post(["s-bar", "s-caisse"]))).status).toBe(409)
    expect(m.txCreate).not.toHaveBeenCalled()
  })

  it("refuses a shift of the role left without the flag: the whole role counts", async () => {
    shiftsInDb([bar, caisse, caisseUnflagged])
    const { POST } = await import("@/app/api/public/registrations/route")
    expect((await POST(post(["s-caisse-2"]))).status).toBe(409)
    expect(m.txCreate).not.toHaveBeenCalled()
  })

  it("refuses it with a member invitation, even one that opens reserved roles", async () => {
    shiftsInDb([bar, { ...caisse, reservedTags: ["caisse"] }])
    m.inviteFindFirst.mockResolvedValue({ id: "inv-1", volunteer: { email: "lea@x.ch", tags: ["caisse"], active: true } })
    const { POST } = await import("@/app/api/public/registrations/route")
    expect((await POST(post(["s-caisse"], { inviteToken: "tok" }))).status).toBe(409)
    expect(m.txCreate).not.toHaveBeenCalled()
  })

  it("refuses it with a personal link", async () => {
    shiftsInDb([bar, caisse])
    const { POST } = await import("@/app/api/public/registrations/route")
    expect((await POST(post(["s-caisse"], { personalToken: "tok" }))).status).toBe(409)
    expect(m.txCreate).not.toHaveBeenCalled()
  })

  it("does not reveal the role by saying the shift is full", async () => {
    shiftsInDb([bar, { ...caisse, capacity: 1, registrations: [{ id: "r" }] }])
    const { POST } = await import("@/app/api/public/registrations/route")
    const res = await POST(post(["s-caisse"]))
    expect(res.status).toBe(409)
    expect(await res.text()).not.toMatch(/complet|Caisse/)
  })

  it("refuses it when the role became assigned-only while the sign-up ran, seen under the shift lock", async () => {
    shiftsInDb([bar])
    m.txShiftFindMany.mockImplementation(async ({ where }: { where: { assignedOnly?: boolean } }) => (where.assignedOnly ? [{ roleName: "Bar", assignedOnly: true }] : []))
    const { POST } = await import("@/app/api/public/registrations/route")
    const res = await POST(post(["s-bar"]))
    expect(res.status).toBe(409)
    expect(await res.text()).toContain("invalides ou fermés")
    expect(m.txCreate).not.toHaveBeenCalled()
  })

  it("an overlap with a hidden assignment, without proof of the address: nothing created, nothing said (AUTHZ-01)", async () => {
    shiftsInDb([bar, caisse])
    const { prisma } = await import("@/lib/prisma")
    ;(prisma.volunteer.findFirst as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ id: "vol-1" })
    // A shift of the hidden role left without the flag, held by the address (read under the lock).
    m.txRegFindMany.mockResolvedValue([{ shift: { ...caisse, assignedOnly: false, startTime: "11:00", endTime: "13:00", date: bar.date } }])
    const { POST } = await import("@/app/api/public/registrations/route")
    const res = await POST(post(["s-bar"]))
    // Without proof of the address (AUTHZ-01), no refusal at all: the answer of any sign-up.
    expect(res.status).toBe(201)
    const body = await res.text()
    expect(body).not.toMatch(/Caisse|chevauche/)
    expect(m.txCreate).not.toHaveBeenCalled()
  })

  it("an overlap seen under the lock with a shift of a role hidden meanwhile: nothing said either", async () => {
    shiftsInDb([bar])
    const { prisma } = await import("@/lib/prisma")
    ;(prisma.volunteer.findFirst as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ id: "vol-1" })
    // Hidden after the checks before the transaction: only the read under the lock knows.
    m.txShiftFindMany.mockImplementation(async ({ where }: { where: { assignedOnly?: boolean } }) => (where.assignedOnly ? [{ roleName: "Caisse confidentielle", assignedOnly: true }] : []))
    m.txRegFindMany.mockResolvedValue([{ shift: { ...caisse, assignedOnly: false, startTime: "11:00", endTime: "13:00", date: bar.date } }])
    const { POST } = await import("@/app/api/public/registrations/route")
    const res = await POST(post(["s-bar"]))
    expect(res.status).toBe(201)
    expect(await res.text()).not.toMatch(/Caisse|chevauche/)
    expect(m.txCreate).not.toHaveBeenCalled()
  })

  it("leaves a public role bookable: default behaviour unchanged", async () => {
    shiftsInDb([bar, caisse])
    const { POST } = await import("@/app/api/public/registrations/route")
    const res = await POST(post(["s-bar"]))
    expect(res.status).toBeLessThan(300)
    expect(m.txCreate).toHaveBeenCalledOnce()
  })
})

const eventRow = (shifts: ReturnType<typeof shiftRow>[]) => ({
  id: "evt-1", organizationId: "org-a", slug: "fete", title: "Fête", description: null, location: null, startDate: new Date(), endDate: new Date(),
  publicStatus: "published", isListed: true, publicInstructions: null, confirmationMessage: null, requirePhone: false, showSchedule: [],
  registrationsOpen: true, registrationOpensAt: null, registrationClosesAt: null, accentColorKey: null, latitude: null, longitude: null, shiftRosterEnabled: false,
  organization: { name: "Org", slug: "org", timeZone: "Europe/Zurich", volunteerCharter: null, logo: null },
  pages: [], questions: [], shifts,
})

describe("public payloads leave the role out", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    m.getHeader.mockImplementation((n: string) => (n === "x-org-slug" ? "org" : null))
  })

  it("GET /api/public/[eventSlug]: no shift, name or place of the role", async () => {
    m.eventFindFirst.mockResolvedValue(eventRow([bar, caisse, caisseUnflagged]))
    const { GET } = await import("@/app/api/public/[eventSlug]/route")
    const res = await GET(new Request("http://localhost/api/public/fete"), { params: Promise.resolve({ eventSlug: "fete" }) })
    const body = await res.json()
    expect(body.shifts.map((s: { id: string }) => s.id)).toEqual(["s-bar"])
    expect(JSON.stringify(body)).not.toContain("Caisse")
  })

  it("GET /api/public/events: totals count public roles only", async () => {
    m.eventFindMany.mockResolvedValue([eventRow([bar, { ...caisse, registrations: [{ id: "r1" }] }])])
    const { GET } = await import("@/app/api/public/events/route")
    const [ev] = await (await GET()).json()
    expect(ev).toMatchObject({ totalCapacity: 3, totalRegistered: 0, spotsLeft: 3 })
  })

  it("GET /api/public/member-invite/[token]: an invitation never opens the role, even a reserved one", async () => {
    m.getHeader.mockReturnValue(null)
    m.inviteFindUnique.mockResolvedValue({
      volunteer: { id: "v", firstName: "Léa", lastName: "M", email: "lea@x.ch", phone: null, active: true, tags: ["caisse", "sécurité"] },
      event: { slug: "fete", organizationId: "org-a", organization: OPEN_ORG, shifts: [
        { roleName: "Caisse confidentielle", reservedTags: ["caisse"], assignedOnly: true },
        { roleName: "Sécurité", reservedTags: ["sécurité"], assignedOnly: false },
      ] },
    })
    const { GET } = await import("@/app/api/public/member-invite/[token]/route")
    const body = await (await GET(new Request("http://localhost/api/public/member-invite/tok?slug=fete"), { params: Promise.resolve({ token: "tok" }) })).json()
    expect(body.reservedRolesAllowed).toEqual(["Sécurité"])
    expect(JSON.stringify(body)).not.toContain("Caisse")
  })
})

describe("group links offer public roles only", () => {
  it("liveRoleNames leaves out a role assigned by the organisation only, so no link can show it", async () => {
    const { liveRoleNames } = await import("@/lib/group-links-data")
    const db = { shift: { findMany: vi.fn().mockResolvedValue([bar, caisse, caisseUnflagged]) } }
    expect(await liveRoleNames(db, "evt-1")).toEqual(["Bar"])
    expect(db.shift.findMany.mock.calls[0][0].select).toMatchObject({ assignedOnly: true })
  })
})
