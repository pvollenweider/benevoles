import { describe, it, expect, vi, beforeEach } from "vitest"
// Workload protection (#1171) runs on Postgres (src/__integration__/workload-policy.int.test.ts): off here.
vi.mock("@/lib/workload-guard", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/workload-guard")>()),
  lockWorkloadShared: vi.fn(), lockVolunteerRows: vi.fn(), readWorkloadGate: vi.fn(async () => ({ kind: "off" })),
  committedDuty: vi.fn(async () => []), checkScheduleEdit: vi.fn(async () => []),
}))
import { applySelect, expectNoSecretFields, secretKeyPaths } from "./helpers/no-secret-fields"
import { REGISTRATION_ADMIN_SELECT, SECTOR_LEADER_ADMIN_SELECT } from "@/lib/admin-row-selects"

// Admin responses never carry a link token, its hash or its encrypted copy (#1009). The mocked
// models answer like Prisma does (applySelect): a route that forgets its `select` hands back the
// token columns of these full rows, and the test sees them.

const m = vi.hoisted(() => ({ db: {} as Record<string, unknown> }))
vi.mock("@/lib/auth-guard", () => ({
  requireOrgSession: vi.fn(async () => ({ db: m.db, organizationId: "org-a", session: { user: { id: "adm-1", email: "lea@org-a.org", role: "admin", organizationId: "org-a" } } })),
}))
vi.mock("@/lib/prisma", () => ({ prisma: { volunteer: { findFirst: vi.fn(async () => null), update: vi.fn() } } }))
vi.mock("@/lib/event-log", () => ({ logEvent: vi.fn(async () => "log-1"), adminActor: () => ({ type: "admin", id: "adm-1" }) }))
vi.mock("@/lib/notifications/outbox", () => ({ enqueueNotifications: vi.fn(async () => []), deliverAfterResponse: () => {}, collectNotifications: () => ({ send: vi.fn(), payloads: [] }) }))
vi.mock("@/lib/notifications", () => ({ sendNotification: vi.fn(async () => ({ ok: true })) }))
vi.mock("@/lib/notifications/added-by-organizer", () => ({ queueAddedByOrganizer: vi.fn() }))
vi.mock("@/lib/notification-helpers", () => ({ sendMemberInvite: vi.fn(async () => ({ ok: true })) }))
vi.mock("@/lib/waitlist", () => ({ promoteNextInWaitlist: vi.fn(async () => undefined) }))

const SECRETS = { tokenLegacy: "clear-token", tokenHash: "h".repeat(64), tokenEnc: "v2:k1:iv:tag:ct" }
const REG_SECRETS = { editTokenLegacy: "clear-token", editTokenHash: "h".repeat(64), editTokenEnc: "v2:k1:iv:tag:ct" }

const leaderRow = () => ({ id: "l1", eventId: "evt-1", roleName: "Bar", name: "Alice", email: "a@x.com", createdAt: new Date("2026-09-01"), ...SECRETS })
const volunteerRow = () => ({ id: "v1", organizationId: "org-a", firstName: "René", lastName: "Meyer", email: "r@x.com", phone: null, tags: [], active: true, notes: null, createdAt: new Date("2026-01-01") })
const shiftRow = () => ({ id: "s1", eventId: "evt-1", roleName: "Bar", label: "Bar", capacity: 5, status: "open", date: new Date("2030-07-04"), startTime: "10:00", endTime: "12:00" })
const registrationRow = () => ({
  id: "r1", eventId: "evt-1", shiftId: "s1", volunteerId: "v1", status: "active", source: "admin_manual", comment: null, phone: null,
  reminderJ2Sent: null, reminderJ1Sent: null, reminderDdSent: null, waitingPosition: null, waitingOfferedAt: null, waitingExpiresAt: null,
  checkedInAt: null, linkEmailedAt: null, charterAcceptedHash: "c".repeat(64), charterAcceptedAt: null, groupLinkId: null,
  createdAt: new Date("2026-09-01"), updatedAt: new Date("2026-09-01"), ...REG_SECRETS,
  volunteer: volunteerRow(), shift: shiftRow(),
})
const inviteRow = () => ({ id: "i1", eventId: "evt-1", volunteerId: "v1", sentAt: new Date("2026-09-01"), usedAt: null, declinedAt: null, ...SECRETS, volunteer: volunteerRow() })

/** A mocked model method answering like Prisma: the row(s), projected on the call's select/include. */
const answers = (rows: () => Record<string, unknown> | Record<string, unknown>[]) =>
  vi.fn(async (args?: { select?: unknown; include?: unknown }) => {
    const r = rows()
    return Array.isArray(r) ? r.map((x) => applySelect(x, args)) : applySelect(r, args)
  })

const params = <P extends Record<string, string>>(p: P) => ({ params: Promise.resolve(p) })
const json = (url: string, method: string, body?: unknown) =>
  new Request(`http://localhost${url}`, { method, headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) })

describe("no-secret-fields helper", () => {
  it("finds secret-looking keys however deep, and lets an allowed key through", () => {
    const value = { a: [{ ok: 1, nested: { editTokenHash: "x", tokenEnc: "y", tokenLegacy: "z" } }], passwordHash: "p", editToken: "t", hasToken: true }
    expect(secretKeyPaths(value)).toEqual(["$.a[0].nested.editTokenHash", "$.a[0].nested.tokenEnc", "$.a[0].nested.tokenLegacy", "$.passwordHash", "$.editToken", "$.hasToken"])
    // A boolean flag only resembles a secret: allowed by name, explicitly.
    expect(secretKeyPaths(value, ["hasToken"])).not.toContain("$.hasToken")
    expect(secretKeyPaths({ charterAcceptedHash: "c" }, ["charterAcceptedHash"])).toEqual([])
    expect(secretKeyPaths({ id: "x", createdAt: new Date(), setupTokenExpiresAt: null, inviteUrl: "u" })).toEqual([])
  })

  it("projects a row like Prisma: select keeps only the listed fields, include keeps scalars plus the relations", () => {
    const row = registrationRow()
    expect(Object.keys(applySelect(row, { select: { id: true, volunteer: { select: { firstName: true } } } }))).toEqual(["id", "volunteer"])
    expect(applySelect(row, { select: { volunteer: { select: { firstName: true } } } }).volunteer).toEqual({ firstName: "René" })
    const included = applySelect(row, { include: { shift: true } })
    expect(included.editTokenHash).toBe(REG_SECRETS.editTokenHash)
    expect(included.shift).toEqual(shiftRow())
    expect(included).not.toHaveProperty("volunteer")
  })

  it("the shared allow-lists name no secret column", () => {
    expectNoSecretFields(SECTOR_LEADER_ADMIN_SELECT)
    expectNoSecretFields(REGISTRATION_ADMIN_SELECT)
  })
})

describe("sector leader routes return the allow-list only (#1009)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    m.db = {
      event: { findFirst: vi.fn(async () => ({ id: "evt-1", title: "Festival", organization: { slug: "org-a" } })) },
      sectorLeader: { findMany: answers(() => [leaderRow()]), findFirst: vi.fn(async () => null), create: answers(leaderRow), delete: vi.fn() },
      $transaction: async (fn: (tx: unknown) => unknown) => fn(m.db),
    }
  })

  it("GET lists leaders with exactly id, eventId, roleName, name, email, createdAt", async () => {
    const { GET } = await import("@/app/api/admin/events/[id]/sector-leaders/route")
    const body = await (await GET(json("/api/admin/events/evt-1/sector-leaders", "GET"), params({ id: "evt-1" }))).json()
    expect(body).toHaveLength(1)
    expect(Object.keys(body[0]).sort()).toEqual(["createdAt", "email", "eventId", "id", "name", "roleName"])
    expectNoSecretFields(body)
  })

  it("POST returns the created leader with the same keys, never the stored token", async () => {
    const { POST } = await import("@/app/api/admin/events/[id]/sector-leaders/route")
    const res = await POST(json("/api/admin/events/evt-1/sector-leaders", "POST", { roleName: "Bar", name: "Alice", email: "a@x.com" }), params({ id: "evt-1" }))
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(Object.keys(body).sort()).toEqual(["createdAt", "email", "eventId", "id", "name", "roleName"])
    expectNoSecretFields(body)
  })

  it("DELETE reads only what it logs and answers success", async () => {
    const findFirst = answers(leaderRow)
    m.db.sectorLeader = { findFirst, delete: vi.fn() }
    const { DELETE } = await import("@/app/api/admin/events/[id]/sector-leaders/[leaderId]/route")
    const res = await DELETE(json("/api/admin/events/evt-1/sector-leaders/l1", "DELETE"), params({ id: "evt-1", leaderId: "l1" }))
    expect(await res.json()).toEqual({ success: true })
    expect(findFirst.mock.calls[0][0]).toMatchObject({ select: { roleName: true, email: true } })
  })
})

describe("registration routes never return the personal link's token (#1009)", () => {
  beforeEach(() => vi.clearAllMocks())

  it("GET /api/admin/events/[id]: the registrations under each shift", async () => {
    const eventRow = () => ({ id: "evt-1", title: "Festival", organizationId: "org-a", shifts: [{ ...shiftRow(), registrations: [registrationRow()] }] })
    m.db = { event: { findFirst: answers(eventRow) } }
    const { GET } = await import("@/app/api/admin/events/[id]/route")
    const body = await (await GET(json("/api/admin/events/evt-1", "GET"), params({ id: "evt-1" }))).json()
    const reg = body.shifts[0].registrations[0]
    expect(reg.id).toBe("r1")
    expect(reg.volunteer.firstName).toBe("René")
    expect(Object.keys(reg).sort()).toEqual([...Object.keys(REGISTRATION_ADMIN_SELECT), "volunteer"].sort())
    expectNoSecretFields(body)
  })

  it("POST /api/admin/registrations: the registration just added", async () => {
    m.db = {
      shift: { findFirst: vi.fn(async () => ({ ...shiftRow(), registrations: [], event: { title: "Festival", organization: { name: "Org A", slug: "org-a", timeZone: "Europe/Zurich" } } })), findMany: vi.fn(async () => []), update: vi.fn() },
      volunteer: { findFirst: vi.fn(async () => volunteerRow()), create: vi.fn() },
      registration: { findMany: vi.fn(async () => []), create: answers(registrationRow) },
      adminUser: { findFirst: vi.fn(async () => ({ name: "Léa" })) },
      $transaction: async (fn: (tx: unknown) => unknown) => fn(m.db),
    }
    const { POST } = await import("@/app/api/admin/registrations/route")
    const one = await POST(json("/api/admin/registrations", "POST", { eventId: "evt-1", shiftId: "s1", volunteerId: "v1" }))
    expect(one.status).toBe(201)
    const body = await one.json()
    expect(body.id).toBe("r1")
    expectNoSecretFields(body)
    const many = await (await POST(json("/api/admin/registrations", "POST", { eventId: "evt-1", shiftIds: ["s1"], volunteerId: "v1" }))).json()
    expect(many.registrations).toHaveLength(1)
    expectNoSecretFields(many)
  })

  it("PATCH /api/admin/registrations/[id]: the updated registration", async () => {
    m.db = {
      registration: { findFirst: vi.fn(async () => ({ id: "r1", status: "active", comment: null })), update: answers(registrationRow), count: vi.fn(async () => 1) },
      shift: { update: vi.fn() },
    }
    const { PATCH } = await import("@/app/api/admin/registrations/[id]/route")
    const res = await PATCH(json("/api/admin/registrations/r1", "PATCH", { comment: "ok" }), params({ id: "r1" }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.shift.id).toBe("s1")
    expectNoSecretFields(body)
  })
})

describe("main admin lists carry no secret fields (#1009)", () => {
  beforeEach(() => vi.clearAllMocks())

  it("GET /api/admin/members", async () => {
    m.db = { volunteer: { findMany: answers(() => [volunteerRow()]) } }
    const { GET } = await import("@/app/api/admin/members/route")
    const body = await (await GET(json("/api/admin/members", "GET"))).json()
    expect(body).toHaveLength(1)
    expectNoSecretFields(body)
  })

  it("GET /api/admin/events/[id]/invitations", async () => {
    m.db = {
      event: { findFirst: vi.fn(async () => ({ id: "evt-1" })) },
      memberInvite: { findMany: answers(() => [inviteRow()]) },
      registration: { findMany: answers(() => [registrationRow()]) },
    }
    const { GET } = await import("@/app/api/admin/events/[id]/invitations/route")
    const body = await (await GET(json("/api/admin/events/evt-1/invitations", "GET"), params({ id: "evt-1" }))).json()
    expect(body.invites).toHaveLength(1)
    expect(body.invites[0].registrations).toHaveLength(1)
    expectNoSecretFields(body)
  })

  it("GET /api/admin/settings/admins", async () => {
    const adminRow = () => ({ id: "adm-1", organizationId: "org-a", email: "lea@org-a.org", name: "Léa", role: "admin", isActive: true, createdAt: new Date("2026-01-01"), passwordHash: "$2b$12$x", setupTokenHash: "h", setupTokenExpiresAt: null, passwordResetTokenHash: "h", orgReactivationTokenHash: null })
    m.db = { adminUser: { findMany: answers(() => [adminRow()]) } }
    const { GET } = await import("@/app/api/admin/settings/admins/route")
    const body = await (await GET()).json()
    expect(body).toHaveLength(1)
    expectNoSecretFields(body)
  })
})
