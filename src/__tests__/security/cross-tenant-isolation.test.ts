/**
 * Cross-tenant isolation tests.
 *
 * Every admin API route must scope reads to the caller's org. These tests
 * verify two invariants:
 *
 * 1. When the scoped db returns null (resource belongs to another org),
 *    the route returns 404 — not 200, not 500.
 *
 * 2. Routes do NOT bypass the scoped `db` by falling back to the raw
 *    `prisma` client for ownership checks.
 *
 * The tests mock `requireOrgSession` so they run without a real DB and
 * stay fast. The scoping logic itself is covered in prisma-org.test.ts.
 */

import { describe, it, expect, vi, beforeEach } from "vitest"
// Workload protection (#1171) runs on Postgres (src/__integration__/workload-policy.int.test.ts): off here.
vi.mock("@/lib/workload-guard", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/workload-guard")>()),
  lockWorkloadShared: vi.fn(), lockVolunteerRows: vi.fn(), readWorkloadGate: vi.fn(async () => ({ kind: "off" })),
  committedDuty: vi.fn(async () => []), checkScheduleEdit: vi.fn(async () => []),
}))
// Swap requests (#1174) ended by the hooks: tested on Postgres (src/__integration__/shift-swaps.int.test.ts).
vi.mock("@/lib/shift-swap-server", async (orig) => ({ ...(await orig<typeof import("@/lib/shift-swap-server")>()), endSwapsIn: vi.fn(), endSwapsAfter: vi.fn(), decideSwap: vi.fn() }))
// The capability is shipped by the lot with the pages: the routes are exercised as if it were.
vi.mock("@/lib/shift-swap-gate", () => ({ swapsShipped: () => true }))

// ── Shared mocks ──────────────────────────────────────────────────────────────

const requireOrgSessionMock = vi.fn()
vi.mock("@/lib/auth-guard", () => ({
  requireOrgSession: requireOrgSessionMock,
  getOrgContext: vi.fn(),
}))

// Raw prisma mock: simulates unscoped data (both orgs mixed).
// Routes must NOT rely on this for ownership — only for mutations after
// ownership was already verified by the scoped db.
const prismaMock = {
  event: {
    update: vi.fn().mockResolvedValue({ id: "evt-b", title: "Event B", publicStatus: "draft" }),
    updateMany: vi.fn().mockResolvedValue({ count: 0 }),
    findFirst: vi.fn().mockResolvedValue({ id: "evt-b", organizationId: "org-b" }), // org-B data!
    delete: vi.fn().mockResolvedValue({ id: "evt-a" }),
  },
  volunteer: {
    update: vi.fn().mockResolvedValue({ id: "mem-b" }),
    findFirst: vi.fn().mockResolvedValue(null),
    create: vi.fn().mockResolvedValue({ id: "vol-1", email: "v@x.com", firstName: "V", lastName: "L" }),
  },
  shift: {
    update: vi.fn().mockResolvedValue({ id: "shift-b", status: "open", capacity: 5 }),
    findFirst: vi.fn().mockResolvedValue(null),
    count: vi.fn().mockResolvedValue(1),
  },
  registration: {
    update: vi.fn().mockResolvedValue({ id: "reg-b", shiftId: "shift-b", shift: { status: "open", capacity: 5 } }),
    create: vi.fn().mockResolvedValue({ id: "reg-new" }),
    count: vi.fn().mockResolvedValue(0),
    findFirst: vi.fn().mockResolvedValue(null),
    findUniqueOrThrow: vi.fn().mockResolvedValue({
      id: "reg-b",
      editToken: "tok-b",
      volunteer: { firstName: "V", lastName: "B", email: "v@b.com" },
      event: { title: "Event B", organization: { slug: "org-b" } },
    }),
  },
  organization: {
    findUnique: vi.fn().mockResolvedValue({ name: "Org A", timeZone: null }), // header data of exports (#384)
    update: vi.fn().mockResolvedValue({ replyToEmail: null, notificationSettings: null }), // notification settings (#1049)
  },
  adminUser: {
    findUnique: vi.fn().mockResolvedValue(null),
    findFirst: vi.fn().mockResolvedValue(null), // holder of an invited address (#1053)
    deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
    create: vi.fn().mockResolvedValue({ id: "adm-new" }),
    count: vi.fn().mockResolvedValue(2),
    delete: vi.fn().mockResolvedValue({}),
  },
  memberInvite: {
    findMany: vi.fn().mockResolvedValue([]),
    create: vi.fn().mockResolvedValue({ id: "inv-1", token: "tok" }),
  },
  notificationOutbox: {
    updateMany: vi.fn().mockResolvedValue({ count: 0 }), // nothing of org-A matches an org-B row (#382)
    findFirst: vi.fn().mockResolvedValue(null), // « Renvoyer » looks for a newer copy first (#1105)
    create: vi.fn().mockResolvedValue({ id: "row-1" }),
    createMany: vi.fn().mockResolvedValue({ count: 1 }),
    findUniqueOrThrow: vi.fn().mockResolvedValue({ id: "row-1" }),
    findMany: vi.fn().mockResolvedValue([]), // live rows of a batch of emails (#1101)
  },
  sendBatch: {
    findMany: vi.fn().mockResolvedValue([]), // batches of emails (#1101): filtered by organisation
  },
  deliveryOutcome: {
    findMany: vi.fn().mockResolvedValue([]), // #598
  },
  orgLog: {
    create: vi.fn().mockResolvedValue({ id: "log-1" }), // org activity log entries (#300 logo)
    findMany: vi.fn().mockResolvedValue([]), // activity export (#1049)
  },
  async $transaction(fn: (tx: unknown) => unknown) { return fn(this) },
}
// Delivery after the response needs a Next request scope; the routes only queue through the outbox here (#1049).
vi.mock("next/server", async (importOriginal) => ({ ...(await importOriginal<typeof import("next/server")>()), after: vi.fn() }))
vi.mock("@/lib/push", () => ({ pushDeviceCount: vi.fn().mockResolvedValue(0), sendTargetedPush: vi.fn() }))
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }))
// The targeted-message route hashes addresses for the "adresses à vérifier" warning (#599), which
// needs AUTH_SECRET: mocked here like every other test that imports a module reaching @/lib/env.
vi.mock("@/lib/env", () => ({ env: { AUTH_SECRET: "a".repeat(32), ADMIN_NOTIFICATION_EMAIL: undefined } }))

vi.mock("@/lib/notifications", () => ({
  sendNotification: vi.fn().mockResolvedValue({ ok: true }),
}))
vi.mock("@/lib/notification-helpers", () => ({
  sendMemberInvite: vi.fn().mockResolvedValue({ ok: true }),
}))
vi.mock("bcryptjs", () => ({
  default: { hash: vi.fn().mockResolvedValue("$hashed") },
  hash: vi.fn().mockResolvedValue("$hashed"),
}))

// ── Helpers ───────────────────────────────────────────────────────────────────

const ORG_A = "org-a"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DbOverrides = Record<string, Record<string, any>>

/** Returns a mock scoped db for org-A where every read returns null by default. */
function mockScopedDb(overrides: DbOverrides = {}) {
  return {
    event: {
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({ id: "evt-a" }),
      count: vi.fn().mockResolvedValue(0),
      delete: vi.fn().mockResolvedValue({ id: "evt-a" }),
      ...((overrides.event as object) ?? {}),
    },
    volunteer: {
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({ id: "mem-a" }),
      count: vi.fn().mockResolvedValue(0),
      ...((overrides.volunteer as object) ?? {}),
    },
    shift: {
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn().mockResolvedValue(null),
      count: vi.fn().mockResolvedValue(0),
      ...((overrides.shift as object) ?? {}),
    },
    registration: {
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn().mockResolvedValue(null),
      count: vi.fn().mockResolvedValue(0),
      ...((overrides.registration as object) ?? {}),
    },
    memberInvite: {
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn().mockResolvedValue(null),
      count: vi.fn().mockResolvedValue(0),
      ...((overrides.memberInvite as object) ?? {}),
    },
    adminUser: {
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn().mockResolvedValue(null),
      count: vi.fn().mockResolvedValue(0),
      create: vi.fn().mockResolvedValue({ id: "adm-a" }),
      ...((overrides.adminUser as object) ?? {}),
    },
    organization: {
      findUnique: vi.fn().mockResolvedValue({ id: ORG_A, name: "Org A" }),
      findFirst: vi.fn().mockResolvedValue({ id: ORG_A, name: "Org A" }),
    },
    duplicateDismissal: {
      findMany: vi.fn().mockResolvedValue([]),
      upsert: vi.fn().mockResolvedValue({ id: "dismissal-a" }),
      ...((overrides.duplicateDismissal as object) ?? {}),
    },
    eventGroupLink: {
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({ id: "link-a", code: "abcd2345", name: "A", roleNames: [], hideFull: false }),
      update: vi.fn(),
      delete: vi.fn(),
      ...((overrides.eventGroupLink as object) ?? {}),
    },
    eventMilestone: {
      findFirst: vi.fn().mockResolvedValue(null),
      update: vi.fn(),
      ...((overrides.eventMilestone as object) ?? {}),
    },
  }
}

const SESSION_A = { user: { email: "admin@a.com", role: "admin", organizationId: ORG_A } }

function setupGuard(dbOverrides: DbOverrides = {}) {
  const db = mockScopedDb(dbOverrides)
  requireOrgSessionMock.mockResolvedValue({ db, organizationId: ORG_A, session: SESSION_A })
  return db
}

function makeRequest(url: string, method = "GET", body?: unknown): Request {
  return new Request(`http://localhost:3000${url}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  })
}

function params(id: string) {
  return { params: Promise.resolve({ id }) }
}

// ── Events ────────────────────────────────────────────────────────────────────

describe("Events — cross-tenant isolation", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("GET /api/admin/events returns only the org-A event list (scoped findMany)", async () => {
    const { GET } = await import("@/app/api/admin/events/route")
    const db = setupGuard({
      event: { findMany: vi.fn().mockResolvedValue([{ id: "evt-a", organizationId: ORG_A, title: "A", shifts: [] }]) },
    })

    const res = await GET()
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toHaveLength(1)
    expect(body[0].id).toBe("evt-a")
    expect(db.event.findMany).toHaveBeenCalledOnce()
  })

  it("GET /api/admin/events/[id] returns 404 when scoped db finds nothing (org-B event)", async () => {
    const { GET } = await import("@/app/api/admin/events/[id]/route")
    setupGuard() // findFirst returns null → org-B event

    const res = await GET(makeRequest("/api/admin/events/evt-b"), params("evt-b"))
    expect(res.status).toBe(404)
  })

  it("GET /api/admin/events/[id]/export/sheets/[view] returns 404 for an org-B event", async () => {
    const { GET } = await import("@/app/api/admin/events/[id]/export/sheets/[view]/route")
    setupGuard() // event.findFirst → null
    const res = await GET(makeRequest("/api/admin/events/evt-b/export/sheets/day"), { params: Promise.resolve({ id: "evt-b", view: "day" }) })
    expect(res.status).toBe(404)
  })

  it("GET /api/admin/events/[id]/export/badges returns 404 for an org-B event", async () => {
    const { GET } = await import("@/app/api/admin/events/[id]/export/badges/route")
    setupGuard() // event.findFirst → null
    const res = await GET(makeRequest("/api/admin/events/evt-b/export/badges"), params("evt-b"))
    expect(res.status).toBe(404)
  })

  it("GET /api/admin/events/[id]/export/attendance returns 404 for an org-B event", async () => {
    const { GET } = await import("@/app/api/admin/events/[id]/export/attendance/route")
    setupGuard() // event.findFirst → null
    const res = await GET(makeRequest("/api/admin/events/evt-b/export/attendance"), params("evt-b"))
    expect(res.status).toBe(404)
  })

  it("GET /api/admin/events/[id]/export/answers returns 404 for an org-B event, reading only the scoped client (#686)", async () => {
    const { GET } = await import("@/app/api/admin/events/[id]/export/answers/route")
    const db = setupGuard() // event.findFirst → null
    const res = await GET(makeRequest("/api/admin/events/evt-b/export/answers"), params("evt-b"))
    expect(res.status).toBe(404)
    expect(db.event.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "evt-b" } }))
    expect(prismaMock.event.findFirst).not.toHaveBeenCalled()
  })

  it("GET /api/admin/events/[id]/export/sheets/answers returns 404 for an org-B event (#686)", async () => {
    const { GET } = await import("@/app/api/admin/events/[id]/export/sheets/[view]/route")
    setupGuard() // event.findFirst → null
    const res = await GET(makeRequest("/api/admin/events/evt-b/export/sheets/answers"), { params: Promise.resolve({ id: "evt-b", view: "answers" }) })
    expect(res.status).toBe(404)
  })

  it("GET /api/admin/events/[id] returns 200 for an org-A event", async () => {
    const { GET } = await import("@/app/api/admin/events/[id]/route")
    setupGuard({
      event: { findFirst: vi.fn().mockResolvedValue({ id: "evt-a", organizationId: ORG_A, title: "A", shifts: [] }) },
    })

    const res = await GET(makeRequest("/api/admin/events/evt-a"), params("evt-a"))
    expect(res.status).toBe(200)
  })

  it("PATCH /api/admin/events/[id] returns 404 for org-B event (does NOT use raw prisma for ownership)", async () => {
    const { PATCH } = await import("@/app/api/admin/events/[id]/route")
    setupGuard() // scoped db → null for org-B event

    // Raw prisma mock has org-B event data — if the route used raw prisma it would succeed
    prismaMock.event.findFirst.mockResolvedValue({ id: "evt-b", organizationId: "org-b" })

    const res = await PATCH(
      makeRequest("/api/admin/events/evt-b", "PATCH", { title: "Hacked" }),
      params("evt-b"),
    )
    expect(res.status).toBe(404)
    // Mutation must never have been called
    expect(prismaMock.event.update).not.toHaveBeenCalled()
  })

  it("PATCH /api/admin/events/[id] with the shift roster setting (#1068) returns 404 for org-B event", async () => {
    const { PATCH } = await import("@/app/api/admin/events/[id]/route")
    setupGuard()
    prismaMock.event.findFirst.mockResolvedValue({ id: "evt-b", organizationId: "org-b" })

    const res = await PATCH(makeRequest("/api/admin/events/evt-b", "PATCH", { shiftRosterEnabled: true }), params("evt-b"))
    expect(res.status).toBe(404)
    expect(prismaMock.event.update).not.toHaveBeenCalled()
  })

  it("POST /api/admin/events reads the « Qui est inscrit » (#1068), sectors (#1147) and workload (#1171) defaults of the caller's organisation only", async () => {
    const { POST } = await import("@/app/api/admin/events/route")
    const db = setupGuard()
    const res = await POST(makeRequest("/api/admin/events", "POST", { title: "Fête", startDate: "2031-06-06", endDate: "2031-06-06" }))
    expect(res.status).toBe(201)
    expect(db.organization.findUnique).toHaveBeenCalledWith({ where: { id: ORG_A }, select: { shiftRosterDefault: true, sectorsDefault: true, shiftSwapsDefault: true, workloadPolicyDefault: true, timeZone: true } })
  })

  it("POST /api/admin/events/[id]/duplicate returns 404 for an org-B event (its roster setting never copied)", async () => {
    const { POST } = await import("@/app/api/admin/events/[id]/duplicate/route")
    const db = setupGuard()
    prismaMock.event.findFirst.mockResolvedValue({ id: "evt-b", organizationId: "org-b", shiftRosterEnabled: true })
    const res = await POST(makeRequest("/api/admin/events/evt-b/duplicate", "POST", {}), params("evt-b"))
    expect(res.status).toBe(404)
    expect(db.event.create).not.toHaveBeenCalled()
    // Nor are its cancelled shifts read, for the leaders of a deleted poste (#1010).
    expect(db.shift.findMany).not.toHaveBeenCalled()
  })

  it("DELETE /api/admin/events/[id] returns 404 for org-B event", async () => {
    const { DELETE } = await import("@/app/api/admin/events/[id]/route")
    setupGuard()

    const res = await DELETE(makeRequest("/api/admin/events/evt-b", "DELETE"), params("evt-b"))
    expect(res.status).toBe(404)
    expect(prismaMock.event.update).not.toHaveBeenCalled()
    expect(prismaMock.event.delete).not.toHaveBeenCalled()
  })

  it("DELETE /api/admin/events/[id] returns 409 when the event is not archived", async () => {
    const { DELETE } = await import("@/app/api/admin/events/[id]/route")
    setupGuard({
      event: { findFirst: vi.fn().mockResolvedValue({ id: "evt-a", title: "Fête", publicStatus: "published" }) },
    })

    const res = await DELETE(
      makeRequest("/api/admin/events/evt-a", "DELETE", { confirmTitle: "Fête" }),
      params("evt-a"),
    )
    expect(res.status).toBe(409)
    expect(prismaMock.event.delete).not.toHaveBeenCalled()
  })

  it("DELETE /api/admin/events/[id] returns 400 when the confirmation title is missing or wrong", async () => {
    const { DELETE } = await import("@/app/api/admin/events/[id]/route")
    const archived = { event: { findFirst: vi.fn().mockResolvedValue({ id: "evt-a", title: "Fête", publicStatus: "archived" }) } }

    setupGuard(archived)
    const noBody = await DELETE(makeRequest("/api/admin/events/evt-a", "DELETE"), params("evt-a"))
    expect(noBody.status).toBe(400)

    setupGuard(archived)
    const wrong = await DELETE(
      makeRequest("/api/admin/events/evt-a", "DELETE", { confirmTitle: "Autre" }),
      params("evt-a"),
    )
    expect(wrong.status).toBe(400)
    expect(prismaMock.event.delete).not.toHaveBeenCalled()
  })

  it("DELETE /api/admin/events/[id] deletes an archived org-A event when the title matches", async () => {
    const { DELETE } = await import("@/app/api/admin/events/[id]/route")
    const db = setupGuard({
      event: {
        findFirst: vi.fn().mockResolvedValue({ id: "evt-a", title: "Fête de l'Été", publicStatus: "archived" }),
        delete: vi.fn().mockResolvedValue({ id: "evt-a" }),
      },
    })

    const res = await DELETE(
      makeRequest("/api/admin/events/evt-a", "DELETE", { confirmTitle: "fete de l'ete" }),
      params("evt-a"),
    )
    expect(res.status).toBe(200)
    // Through the org-scoped client (#268), never the raw one.
    expect(db.event.delete).toHaveBeenCalledWith({ where: { id: "evt-a" } })
    expect(prismaMock.event.delete).not.toHaveBeenCalled()
  })
})

// ── Members ───────────────────────────────────────────────────────────────────

describe("Event preview — cross-tenant isolation (#370)", () => {
  beforeEach(() => vi.clearAllMocks())

  it("GET /api/admin/events/[id]/preview returns 404 for an org-B event, even though raw prisma has it", async () => {
    const { GET } = await import("@/app/api/admin/events/[id]/preview/route")
    const db = setupGuard() // scoped findFirst → null for org-B
    prismaMock.event.findFirst.mockResolvedValue({ id: "evt-b", organizationId: "org-b" })

    const res = await GET(makeRequest("/api/admin/events/evt-b/preview"), params("evt-b"))
    expect(res.status).toBe(404)
    expect(db.event.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "evt-b" } }))
  })

  it("POST /api/admin/events/[id]/preview returns 404 for an org-B event", async () => {
    const { POST } = await import("@/app/api/admin/events/[id]/preview/route")
    setupGuard()
    const res = await POST(
      makeRequest("/api/admin/events/evt-b/preview", "POST", { firstName: "A", lastName: "B", shiftIds: ["shift-b"] }),
      params("evt-b"),
    )
    expect(res.status).toBe(404)
  })
})

describe("Publication request — cross-tenant isolation (#810)", () => {
  beforeEach(() => vi.clearAllMocks())

  it("POST /api/admin/events/[id]/publication-request returns 404 for an org-B event, even though raw prisma has it", async () => {
    const { POST } = await import("@/app/api/admin/events/[id]/publication-request/route")
    const db = setupGuard() // scoped findFirst → null for org-B
    prismaMock.event.findFirst.mockResolvedValue({ id: "evt-b", organizationId: "org-b" })

    const res = await POST(makeRequest("/api/admin/events/evt-b/publication-request", "POST"), params("evt-b"))
    expect(res.status).toBe(404)
    expect(db.event.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "evt-b" } }))
  })
})

describe("Members — cross-tenant isolation", () => {
  beforeEach(() => vi.clearAllMocks())

  it("GET /api/admin/members returns only org-A volunteers", async () => {
    const { GET } = await import("@/app/api/admin/members/route")
    const db = setupGuard({
      volunteer: { findMany: vi.fn().mockResolvedValue([{ id: "mem-a", organizationId: ORG_A, firstName: "Alice", lastName: "M", tags: [], active: true }]) },
    })

    const res = await GET(makeRequest("/api/admin/members"))
    expect(res.status).toBe(200)
    const body = await res.json()
    // All returned volunteers belong to org-A (from mock)
    expect(Array.isArray(body)).toBe(true)
    expect((body as { organizationId: string }[]).every((m) => m.organizationId === ORG_A)).toBe(true)
    expect(db.volunteer.findMany).toHaveBeenCalledOnce()
  })

  it("PATCH /api/admin/members/[id] returns 404 for org-B volunteer (scoped db returns null)", async () => {
    const { PATCH } = await import("@/app/api/admin/members/[id]/route")
    setupGuard() // findFirst → null

    const res = await PATCH(
      makeRequest("/api/admin/members/mem-b", "PATCH", { firstName: "Hacked" }),
      params("mem-b"),
    )
    expect(res.status).toBe(404)
    expect(prismaMock.volunteer.update).not.toHaveBeenCalled()
  })

  it("DELETE /api/admin/members/[id] returns 404 for org-B volunteer", async () => {
    const { DELETE } = await import("@/app/api/admin/members/[id]/route")
    setupGuard()

    const res = await DELETE(makeRequest("/api/admin/members/mem-b", "DELETE"), params("mem-b"))
    expect(res.status).toBe(404)
    expect(prismaMock.volunteer.update).not.toHaveBeenCalled()
  })

  it("PATCH does not bypass ownership check using raw prisma", async () => {
    const { PATCH } = await import("@/app/api/admin/members/[id]/route")
    setupGuard() // scoped db → null

    // Raw prisma has data — if route used raw prisma for check, it would patch
    prismaMock.volunteer.findFirst.mockResolvedValue({ id: "mem-b", organizationId: "org-b" })

    const res = await PATCH(
      makeRequest("/api/admin/members/mem-b", "PATCH", { firstName: "Hacked" }),
      params("mem-b"),
    )
    expect(res.status).toBe(404)
    expect(prismaMock.volunteer.update).not.toHaveBeenCalled()
  })

  it("POST /api/admin/members/[id]/certificate returns 404 for an org-B volunteer (#556)", async () => {
    const { POST } = await import("@/app/api/admin/members/[id]/certificate/route")
    setupGuard() // scoped db → null

    const res = await POST(makeRequest("/api/admin/members/mem-b/certificate", "POST"), params("mem-b"))
    expect(res.status).toBe(404)
  })

  // ── Permanent deletion (#667) ────────────────────────────────────────────

  function deleteTx(overrides: { volunteer?: Record<string, unknown>; registration?: Record<string, unknown> } = {}) {
    const volunteerDelete = vi.fn().mockResolvedValue({ id: "mem-a" })
    const orgLogCreate = vi.fn().mockResolvedValue({ id: "log-1" })
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([{ id: "x" }]),
      volunteer: { findFirst: vi.fn().mockResolvedValue({ id: "mem-a", email: null, active: false, mergedIntoId: null }), delete: volunteerDelete, ...overrides.volunteer },
      registration: { count: vi.fn().mockResolvedValue(0), ...overrides.registration },
      notificationOutbox: { findMany: vi.fn().mockResolvedValue([]), updateMany: vi.fn() },
      orgLog: { create: orgLogCreate },
    }
    return { tx, volunteerDelete, orgLogCreate }
  }

  it("POST /api/admin/members/[id]/delete returns 404 for an org-B volunteer, deleting nothing (#667)", async () => {
    const { POST } = await import("@/app/api/admin/members/[id]/delete/route")
    const { tx, volunteerDelete } = deleteTx({ volunteer: { findFirst: vi.fn().mockResolvedValue(null) } })
    const $transaction = vi.fn(async (fn: (tx: unknown) => unknown) => fn(tx))
    requireOrgSessionMock.mockResolvedValue({ db: { $transaction }, organizationId: ORG_A, session: SESSION_A })

    const res = await POST(makeRequest("/api/admin/members/mem-b/delete", "POST"), params("mem-b"))
    expect(res.status).toBe(404)
    expect(volunteerDelete).not.toHaveBeenCalled()
  })

  it("POST /api/admin/members/[id]/delete deletes an eligible org-A volunteer and logs member.deleted with the id only (#667)", async () => {
    const { POST } = await import("@/app/api/admin/members/[id]/delete/route")
    const { tx, volunteerDelete, orgLogCreate } = deleteTx()
    const $transaction = vi.fn(async (fn: (tx: unknown) => unknown) => fn(tx))
    requireOrgSessionMock.mockResolvedValue({ db: { $transaction }, organizationId: ORG_A, session: SESSION_A })

    const res = await POST(makeRequest("/api/admin/members/mem-a/delete", "POST"), params("mem-a"))
    expect(res.status).toBe(200)
    expect(volunteerDelete).toHaveBeenCalledWith({ where: { id: "mem-a" } })
    expect(orgLogCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ action: "member.deleted", entityType: "Member", entityId: "mem-a", organizationId: ORG_A }),
    }))
    const loggedData = orgLogCreate.mock.calls[0][0].data
    expect(loggedData.changes).toBeUndefined() // id only, no personal data
  })

  it("POST /api/admin/members/[id]/delete returns 409 with a plain message for an active member, deleting nothing (#667)", async () => {
    const { POST } = await import("@/app/api/admin/members/[id]/delete/route")
    const { tx, volunteerDelete } = deleteTx({ volunteer: { findFirst: vi.fn().mockResolvedValue({ id: "mem-a", email: null, active: true, mergedIntoId: null }) } })
    const $transaction = vi.fn(async (fn: (tx: unknown) => unknown) => fn(tx))
    requireOrgSessionMock.mockResolvedValue({ db: { $transaction }, organizationId: ORG_A, session: SESSION_A })

    const res = await POST(makeRequest("/api/admin/members/mem-a/delete", "POST"), params("mem-a"))
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toMatch(/encore active/)
    expect(volunteerDelete).not.toHaveBeenCalled()
  })

  it("POST /api/admin/members/[id]/delete returns 409 for a member with a registration, deleting nothing (#667)", async () => {
    const { POST } = await import("@/app/api/admin/members/[id]/delete/route")
    const { tx, volunteerDelete } = deleteTx({ registration: { count: vi.fn().mockResolvedValue(1) } })
    const $transaction = vi.fn(async (fn: (tx: unknown) => unknown) => fn(tx))
    requireOrgSessionMock.mockResolvedValue({ db: { $transaction }, organizationId: ORG_A, session: SESSION_A })

    const res = await POST(makeRequest("/api/admin/members/mem-a/delete", "POST"), params("mem-a"))
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toMatch(/inscriptions/)
    expect(volunteerDelete).not.toHaveBeenCalled()
  })

  // ── Erasure of personal data (#516) ──────────────────────────────────────

  function eraseTx(member: Record<string, unknown> | null) {
    const writes = {
      volunteerUpdate: vi.fn().mockResolvedValue({}),
      volunteerDeleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      registrationUpdateMany: vi.fn().mockResolvedValue({ count: 0 }),
      outboxDeleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      outcomeDeleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      registerUpsert: vi.fn().mockResolvedValue({}),
      orgLogCreate: vi.fn().mockResolvedValue({ id: "log-1" }),
      rosterConsentDeleteMany: vi.fn().mockResolvedValue({ count: 0 }),
    }
    const none = () => vi.fn().mockResolvedValue([])
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([{ id: "x" }]),
      // The answers kept by the event log of a change from the personal page (#984).
      $executeRaw: vi.fn().mockResolvedValue(0),
      volunteer: { findFirst: vi.fn().mockResolvedValue(member), findMany: none(), update: writes.volunteerUpdate, deleteMany: writes.volunteerDeleteMany },
      registration: { findMany: none(), updateMany: writes.registrationUpdateMany, update: vi.fn() },
      memberInvite: { findMany: none(), deleteMany: vi.fn(), count: vi.fn().mockResolvedValue(0) },
      questionAnswer: { findMany: none(), deleteMany: vi.fn(), count: vi.fn().mockResolvedValue(0) },
      pushSubscription: { findMany: none(), deleteMany: vi.fn(), count: vi.fn().mockResolvedValue(0) },
      // The shift roster choices (#1068): the person's own.
      rosterConsent: { deleteMany: writes.rosterConsentDeleteMany },
      eventVolunteerLimit: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
      // Dated availability (#1146): the person's own answers.
      availabilityRequest: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }), count: vi.fn().mockResolvedValue(0) },
      // Draft assignments (#1146, lot C): the organisation's plans for the person.
      draftAssignment: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }), count: vi.fn().mockResolvedValue(0) },
      // Hour targets of generated proposals (#1172), and the runs that name the person (found by an
      // organisation-filtered raw query, the $queryRaw above).
      eventVolunteerTarget: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }), count: vi.fn().mockResolvedValue(0) },
      proposalRun: { update: vi.fn() },
      sectorLeader: { findMany: none(), deleteMany: vi.fn() },
      duplicateDismissal: { findMany: none(), deleteMany: vi.fn() },
      notificationOutbox: { findMany: none(), deleteMany: writes.outboxDeleteMany },
      deliveryOutcome: { deleteMany: writes.outcomeDeleteMany },
      targetedMessage: { update: vi.fn() },
      erasureRecord: { findUnique: vi.fn().mockResolvedValue(null), create: vi.fn(), upsert: writes.registerUpsert },
      orgLog: { create: writes.orgLogCreate },
    }
    return { tx, writes }
  }

  it("POST /api/admin/members/[id]/erase returns 404 for an org-B volunteer and writes nothing (#516)", async () => {
    const { POST } = await import("@/app/api/admin/members/[id]/erase/route")
    const { tx, writes } = eraseTx(null) // the org-scoped client doesn't see org-B's record
    const $transaction = vi.fn(async (fn: (tx: unknown) => unknown) => fn(tx))
    requireOrgSessionMock.mockResolvedValue({ db: { $transaction }, organizationId: ORG_A, session: SESSION_A })

    const res = await POST(makeRequest("/api/admin/members/mem-b/erase", "POST"), params("mem-b"))
    expect(res.status).toBe(404)
    for (const write of Object.values(writes)) expect(write).not.toHaveBeenCalled()
    expect(prismaMock.volunteer.update).not.toHaveBeenCalled()
  })

  it("POST /api/admin/members/[id]/erase erases an org-A volunteer through the scoped client, outbox and outcomes filtered on org A, logged without saying who (#516)", async () => {
    const { POST } = await import("@/app/api/admin/members/[id]/erase/route")
    const { tx, writes } = eraseTx({ id: "mem-a", firstName: "Alice", lastName: "Martin", email: "alice@a.com", mergedIntoId: null, erasedAt: null })
    const $transaction = vi.fn(async (fn: (tx: unknown) => unknown) => fn(tx))
    requireOrgSessionMock.mockResolvedValue({ db: { $transaction }, organizationId: ORG_A, session: SESSION_A })
    const info = vi.spyOn(console, "info").mockImplementation(() => {})

    const res = await POST(makeRequest("/api/admin/members/mem-a/erase", "POST"), params("mem-a"))
    expect(res.status).toBe(200)
    expect(writes.volunteerUpdate).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "mem-a" } }))
    // Its shift roster choices go through the scoped client, by this member only (#1068).
    expect(writes.rosterConsentDeleteMany).toHaveBeenCalledWith({ where: { volunteerId: { in: ["mem-a"] } } })
    // Only this member's logged answers are removed (#984): their id is the one bound.
    const scrub = tx.$executeRaw.mock.calls[0]
    expect(scrub[0].join("?")).toContain(`"actorId" = ANY(`)
    expect(scrub.slice(1)).toContainEqual(["mem-a"])
    expect(tx.notificationOutbox.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ organizationId: ORG_A }) }))
    expect(writes.outcomeDeleteMany).toHaveBeenCalledWith({ where: expect.objectContaining({ organizationId: ORG_A }) })
    expect(writes.registerUpsert).toHaveBeenCalledWith(expect.objectContaining({ create: expect.objectContaining({ organizationId: ORG_A, volunteerId: "mem-a" }) }))
    const log = writes.orgLogCreate.mock.calls[0][0].data
    expect(log).toMatchObject({ organizationId: ORG_A, action: "member.erased", entityType: "Organization", entityId: ORG_A })
    expect(log.changes).toBeUndefined()
    expect(JSON.stringify(log)).not.toMatch(/mem-a|Alice|Martin|alice@a\.com/)
    // Neither the register nor its log line carries the address.
    expect(JSON.stringify(writes.registerUpsert.mock.calls[0][0])).not.toContain("alice@a.com")
    expect(info.mock.calls.flat().join(" ")).not.toContain("alice@a.com")
    info.mockRestore()
  })

  it("POST /api/admin/members/[id]/erase on an already erased record changes nothing (#516, idempotent)", async () => {
    const { POST } = await import("@/app/api/admin/members/[id]/erase/route")
    const { tx, writes } = eraseTx({ id: "mem-a", firstName: "Bénévole", lastName: "effacé", email: null, mergedIntoId: null, erasedAt: new Date("2026-10-01T10:00:00Z") })
    tx.erasureRecord.findUnique.mockResolvedValue({ id: "rec-1" })
    const $transaction = vi.fn(async (fn: (tx: unknown) => unknown) => fn(tx))
    requireOrgSessionMock.mockResolvedValue({ db: { $transaction }, organizationId: ORG_A, session: SESSION_A })

    const res = await POST(makeRequest("/api/admin/members/mem-a/erase", "POST"), params("mem-a"))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ success: true, alreadyErased: true, erasedAt: "2026-10-01T10:00:00.000Z" })
    for (const write of Object.values(writes)) expect(write).not.toHaveBeenCalled()
  })

  it("POST /api/admin/members/[id]/merge-preview returns 404 when the other record is org-B's (#600)", async () => {
    const { POST } = await import("@/app/api/admin/members/[id]/merge-preview/route")
    setupGuard({ volunteer: { findFirst: vi.fn().mockResolvedValueOnce({ id: "mem-a", organizationId: ORG_A, firstName: "A", lastName: "A", email: null, phone: null, tags: [], notes: null, birthDate: null, availabilityPeriods: [], availabilityNote: null, active: true, createdAt: new Date(), mergedIntoId: null }).mockResolvedValueOnce(null) } })

    const res = await POST(makeRequest("/api/admin/members/mem-a/merge-preview", "POST", { otherId: "mem-b" }), params("mem-a"))
    expect(res.status).toBe(404)
  })

  it("POST /api/admin/members/[id]/merge returns 404 and writes nothing when the other record is org-B's (#600)", async () => {
    const { POST } = await import("@/app/api/admin/members/[id]/merge/route")
    const $transaction = vi.fn(async (fn: (tx: unknown) => unknown) => fn({
      volunteer: {
        findFirst: vi.fn()
          .mockResolvedValueOnce({ id: "mem-a", organizationId: ORG_A, firstName: "A", lastName: "A", email: null, phone: null, tags: [], notes: null, birthDate: null, availabilityPeriods: [], availabilityNote: null, active: true, createdAt: new Date(), mergedIntoId: null })
          .mockResolvedValueOnce(null),
      },
      $queryRaw: vi.fn(),
    }))
    // The merge route goes through db.$transaction directly (member-merge-transaction.ts).
    requireOrgSessionMock.mockResolvedValue({ db: { $transaction }, organizationId: ORG_A, session: SESSION_A })

    const res = await POST(makeRequest("/api/admin/members/mem-a/merge", "POST", { otherId: "mem-b" }), params("mem-a"))
    expect(res.status).toBe(404)
  })

  it("POST /api/admin/members/duplicates/dismiss returns 404 when either member belongs to another organization (#601)", async () => {
    const { POST } = await import("@/app/api/admin/members/duplicates/dismiss/route")
    setupGuard({
      volunteer: { findFirst: vi.fn().mockResolvedValueOnce({ id: "mem-a" }).mockResolvedValueOnce(null) }, // mem-b: org-B
      duplicateDismissal: { upsert: vi.fn() },
    })

    const res = await POST(
      makeRequest("/api/admin/members/duplicates/dismiss", "POST", { volunteerIdA: "mem-a", volunteerIdB: "mem-b", signals: ["name"] }),
    )
    expect(res.status).toBe(404)
  })

  it("POST /api/admin/members/duplicates/dismiss stores the dismissal through the org-scoped db for two org-A members", async () => {
    const { POST } = await import("@/app/api/admin/members/duplicates/dismiss/route")
    const db = setupGuard({
      volunteer: { findFirst: vi.fn().mockResolvedValue({ id: "mem-a" }) },
      duplicateDismissal: { upsert: vi.fn().mockResolvedValue({ id: "dismissal-1" }) },
    })

    const res = await POST(
      makeRequest("/api/admin/members/duplicates/dismiss", "POST", { volunteerIdA: "mem-a", volunteerIdB: "mem-b", signals: ["name"] }),
    )
    expect(res.status).toBe(200)
    expect(db.duplicateDismissal.upsert).toHaveBeenCalledOnce()
  })

  it("loadDuplicatePairs (#601) reads only through the org-scoped volunteer/duplicateDismissal delegates", async () => {
    const { loadDuplicatePairs } = await import("@/lib/member-duplicates-data")
    const db = setupGuard({
      volunteer: {
        findMany: vi.fn().mockResolvedValue([
          { id: "mem-a", firstName: "Jean", lastName: "Dupont", email: null, phone: null, birthDate: null, active: true, mergedIntoId: null },
          { id: "mem-b", firstName: "Jean", lastName: "Dupont", email: null, phone: null, birthDate: null, active: true, mergedIntoId: null },
        ]),
      },
      duplicateDismissal: { findMany: vi.fn().mockResolvedValue([]) },
    })

    const pairs = await loadDuplicatePairs(db, ORG_A)
    expect(pairs).toHaveLength(1)
    expect(db.volunteer.findMany).toHaveBeenCalledOnce()
    expect(db.duplicateDismissal.findMany).toHaveBeenCalledOnce()
  })
})

// ── Delivery outcomes (#598) ──────────────────────────────────────────────────

describe("Delivery outcomes — cross-tenant isolation", () => {
  beforeEach(() => vi.clearAllMocks())

  it("loadDeliveryOutcomesForVolunteer always filters by organizationId, never by volunteerId alone", async () => {
    const { loadDeliveryOutcomesForVolunteer } = await import("@/lib/delivery-outcomes-data")
    await loadDeliveryOutcomesForVolunteer("org-a", "vol-shared-with-org-b")
    expect(prismaMock.deliveryOutcome.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { organizationId: "org-a", volunteerId: "vol-shared-with-org-b" } }),
    )
  })

  it("loadDeliveryOutcomesForVolunteers (#599, members list and dashboard) always filters by organizationId too", async () => {
    const { loadDeliveryOutcomesForVolunteers } = await import("@/lib/delivery-outcomes-data")
    await loadDeliveryOutcomesForVolunteers("org-a", ["vol-shared-with-org-b"])
    const call = prismaMock.deliveryOutcome.findMany.mock.calls.at(-1)?.[0]
    expect(call.where.organizationId).toBe("org-a")
    expect(call.where.volunteerId).toEqual({ in: ["vol-shared-with-org-b"] })
  })

  it("loadAddressStatuses never leaks an org-B outcome into an org-A member's status", async () => {
    const { loadAddressStatuses } = await import("@/lib/delivery-outcomes-data")
    const statuses = await loadAddressStatuses("org-a", [{ id: "vol-shared-with-org-b", addressHash: "hash-x" }])
    expect(prismaMock.deliveryOutcome.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ organizationId: "org-a" }) }),
    )
    expect(statuses.get("vol-shared-with-org-b")).toEqual({ kind: "ok" })
  })
})

// ── Shifts ────────────────────────────────────────────────────────────────────

describe("Shifts — cross-tenant isolation", () => {
  beforeEach(() => vi.clearAllMocks())

  it("PATCH /api/admin/shifts/[id] returns 404 for org-B shift", async () => {
    const { PATCH } = await import("@/app/api/admin/shifts/[id]/route")
    setupGuard() // shift.findFirst → null

    const res = await PATCH(
      makeRequest("/api/admin/shifts/shift-b", "PATCH", { label: "Hacked" }),
      params("shift-b"),
    )
    expect(res.status).toBe(404)
  })

  it("PATCH /api/admin/shifts/[id] moving an org-B shift to another poste returns 404, reading no poste setting (#1002)", async () => {
    const { PATCH } = await import("@/app/api/admin/shifts/[id]/route")
    const db = setupGuard() // shift.findFirst → null
    const $transaction = vi.fn()
    Object.assign(db, { $transaction })

    const res = await PATCH(makeRequest("/api/admin/shifts/shift-b", "PATCH", { roleName: "Sécurité" }), params("shift-b"))
    expect(res.status).toBe(404)
    expect(db.shift.findMany).not.toHaveBeenCalled()
    expect($transaction).not.toHaveBeenCalled()
  })

  it("PATCH /api/admin/shifts/[id] with a minimum (#949) returns 404 for org-B shift, updating nothing", async () => {
    const { PATCH } = await import("@/app/api/admin/shifts/[id]/route")
    const db = setupGuard() // shift.findFirst → null
    const $transaction = vi.fn()
    Object.assign(db, { $transaction })

    const res = await PATCH(makeRequest("/api/admin/shifts/shift-b", "PATCH", { minVolunteers: 1 }), params("shift-b"))
    expect(res.status).toBe(404)
    expect($transaction).not.toHaveBeenCalled()
  })

  it("PATCH /api/admin/events/[id]/roles/[roleName] with places and minimum (#949) returns 404 for an org-B event, updating nothing", async () => {
    const { PATCH } = await import("@/app/api/admin/events/[id]/roles/[roleName]/route")
    const db = setupGuard() // event.findFirst → null
    const $transaction = vi.fn()
    Object.assign(db, { $transaction })

    const res = await PATCH(
      makeRequest("/api/admin/events/evt-b/roles/Bar", "PATCH", { capacity: 4, minVolunteers: 2 }),
      { params: Promise.resolve({ id: "evt-b", roleName: "Bar" }) },
    )
    expect(res.status).toBe(404)
    expect($transaction).not.toHaveBeenCalled()
  })

  it("PATCH /api/admin/events/[id]/roles/[roleName] with a label and a day (#1017) returns 404 for an org-B event, updating nothing", async () => {
    const { PATCH } = await import("@/app/api/admin/events/[id]/roles/[roleName]/route")
    const db = setupGuard() // event.findFirst → null
    const $transaction = vi.fn()
    Object.assign(db, { $transaction })

    const res = await PATCH(
      makeRequest("/api/admin/events/evt-b/roles/Bar", "PATCH", { capacity: 4, label: "Bar soir", date: "2026-07-04" }),
      { params: Promise.resolve({ id: "evt-b", roleName: "Bar" }) },
    )
    expect(res.status).toBe(404)
    expect(db.shift.findMany).not.toHaveBeenCalled()
    expect($transaction).not.toHaveBeenCalled()
  })

  it("PATCH /api/admin/events/[id]/roles/[roleName] with a label (#1017) reads only the org's shifts of the event", async () => {
    const { PATCH } = await import("@/app/api/admin/events/[id]/roles/[roleName]/route")
    const update = vi.fn().mockResolvedValue({})
    const findMany = vi.fn().mockResolvedValue([{ id: "s1", label: "Bar", date: new Date("2026-07-04T00:00:00Z"), colorKey: null, capacity: 2, minVolunteers: null, status: "open", _count: { registrations: 0 } }])
    const db = setupGuard({ event: { findFirst: vi.fn().mockResolvedValue({ id: "evt-a" }) }, shift: { findMany } })
    Object.assign(db, { $transaction: (fn: (tx: unknown) => unknown) => fn({ shift: { update } }) })

    const res = await PATCH(
      makeRequest("/api/admin/events/evt-a/roles/Bar", "PATCH", { capacity: 3, label: "Bar soir" }),
      { params: Promise.resolve({ id: "evt-a", roleName: "Bar" }) },
    )
    expect(res.status).toBe(200)
    expect(findMany.mock.calls[0][0].where).toEqual({ eventId: "evt-a", roleName: "Bar", event: { organizationId: ORG_A } })
    expect(update).toHaveBeenCalledWith({ where: { id: "s1" }, data: { capacity: 3, label: "Bar soir" } })
  })

  it("PATCH /api/admin/events/[id]/roles/[roleName] with overlapAllowed (#986) returns 404 for an org-B event, updating nothing", async () => {
    const { PATCH } = await import("@/app/api/admin/events/[id]/roles/[roleName]/route")
    const updateMany = vi.fn()
    const db = setupGuard({ shift: { updateMany } }) // event.findFirst → null

    const res = await PATCH(
      makeRequest("/api/admin/events/evt-b/roles/Bar", "PATCH", { overlapAllowed: true }),
      { params: Promise.resolve({ id: "evt-b", roleName: "Bar" }) },
    )
    expect(res.status).toBe(404)
    expect(db.shift.findMany).not.toHaveBeenCalled()
    expect(updateMany).not.toHaveBeenCalled()
    expect(prismaMock.shift.update).not.toHaveBeenCalled()
  })

  it("PATCH /api/admin/events/[id]/roles/[roleName] with overlapAllowed (#986) scopes the shifts it updates to the org", async () => {
    const { PATCH } = await import("@/app/api/admin/events/[id]/roles/[roleName]/route")
    const updateMany = vi.fn().mockResolvedValue({ count: 1 })
    setupGuard({
      event: { findFirst: vi.fn().mockResolvedValue({ id: "evt-a" }) },
      shift: {
        findMany: vi.fn().mockResolvedValue([{ id: "s1", colorKey: null, capacity: 2, minVolunteers: null, status: "open", maxPerVolunteer: null, reservedTags: [], overlapAllowed: false, _count: { registrations: 0 } }]),
        updateMany,
      },
    })

    const res = await PATCH(
      makeRequest("/api/admin/events/evt-a/roles/Bar", "PATCH", { overlapAllowed: true }),
      { params: Promise.resolve({ id: "evt-a", roleName: "Bar" }) },
    )
    expect(res.status).toBe(200)
    expect(updateMany).toHaveBeenCalledWith({ where: { eventId: "evt-a", roleName: "Bar", event: { organizationId: ORG_A } }, data: { overlapAllowed: true } })
  })

  it("PATCH /api/admin/events/[id]/roles/[roleName] with assignedOnly (#1145) returns 404 for an org-B event, updating nothing", async () => {
    const { PATCH } = await import("@/app/api/admin/events/[id]/roles/[roleName]/route")
    const updateMany = vi.fn()
    const db = setupGuard({ shift: { updateMany } }) // event.findFirst → null

    const res = await PATCH(
      makeRequest("/api/admin/events/evt-b/roles/Bar", "PATCH", { assignedOnly: true }),
      { params: Promise.resolve({ id: "evt-b", roleName: "Bar" }) },
    )
    expect(res.status).toBe(404)
    expect(db.shift.findMany).not.toHaveBeenCalled()
    expect(updateMany).not.toHaveBeenCalled()
  })

  it("PATCH /api/admin/events/[id]/roles/[roleName] with assignedOnly (#1145) scopes the shifts it updates to the org", async () => {
    const { PATCH } = await import("@/app/api/admin/events/[id]/roles/[roleName]/route")
    const updateMany = vi.fn().mockResolvedValue({ count: 1 })
    setupGuard({
      event: { findFirst: vi.fn().mockResolvedValue({ id: "evt-a" }) },
      shift: {
        findMany: vi.fn().mockResolvedValue([{ id: "s1", colorKey: null, capacity: 2, minVolunteers: null, status: "open", maxPerVolunteer: null, reservedTags: [], overlapAllowed: false, assignedOnly: false, _count: { registrations: 0 } }]),
        updateMany,
      },
    })

    const res = await PATCH(
      makeRequest("/api/admin/events/evt-a/roles/Bar", "PATCH", { assignedOnly: true }),
      { params: Promise.resolve({ id: "evt-a", roleName: "Bar" }) },
    )
    expect(res.status).toBe(200)
    expect(updateMany).toHaveBeenCalledWith({ where: { eventId: "evt-a", roleName: "Bar", event: { organizationId: ORG_A } }, data: { assignedOnly: true } })
  })

  it("PATCH /api/admin/events/[id]/roles/[roleName] rename (#1001) returns 404 for an org-B event, touching no sector leader", async () => {
    const { PATCH } = await import("@/app/api/admin/events/[id]/roles/[roleName]/route")
    const $transaction = vi.fn()
    const updateMany = vi.fn()
    const db = setupGuard() // event.findFirst → null
    Object.assign(db, { $transaction, sectorLeader: { findMany: vi.fn(), updateMany, deleteMany: vi.fn() } })

    const res = await PATCH(
      makeRequest("/api/admin/events/evt-b/roles/Bar", "PATCH", { name: "Buvette" }),
      { params: Promise.resolve({ id: "evt-b", roleName: "Bar" }) },
    )
    expect(res.status).toBe(404)
    expect($transaction).not.toHaveBeenCalled()
    expect(updateMany).not.toHaveBeenCalled()
  })

  it("PATCH /api/admin/events/[id]/roles/[roleName] rename (#1001) moves only the leaders of the checked event", async () => {
    const { PATCH } = await import("@/app/api/admin/events/[id]/roles/[roleName]/route")
    const leaderUpdateMany = vi.fn().mockResolvedValue({ count: 1 })
    const leaderFindMany = vi.fn().mockResolvedValue([])
    const db = setupGuard({
      event: { findFirst: vi.fn().mockResolvedValue({ id: "evt-a" }) },
      shift: {
        findMany: vi.fn().mockResolvedValue([{ id: "s1", colorKey: null, capacity: 2, minVolunteers: null, status: "open", maxPerVolunteer: null, reservedTags: [], overlapAllowed: false, _count: { registrations: 0 } }]),
        findFirst: vi.fn().mockResolvedValue(null),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      eventGroupLink: { findMany: vi.fn().mockResolvedValue([]) },
    })
    Object.assign(db, {
      eventQuestion: { updateMany: vi.fn().mockResolvedValue({ count: 0 }), findMany: vi.fn().mockResolvedValue([]), update: vi.fn() },
      sectorLeader: { findMany: leaderFindMany, updateMany: leaderUpdateMany, deleteMany: vi.fn() },
      $transaction: async (fn: (tx: unknown) => unknown) => fn(db),
    })

    const res = await PATCH(
      makeRequest("/api/admin/events/evt-a/roles/Bar", "PATCH", { name: "Buvette" }),
      { params: Promise.resolve({ id: "evt-a", roleName: "Bar" }) },
    )
    expect(res.status).toBe(200)
    expect(leaderFindMany.mock.calls.every((c) => c[0].where.eventId === "evt-a")).toBe(true)
    expect(leaderUpdateMany).toHaveBeenCalledWith({ where: { eventId: "evt-a", roleName: "Bar" }, data: { roleName: "Buvette" } })
  })

  it("POST /api/admin/shifts returns 404 for an org-B event, reading no role setting of it (#986)", async () => {
    const { POST } = await import("@/app/api/admin/shifts/route")
    const create = vi.fn()
    const db = setupGuard({ shift: { create } }) // event.findFirst → null

    const res = await POST(makeRequest("/api/admin/shifts", "POST", {
      eventId: "evt-b", roleName: "Bar", label: "Bar", date: "2026-07-04", startTime: "10:00", endTime: "12:00", capacity: 2,
    }))
    expect(res.status).toBe(404)
    expect(db.shift.findMany).not.toHaveBeenCalled()
    expect(create).not.toHaveBeenCalled()
  })

  it("POST /api/admin/events/[id]/message returns 404 for an org-B event, sending nothing", async () => {
    const { POST } = await import("@/app/api/admin/events/[id]/message/route")
    setupGuard() // event.findFirst → null

    const res = await POST(
      makeRequest("/api/admin/events/evt-b/message", "POST", { audience: { kind: "event" }, subject: "Hi", message: "Hello" }),
      params("evt-b"),
    )
    expect(res.status).toBe(404)
    expect(prismaMock.notificationOutbox.create).not.toHaveBeenCalled()
    expect(prismaMock.notificationOutbox.createMany).not.toHaveBeenCalled()
  })

  it("POST /api/admin/events/[id]/open-shifts returns 404 for an org-B event, creating and sending nothing (#566)", async () => {
    const { POST } = await import("@/app/api/admin/events/[id]/open-shifts/route")
    const db = setupGuard() // event.findFirst → null
    const $transaction = vi.fn()
    Object.assign(db, { $transaction })

    const res = await POST(
      makeRequest("/api/admin/events/evt-b/open-shifts", "POST", { shiftIds: ["shift-b"], volunteerIds: ["mem-b"] }),
      params("evt-b"),
    )
    expect(res.status).toBe(404)
    // The event is read through the scoped client only, and nothing else is touched.
    expect(db.event.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "evt-b" } }))
    expect(prismaMock.event.findFirst).not.toHaveBeenCalled()
    expect(db.volunteer.findMany).not.toHaveBeenCalled()
    expect($transaction).not.toHaveBeenCalled()
    expect(prismaMock.memberInvite.create).not.toHaveBeenCalled()
    expect(prismaMock.notificationOutbox.createMany).not.toHaveBeenCalled()
  })

  it("POST /api/admin/shifts/series returns 404 for an org-B event, creating nothing", async () => {
    const { POST } = await import("@/app/api/admin/shifts/series/route")
    const db = setupGuard() // event.findFirst → null
    const $transaction = vi.fn()
    Object.assign(db, { $transaction })

    const res = await POST(
      makeRequest("/api/admin/shifts/series", "POST", {
        eventId: "evt-b", roleName: "Bar", date: "2026-07-04", startTime: "10:00", endTime: "14:00", slotMinutes: 120, capacity: 2,
      }),
    )
    expect(res.status).toBe(404)
    expect($transaction).not.toHaveBeenCalled()
  })

  it("POST /api/admin/shifts/recurrence returns 404 for an org-B event, creating nothing (#866)", async () => {
    const { POST } = await import("@/app/api/admin/shifts/recurrence/route")
    const db = setupGuard() // event.findFirst → null
    const $transaction = vi.fn()
    Object.assign(db, { $transaction })

    const res = await POST(
      makeRequest("/api/admin/shifts/recurrence", "POST", {
        eventId: "evt-b", roleName: "Accueil", from: "2026-09-01", until: "2026-09-30", weekdays: [3], everyWeeks: 1,
        startTime: "14:00", endTime: "17:00", slotMinutes: 180, capacity: 2, holidays: "none", closures: [],
      }),
    )
    expect(res.status).toBe(404)
    expect($transaction).not.toHaveBeenCalled()
  })

  it("POST /api/admin/shifts/recurrence/[id]/change and /stop return 404 for an org-B permanence, touching nothing (#866)", async () => {
    const change = await import("@/app/api/admin/shifts/recurrence/[id]/change/route")
    const stop = await import("@/app/api/admin/shifts/recurrence/[id]/stop/route")
    for (const [POST, body] of [[change.POST, { from: "2026-09-09", capacity: 3 }], [stop.POST, { from: "2026-09-09", confirm: true }]] as const) {
      const db = setupGuard()
      const $transaction = vi.fn()
      // The scoped client finds no org-B rule: findFirst through the organisation filter → null.
      Object.assign(db, { $transaction, shiftRecurrence: { findFirst: vi.fn().mockResolvedValue(null) } })
      const res = await POST(makeRequest("/api/admin/shifts/recurrence/rule-b/x", "POST", body), params("rule-b"))
      expect(res.status).toBe(404)
      expect($transaction).not.toHaveBeenCalled()
    }
  })

  it("POST /api/admin/settings/notifications/[id]/retry returns 404 for an org-B outbox row (#382)", async () => {
    const { POST } = await import("@/app/api/admin/settings/notifications/[id]/retry/route")
    setupGuard()
    const res = await POST(makeRequest("/api/admin/settings/notifications/out-b/retry", "POST"), params("out-b"))
    expect(res.status).toBe(404)
    // The organization filter is in the update itself: an org-B row can never flip.
    expect(prismaMock.notificationOutbox.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ id: "out-b", organizationId: ORG_A, status: "failed" }) }))
  })

  it("GET /api/admin/events/[id]/export/archive returns 404 for an org-B event (#384)", async () => {
    const { GET } = await import("@/app/api/admin/events/[id]/export/archive/route")
    setupGuard() // event.findFirst → null
    const res = await GET(makeRequest("/api/admin/events/evt-b/export/archive"), params("evt-b"))
    expect(res.status).toBe(404)
  })

  it("POST /api/admin/members/import/preview reads existing members through the scoped client only (#464)", async () => {
    const { POST } = await import("@/app/api/admin/members/import/preview/route")
    const db = setupGuard({ volunteer: { findMany: vi.fn().mockResolvedValue([]) } })
    const fd = new FormData()
    fd.append("file", new File(["prenom,nom,email\nAlice,M,a@x.com"], "m.csv", { type: "text/csv" }))
    const res = await POST(new Request("http://localhost:3000/api/admin/members/import/preview", { method: "POST", body: fd }))
    expect(res.status).toBe(200)
    expect(db.volunteer.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ organizationId: ORG_A }) }))
    expect(db.volunteer.create).not.toHaveBeenCalled()
    expect(prismaMock.volunteer.findFirst).not.toHaveBeenCalled()
    expect(prismaMock.volunteer.create).not.toHaveBeenCalled()
  })

  it("POST /api/admin/events/[id]/messages/[messageId]/resend-failed returns 404 for an org-B message (#467)", async () => {
    const { POST } = await import("@/app/api/admin/events/[id]/messages/[messageId]/resend-failed/route")
    const db = { ...mockScopedDb(), targetedMessage: { findFirst: vi.fn().mockResolvedValue(null) } }
    requireOrgSessionMock.mockResolvedValue({ db, organizationId: ORG_A, session: SESSION_A })
    const res = await POST(makeRequest("/api/admin/events/evt-b/messages/msg-b/resend-failed", "POST"), { params: Promise.resolve({ id: "evt-b", messageId: "msg-b" }) })
    expect(res.status).toBe(404)
    expect(prismaMock.notificationOutbox.updateMany).not.toHaveBeenCalled()
  })

  it("POST /api/admin/events/[id]/scheduled-messages returns 404 for an org-B event, storing nothing (#1019)", async () => {
    const { POST } = await import("@/app/api/admin/events/[id]/scheduled-messages/route")
    const create = vi.fn()
    const db = { ...mockScopedDb(), scheduledMessage: { create } } // event.findFirst → null
    requireOrgSessionMock.mockResolvedValue({ db, organizationId: ORG_A, session: SESSION_A })
    const res = await POST(
      makeRequest("/api/admin/events/evt-b/scheduled-messages", "POST", { audience: { kind: "event" }, subject: "Hi", message: "Hello", date: "2099-01-01", time: "10:00" }),
      params("evt-b"),
    )
    expect(res.status).toBe(404)
    expect(create).not.toHaveBeenCalled()
    expect(db.registration.findMany).not.toHaveBeenCalled()
  })

  it("POST /api/admin/events/[id]/scheduled-messages/[scheduledId]/cancel returns 404 for an org-B scheduled message (#1019)", async () => {
    const { POST } = await import("@/app/api/admin/events/[id]/scheduled-messages/[scheduledId]/cancel/route")
    const updateMany = vi.fn()
    const db = { ...mockScopedDb(), scheduledMessage: { findFirst: vi.fn().mockResolvedValue(null), updateMany } }
    requireOrgSessionMock.mockResolvedValue({ db, organizationId: ORG_A, session: SESSION_A })
    const res = await POST(makeRequest("/api/admin/events/evt-b/scheduled-messages/sm-b/cancel", "POST"), { params: Promise.resolve({ id: "evt-b", scheduledId: "sm-b" }) })
    expect(res.status).toBe(404)
    expect(updateMany).not.toHaveBeenCalled()
  })

  it("PATCH/DELETE /api/admin/settings/message-templates/[id] return 404 for an org-B template (#482)", async () => {
    const mod = await import("@/app/api/admin/settings/message-templates/[id]/route")
    const update = vi.fn(), del = vi.fn()
    const db = { ...mockScopedDb(), messageTemplate: { findFirst: vi.fn().mockResolvedValue(null), update, delete: del } }
    requireOrgSessionMock.mockResolvedValue({ db, organizationId: ORG_A, session: SESSION_A })
    const p = { params: Promise.resolve({ id: "tpl-b" }) }
    expect((await mod.PATCH(makeRequest("/api/admin/settings/message-templates/tpl-b", "PATCH", { name: "X", subject: "x", body: "y" }), p)).status).toBe(404)
    expect((await mod.DELETE(makeRequest("/api/admin/settings/message-templates/tpl-b", "DELETE"), p)).status).toBe(404)
    expect(update).not.toHaveBeenCalled()
    expect(del).not.toHaveBeenCalled()
  })

  it("question routes return 404 for an org-B event or question, writing nothing (#483)", async () => {
    const list = await import("@/app/api/admin/events/[id]/questions/route")
    const one = await import("@/app/api/admin/events/[id]/questions/[questionId]/route")
    const create = vi.fn(), update = vi.fn(), del = vi.fn()
    const db = { ...mockScopedDb(), eventQuestion: { findFirst: vi.fn().mockResolvedValue(null), findMany: vi.fn().mockResolvedValue([]), count: vi.fn().mockResolvedValue(0), create, update, delete: del } }
    requireOrgSessionMock.mockResolvedValue({ db, organizationId: ORG_A, session: SESSION_A })
    const p = { params: Promise.resolve({ id: "evt-b", questionId: "q-b" }) }
    expect((await list.POST(makeRequest("/api/admin/events/evt-b/questions", "POST", { label: "X", type: "text" }), p)).status).toBe(404)
    expect((await one.PATCH(makeRequest("/api/admin/events/evt-b/questions/q-b", "PATCH", { label: "X", type: "text" }), p)).status).toBe(404)
    expect((await one.DELETE(makeRequest("/api/admin/events/evt-b/questions/q-b", "DELETE"), p)).status).toBe(404)
    expect(create).not.toHaveBeenCalled()
    expect(update).not.toHaveBeenCalled()
    expect(del).not.toHaveBeenCalled()
  })

  it("a question's poste must be one of this event's, read through the scoped client: another event's or org's is refused (#984, part 3)", async () => {
    const list = await import("@/app/api/admin/events/[id]/questions/route")
    const one = await import("@/app/api/admin/events/[id]/questions/[questionId]/route")
    const create = vi.fn(), update = vi.fn()
    // Event A is the caller's; its only poste is « Bar ». « Cuisine » exists on event B (other org).
    const shiftFindMany = vi.fn().mockResolvedValue([{ roleName: "Bar" }])
    const db = {
      ...mockScopedDb({ event: { findFirst: vi.fn().mockResolvedValue({ id: "evt-a" }) }, shift: { findMany: shiftFindMany } }),
      eventQuestion: {
        findFirst: vi.fn().mockResolvedValue({ id: "q-a", label: "X", type: "text", options: [], required: false, roleName: null, answers: [] }),
        count: vi.fn().mockResolvedValue(0), create, update,
      },
    }
    requireOrgSessionMock.mockResolvedValue({ db, organizationId: ORG_A, session: SESSION_A })
    const p = { params: Promise.resolve({ id: "evt-a", questionId: "q-a" }) }
    expect((await list.POST(makeRequest("/api/admin/events/evt-a/questions", "POST", { label: "X", type: "text", roleName: "Cuisine" }), p)).status).toBe(400)
    expect((await one.PATCH(makeRequest("/api/admin/events/evt-a/questions/q-a", "PATCH", { label: "X", type: "text", roleName: "Cuisine" }), p)).status).toBe(400)
    // Postes read for this event only, through the scoped db, never the raw client.
    for (const call of shiftFindMany.mock.calls) expect(call[0].where.eventId).toBe("evt-a")
    expect(prismaMock.shift.findFirst).not.toHaveBeenCalled()
    expect(create).not.toHaveBeenCalled()
    expect(update).not.toHaveBeenCalled()
  })

  it("a follow-up's parent must be an active question of this very event, read through the scoped client (#1016)", async () => {
    const list = await import("@/app/api/admin/events/[id]/questions/route")
    const one = await import("@/app/api/admin/events/[id]/questions/[questionId]/route")
    const create = vi.fn(), update = vi.fn()
    // Event A has one question; « q-b » (a yes/no question of event B, other org) is never found.
    const questionFindMany = vi.fn().mockResolvedValue([{ id: "q-a2", label: "Repas ?", type: "yesno", options: [], parentId: null, showIfValues: [], position: 0 }])
    const db = {
      ...mockScopedDb({ event: { findFirst: vi.fn().mockResolvedValue({ id: "evt-a" }) } }),
      eventQuestion: {
        findFirst: vi.fn().mockResolvedValue({ id: "q-a", label: "X", type: "text", options: [], required: false, roleName: null, parentId: null, showIfValues: [], answers: [], followUps: [] }),
        findMany: questionFindMany, count: vi.fn().mockResolvedValue(1), create, update,
      },
    }
    requireOrgSessionMock.mockResolvedValue({ db, organizationId: ORG_A, session: SESSION_A })
    const p = { params: Promise.resolve({ id: "evt-a", questionId: "q-a" }) }
    const body = { label: "Combien ?", type: "number", parentId: "q-b", showIfValues: ["Oui"] }
    const created = await list.POST(makeRequest("/api/admin/events/evt-a/questions", "POST", body), p)
    expect(created.status).toBe(400)
    expect((await created.json()).field).toBe("parentId")
    expect((await one.PATCH(makeRequest("/api/admin/events/evt-a/questions/q-a", "PATCH", body), p)).status).toBe(400)
    // Questions read for this event only, active ones, through the scoped db.
    expect(questionFindMany).toHaveBeenCalled()
    for (const call of questionFindMany.mock.calls) expect(call[0].where).toMatchObject({ eventId: "evt-a", archivedAt: null })
    expect(create).not.toHaveBeenCalled()
    expect(update).not.toHaveBeenCalled()
  })

  it("GET /api/admin/members/export reads members through the scoped client only (#384)", async () => {
    const { GET } = await import("@/app/api/admin/members/export/route")
    const db = setupGuard({ volunteer: { findMany: vi.fn().mockResolvedValue([]) } })
    const res = await GET()
    expect(res.status).toBe(200)
    expect(db.volunteer.findMany).toHaveBeenCalledOnce()
    expect(prismaMock.volunteer.findFirst).not.toHaveBeenCalled()
  })

  it("GET /api/admin/members/export-hours reads members through the scoped client only (#557)", async () => {
    const { GET } = await import("@/app/api/admin/members/export-hours/route")
    const db = setupGuard({ volunteer: { findMany: vi.fn().mockResolvedValue([]) } })
    const res = await GET(makeRequest("/api/admin/members/export-hours"))
    expect(res.status).toBe(200)
    expect(db.volunteer.findMany).toHaveBeenCalledOnce()
    expect(prismaMock.volunteer.findFirst).not.toHaveBeenCalled()
  })

  it("POST /api/admin/shifts/[id]/duplicate returns 404 for org-B shift, creating nothing", async () => {
    const { POST } = await import("@/app/api/admin/shifts/[id]/duplicate/route")
    const db = setupGuard() // shift.findFirst → null
    const create = vi.fn()
    Object.assign(db.shift, { create })

    const res = await POST(makeRequest("/api/admin/shifts/shift-b/duplicate", "POST"), params("shift-b"))
    expect(res.status).toBe(404)
    expect(create).not.toHaveBeenCalled()
    // Nor the settings of its poste (#1002).
    expect(db.shift.findMany).not.toHaveBeenCalled()
  })

  it("DELETE /api/admin/shifts/[id] returns 404 for org-B shift (cascade cancel blocked)", async () => {
    const { DELETE } = await import("@/app/api/admin/shifts/[id]/route")
    setupGuard()

    const res = await DELETE(makeRequest("/api/admin/shifts/shift-b", "DELETE"), params("shift-b"))
    expect(res.status).toBe(404)
    expect(prismaMock.shift.update).not.toHaveBeenCalled()
  })

  it("DELETE /api/admin/shifts/[id] succeeds for an org-A shift", async () => {
    const { DELETE } = await import("@/app/api/admin/shifts/[id]/route")
    setupGuard({
      shift: {
        findFirst: vi.fn().mockResolvedValue({
          id: "shift-a",
          event: { title: "A", slug: "a", organization: { slug: "org-a" } },
          label: "Bar",
          date: new Date("2026-06-14"),
          startTime: "14:00",
          endTime: "18:00",
          registrations: [],
        }),
      },
    })
    prismaMock.shift.update.mockResolvedValue({ id: "shift-a", status: "cancelled" })

    const res = await DELETE(makeRequest("/api/admin/shifts/shift-a", "DELETE"), params("shift-a"))
    expect(res.status).toBe(200)
    expect(prismaMock.shift.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "shift-a" } }),
    )
  })
})

// ── Registrations ─────────────────────────────────────────────────────────────

describe("Registrations — cross-tenant isolation", () => {
  beforeEach(() => vi.clearAllMocks())

  it("PATCH /api/admin/registrations/[id] returns 404 for org-B registration", async () => {
    const { PATCH } = await import("@/app/api/admin/registrations/[id]/route")
    setupGuard()

    const res = await PATCH(
      makeRequest("/api/admin/registrations/reg-b", "PATCH", { status: "cancelled" }),
      params("reg-b"),
    )
    expect(res.status).toBe(404)
    expect(prismaMock.registration.update).not.toHaveBeenCalled()
  })

  it("DELETE /api/admin/registrations/[id] returns 404 for org-B registration", async () => {
    const { DELETE } = await import("@/app/api/admin/registrations/[id]/route")
    setupGuard()

    const res = await DELETE(makeRequest("/api/admin/registrations/reg-b", "DELETE"), params("reg-b"))
    expect(res.status).toBe(404)
    expect(prismaMock.registration.update).not.toHaveBeenCalled()
  })

  it("POST /api/admin/registrations/[id]/resend-link returns 404 for org-B registration", async () => {
    const { POST } = await import("@/app/api/admin/registrations/[id]/resend-link/route")
    setupGuard()

    const res = await POST(makeRequest("/api/admin/registrations/reg-b/resend-link", "POST"), params("reg-b"))
    expect(res.status).toBe(404)
  })

  it("POST /api/admin/registrations/[id]/decision returns 404 for org-B registration, deciding nothing (#484)", async () => {
    const { POST } = await import("@/app/api/admin/registrations/[id]/decision/route")
    setupGuard()

    const res = await POST(makeRequest("/api/admin/registrations/reg-b/decision", "POST", { decision: "accept" }), params("reg-b"))
    expect(res.status).toBe(404)
    expect(prismaMock.registration.update).not.toHaveBeenCalled()
  })

  it("POST /api/admin/registrations/[id]/restore returns 404 for org-B registration, restoring nothing (#809)", async () => {
    const { POST } = await import("@/app/api/admin/registrations/[id]/restore/route")
    setupGuard()

    const res = await POST(makeRequest("/api/admin/registrations/reg-b/restore", "POST"), params("reg-b"))
    expect(res.status).toBe(404)
    expect(prismaMock.registration.update).not.toHaveBeenCalled()
  })

  it("POST decision and restore with an availability acknowledgement (#1146, lot B) still return 404 for an org-B registration", async () => {
    const decision = await import("@/app/api/admin/registrations/[id]/decision/route")
    const restore = await import("@/app/api/admin/registrations/[id]/restore/route")
    setupGuard()
    const ack = ["a1|evt-b|vol-b|shift-b|1|2|req-b|1|Europe/Zurich"]
    expect((await decision.POST(makeRequest("/api/admin/registrations/reg-b/decision", "POST", { decision: "accept", availabilityAck: ack }), params("reg-b"))).status).toBe(404)
    expect((await restore.POST(makeRequest("/api/admin/registrations/reg-b/restore", "POST", { availabilityAck: ack }), params("reg-b"))).status).toBe(404)
    expect(prismaMock.registration.update).not.toHaveBeenCalled()
  })

  it("POST /api/admin/registrations returns 404 when shift belongs to org-B", async () => {
    const { POST } = await import("@/app/api/admin/registrations/route")
    setupGuard() // shift.findFirst → null (org-B shift not visible to org-A)

    const res = await POST(
      makeRequest("/api/admin/registrations", "POST", {
        eventId: "evt-b",
        shiftId: "shift-b",
        firstName: "Alice",
        lastName: "M",
        email: "alice@x.com",
      }),
    )
    expect(res.status).toBe(404)
    expect(prismaMock.registration.create).not.toHaveBeenCalled()
  })

  it("POST /api/admin/registrations returns 404 for an org-B member chosen by id (#914)", async () => {
    const { POST } = await import("@/app/api/admin/registrations/route")
    const db = setupGuard({ shift: { findFirst: vi.fn().mockResolvedValue({ id: "shift-a", roleName: "Bar", capacity: 5, registrations: [] }) } })

    const res = await POST(makeRequest("/api/admin/registrations", "POST", { eventId: "evt-a", shiftId: "shift-a", volunteerId: "mem-b" }))
    expect(res.status).toBe(404)
    expect(db.volunteer.findFirst).toHaveBeenCalledWith({ where: { id: "mem-b", organizationId: ORG_A } })
    expect(db.volunteer.create).not.toHaveBeenCalled()
    expect(prismaMock.registration.create).not.toHaveBeenCalled()
  })

  it("POST /api/admin/events/[id]/registrations/bulk returns 404 for an org-B event", async () => {
    const { POST } = await import("@/app/api/admin/events/[id]/registrations/bulk/route")
    setupGuard() // event.findFirst → null (org-B event not visible to org-A)

    const res = await POST(
      makeRequest("/api/admin/events/evt-b/registrations/bulk", "POST", { action: "cancel", registrationIds: ["reg-b"] }),
      params("evt-b"),
    )
    expect(res.status).toBe(404)
    expect(prismaMock.registration.update).not.toHaveBeenCalled()
  })

  it("POST /api/admin/events/[id]/registrations/bulk returns 404 when a selected registration is org-B's", async () => {
    const { POST } = await import("@/app/api/admin/events/[id]/registrations/bulk/route")
    setupGuard({
      event: { findFirst: vi.fn().mockResolvedValue({ id: "evt-a", title: "A", organization: { slug: "a" } }) },
      registration: { findMany: vi.fn().mockResolvedValue([{ id: "reg-a", eventId: "evt-a", status: "active" }]) },
    })

    const res = await POST(
      makeRequest("/api/admin/events/evt-a/registrations/bulk", "POST", { action: "cancel", registrationIds: ["reg-a", "reg-b"] }),
      params("evt-a"),
    )
    expect(res.status).toBe(404)
    expect(prismaMock.registration.update).not.toHaveBeenCalled()
  })
})

// ── Admin settings ────────────────────────────────────────────────────────────

describe("Admin settings — cross-tenant isolation", () => {
  beforeEach(() => vi.clearAllMocks())

  it("GET /api/admin/settings/admins returns only org-A admins", async () => {
    const { GET } = await import("@/app/api/admin/settings/admins/route")
    const db = setupGuard({
      adminUser: {
        findMany: vi.fn().mockResolvedValue([
          { id: "adm-a1", name: "Admin A", email: "a@a.com", role: "admin", isActive: true, createdAt: new Date(), setupTokenExpiresAt: null },
        ]),
      },
    })

    const res = await GET()
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toHaveLength(1)
    expect(db.adminUser.findMany).toHaveBeenCalledOnce()
  })

  it("DELETE /api/admin/settings/admins/[id] returns 404 for org-B admin", async () => {
    const { DELETE } = await import("@/app/api/admin/settings/admins/[id]/route")
    setupGuard() // adminUser.findFirst → null (org-B admin not visible)

    const res = await DELETE(makeRequest("/api/admin/settings/admins/adm-b", "DELETE"), params("adm-b"))
    expect(res.status).toBe(404)
    expect(prismaMock.adminUser.delete).not.toHaveBeenCalled()
  })

  // #1053: an invitation never touches another organisation's active account or valid invitation,
  // and the answer does not say the address is used there.
  it("POST /api/admin/settings/admins leaves an org-B active account or valid invitation alone", async () => {
    const { POST } = await import("@/app/api/admin/settings/admins/route")
    const db = setupGuard()
    db.organization.findUnique.mockResolvedValue({ id: ORG_A, name: "Org A", outboundEmailApprovedAt: new Date() })
    const holders = [
      { id: "adm-b", organizationId: "org-b", isActive: true, setupTokenHash: null, setupTokenExpiresAt: null },
      { id: "inv-b", organizationId: "org-b", isActive: false, setupTokenHash: "h", setupTokenExpiresAt: new Date(Date.now() + 86_400_000) },
    ]
    for (const holder of holders) {
      prismaMock.adminUser.findFirst.mockResolvedValueOnce(holder)
      const res = await POST(makeRequest("/api/admin/settings/admins", "POST", { email: "b@b.com", name: "B" }))
      expect(res.status).toBe(409)
      expect((await res.json()).error).not.toMatch(/utilisé|autre organisation/)
    }
    expect(prismaMock.adminUser.deleteMany).not.toHaveBeenCalled()
    expect(prismaMock.adminUser.create).not.toHaveBeenCalled()
  })

  it("DELETE /api/admin/settings/admins/[id] blocks removing self", async () => {
    const { DELETE } = await import("@/app/api/admin/settings/admins/[id]/route")
    setupGuard({
      adminUser: {
        findFirst: vi.fn().mockResolvedValue({
          id: "adm-self",
          email: SESSION_A.user.email, // same as caller
          isActive: true,
        }),
      },
    })

    const res = await DELETE(makeRequest("/api/admin/settings/admins/adm-self", "DELETE"), params("adm-self"))
    expect(res.status).toBe(400)
    expect(prismaMock.adminUser.delete).not.toHaveBeenCalled()
  })
})

// ── Invitations ───────────────────────────────────────────────────────────────

describe("Invitations — cross-tenant isolation", () => {
  beforeEach(() => vi.clearAllMocks())

  it("POST /api/admin/events/[id]/invitations returns 404 for org-B event", async () => {
    const { POST } = await import("@/app/api/admin/events/[id]/invitations/route")
    setupGuard() // event.findFirst → null

    const res = await POST(
      makeRequest("/api/admin/events/evt-b/invitations", "POST", { volunteerIds: ["mem-a"] }),
      params("evt-b"),
    )
    expect(res.status).toBe(404)
    // Nothing queued in the outbox for an org-B event (#1105).
    expect(prismaMock.notificationOutbox.createMany).not.toHaveBeenCalled()
    expect(prismaMock.notificationOutbox.create).not.toHaveBeenCalled()
  })

  it("GET /api/admin/events/[id]/invitations returns 404 for org-B event", async () => {
    const { GET } = await import("@/app/api/admin/events/[id]/invitations/route")
    setupGuard()

    const res = await GET(makeRequest("/api/admin/events/evt-b/invitations"), params("evt-b"))
    expect(res.status).toBe(404)
  })

  it("POST /api/admin/events/[id]/invitations/remind returns 404 for org-B event (#558)", async () => {
    const { POST } = await import("@/app/api/admin/events/[id]/invitations/remind/route")
    setupGuard() // event.findFirst → null

    const res = await POST(makeRequest("/api/admin/events/evt-b/invitations/remind", "POST", {}), params("evt-b"))
    expect(res.status).toBe(404)
    expect(prismaMock.notificationOutbox.createMany).not.toHaveBeenCalled()
    expect(prismaMock.notificationOutbox.create).not.toHaveBeenCalled()
  })

  it("POST /api/admin/events/[id]/invitations/test-email returns 404 for org-B event and sends nothing (#1045)", async () => {
    const { POST } = await import("@/app/api/admin/events/[id]/invitations/test-email/route")
    const { sendMemberInvite } = await import("@/lib/notification-helpers")
    setupGuard() // event.findFirst → null

    const res = await POST(makeRequest("/api/admin/events/evt-b/invitations/test-email", "POST", { email: "t@x.ch" }), params("evt-b"))
    expect(res.status).toBe(404)
    expect(sendMemberInvite).not.toHaveBeenCalled()
  })
})

// ── Sector leaders (#186) ────────────────────────────────────────────────────

describe("Sector leaders — cross-tenant isolation", () => {
  beforeEach(() => vi.clearAllMocks())

  it("GET /api/admin/events/[id]/sector-leaders returns 404 for org-B event", async () => {
    const { GET } = await import("@/app/api/admin/events/[id]/sector-leaders/route")
    setupGuard() // event.findFirst → null

    const res = await GET(makeRequest("/api/admin/events/evt-b/sector-leaders"), params("evt-b"))
    expect(res.status).toBe(404)
  })

  it("POST /api/admin/events/[id]/sector-leaders returns 404 for org-B event", async () => {
    const { POST } = await import("@/app/api/admin/events/[id]/sector-leaders/route")
    setupGuard()

    const res = await POST(
      makeRequest("/api/admin/events/evt-b/sector-leaders", "POST", { roleName: "Bar", name: "Alice", email: "a@x.com" }),
      params("evt-b"),
    )
    expect(res.status).toBe(404)
  })

  it("DELETE /api/admin/events/[id]/sector-leaders/[leaderId] returns 404 for org-B event", async () => {
    const { DELETE } = await import("@/app/api/admin/events/[id]/sector-leaders/[leaderId]/route")
    setupGuard()

    const res = await DELETE(
      makeRequest("/api/admin/events/evt-b/sector-leaders/leader-1", "DELETE"),
      { params: Promise.resolve({ id: "evt-b", leaderId: "leader-1" }) },
    )
    expect(res.status).toBe(404)
  })
})

// ── Milestones (#189) ────────────────────────────────────────────────────────

describe("Milestones — cross-tenant isolation", () => {
  beforeEach(() => vi.clearAllMocks())

  it("GET /api/admin/events/[id]/milestones returns 404 for org-B event", async () => {
    const { GET } = await import("@/app/api/admin/events/[id]/milestones/route")
    setupGuard() // event.findFirst → null

    const res = await GET(makeRequest("/api/admin/events/evt-b/milestones"), params("evt-b"))
    expect(res.status).toBe(404)
  })

  it("POST /api/admin/events/[id]/milestones returns 404 for org-B event", async () => {
    const { POST } = await import("@/app/api/admin/events/[id]/milestones/route")
    setupGuard()

    const res = await POST(
      makeRequest("/api/admin/events/evt-b/milestones", "POST", { title: "Fermer les inscriptions", dueDate: "2026-09-20" }),
      params("evt-b"),
    )
    expect(res.status).toBe(404)
  })

  it("PATCH /api/admin/events/[id]/milestones/[milestoneId] returns 404 for org-B event", async () => {
    const { PATCH } = await import("@/app/api/admin/events/[id]/milestones/[milestoneId]/route")
    setupGuard()

    const res = await PATCH(
      makeRequest("/api/admin/events/evt-b/milestones/m-1", "PATCH", { done: true }),
      { params: Promise.resolve({ id: "evt-b", milestoneId: "m-1" }) },
    )
    expect(res.status).toBe(404)
  })

  it("PATCH /api/admin/events/[id]/milestones/[milestoneId] does not edit an org-B milestone's title or date (#989)", async () => {
    const { PATCH } = await import("@/app/api/admin/events/[id]/milestones/[milestoneId]/route")
    const db = setupGuard()

    const res = await PATCH(
      makeRequest("/api/admin/events/evt-b/milestones/m-1", "PATCH", { title: "Clore les inscriptions", dueDate: "2026-09-25" }),
      { params: Promise.resolve({ id: "evt-b", milestoneId: "m-1" }) },
    )
    expect(res.status).toBe(404)
    expect(db.eventMilestone.update).not.toHaveBeenCalled()
  })

  it("PATCH through an org-A event does not reach a milestone of another event (#989)", async () => {
    const { PATCH } = await import("@/app/api/admin/events/[id]/milestones/[milestoneId]/route")
    const db = setupGuard({ event: { findFirst: vi.fn().mockResolvedValue({ id: "evt-a" }) } })

    const res = await PATCH(
      makeRequest("/api/admin/events/evt-a/milestones/m-b", "PATCH", { title: "Clore les inscriptions" }),
      { params: Promise.resolve({ id: "evt-a", milestoneId: "m-b" }) },
    )
    expect(res.status).toBe(404)
    expect(db.eventMilestone.findFirst).toHaveBeenCalledWith({ where: { id: "m-b", eventId: "evt-a" } })
    expect(db.eventMilestone.update).not.toHaveBeenCalled()
  })

  // #985: the owner is an admin account, a model the scoped client does not filter by itself.
  // Even if a read returned another organisation's admin, the route checks the row and refuses.
  const ORG_B_ADMIN = { organizationId: "org-b", isActive: true }

  it("POST /api/admin/events/[id]/milestones refuses an owner from another organisation (#985)", async () => {
    const { POST } = await import("@/app/api/admin/events/[id]/milestones/route")
    const create = vi.fn()
    const db = setupGuard({
      event: { findFirst: vi.fn().mockResolvedValue({ id: "evt-a" }) },
      adminUser: { findFirst: vi.fn().mockResolvedValue(ORG_B_ADMIN) },
      eventMilestone: { create },
    })

    const res = await POST(
      makeRequest("/api/admin/events/evt-a/milestones", "POST", { title: "Louer la tente", dueDate: "2026-09-20", ownerId: "adm-b" }),
      params("evt-a"),
    )
    expect(res.status).toBe(422)
    expect(db.adminUser.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "adm-b", organizationId: ORG_A, isActive: true } }))
    expect(create).not.toHaveBeenCalled()
  })

  it("PATCH /api/admin/events/[id]/milestones/[milestoneId] refuses an owner from another organisation (#985)", async () => {
    const { PATCH } = await import("@/app/api/admin/events/[id]/milestones/[milestoneId]/route")
    const db = setupGuard({
      event: { findFirst: vi.fn().mockResolvedValue({ id: "evt-a" }) },
      adminUser: { findFirst: vi.fn().mockResolvedValue(ORG_B_ADMIN) },
      eventMilestone: { findFirst: vi.fn().mockResolvedValue({ id: "m-a", eventId: "evt-a", title: "Tente", dueDate: new Date("2026-09-20"), done: false, ownerId: null }) },
    })

    const res = await PATCH(
      makeRequest("/api/admin/events/evt-a/milestones/m-a", "PATCH", { ownerId: "adm-b" }),
      { params: Promise.resolve({ id: "evt-a", milestoneId: "m-a" }) },
    )
    expect(res.status).toBe(422)
    expect(db.adminUser.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "adm-b", organizationId: ORG_A, isActive: true } }))
    expect(db.eventMilestone.update).not.toHaveBeenCalled()
    expect(prismaMock.adminUser.findUnique).not.toHaveBeenCalled()
  })

  it("DELETE /api/admin/events/[id]/milestones/[milestoneId] returns 404 for org-B event", async () => {
    const { DELETE } = await import("@/app/api/admin/events/[id]/milestones/[milestoneId]/route")
    setupGuard()

    const res = await DELETE(
      makeRequest("/api/admin/events/evt-b/milestones/m-1", "DELETE"),
      { params: Promise.resolve({ id: "evt-b", milestoneId: "m-1" }) },
    )
    expect(res.status).toBe(404)
  })
})

// ── Share links per group (#947) ─────────────────────────────────────────────

describe("Group links — cross-tenant isolation (#947)", () => {
  beforeEach(() => vi.clearAllMocks())
  const linkParams = (id: string, linkId: string) => ({ params: Promise.resolve({ id, linkId }) })
  const ORG_A_EVENT = { id: "evt-a", slug: "fete", organization: { slug: "org-a" } }

  it("GET /api/admin/events/[id]/group-links returns 404 for an org-B event", async () => {
    const { GET } = await import("@/app/api/admin/events/[id]/group-links/route")
    const db = setupGuard() // event.findFirst → null
    const res = await GET(makeRequest("/api/admin/events/evt-b/group-links"), params("evt-b"))
    expect(res.status).toBe(404)
    expect(db.eventGroupLink.findMany).not.toHaveBeenCalled()
  })

  it("POST /api/admin/events/[id]/group-links returns 404 for an org-B event and creates nothing", async () => {
    const { POST } = await import("@/app/api/admin/events/[id]/group-links/route")
    const db = setupGuard()
    const res = await POST(makeRequest("/api/admin/events/evt-b/group-links", "POST", { name: "Amicale", roleNames: ["Bar"] }), params("evt-b"))
    expect(res.status).toBe(404)
    expect(db.eventGroupLink.create).not.toHaveBeenCalled()
  })

  it("PATCH /api/admin/events/[id]/group-links/[linkId] returns 404 for an org-B event", async () => {
    const { PATCH } = await import("@/app/api/admin/events/[id]/group-links/[linkId]/route")
    const db = setupGuard()
    const res = await PATCH(makeRequest("/api/admin/events/evt-b/group-links/link-b", "PATCH", { name: "X" }), linkParams("evt-b", "link-b"))
    expect(res.status).toBe(404)
    expect(db.eventGroupLink.update).not.toHaveBeenCalled()
  })

  it("PATCH and DELETE of an org-B link through an org-A event return 404, read only through the scoped client", async () => {
    const { PATCH, DELETE } = await import("@/app/api/admin/events/[id]/group-links/[linkId]/route")
    const db = setupGuard({ event: { findFirst: vi.fn().mockResolvedValue(ORG_A_EVENT) } }) // link lookup → null
    const patched = await PATCH(makeRequest("/api/admin/events/evt-a/group-links/link-b", "PATCH", { name: "X" }), linkParams("evt-a", "link-b"))
    const deleted = await DELETE(makeRequest("/api/admin/events/evt-a/group-links/link-b", "DELETE"), linkParams("evt-a", "link-b"))
    expect(patched.status).toBe(404)
    expect(deleted.status).toBe(404)
    expect(db.eventGroupLink.findFirst).toHaveBeenCalledWith({ where: { id: "link-b", eventId: "evt-a" } })
    expect(db.eventGroupLink.update).not.toHaveBeenCalled()
    expect(db.eventGroupLink.delete).not.toHaveBeenCalled()
  })

  it("DELETE /api/admin/events/[id]/group-links/[linkId] returns 404 for an org-B event", async () => {
    const { DELETE } = await import("@/app/api/admin/events/[id]/group-links/[linkId]/route")
    const db = setupGuard()
    const res = await DELETE(makeRequest("/api/admin/events/evt-b/group-links/link-b", "DELETE"), linkParams("evt-b", "link-b"))
    expect(res.status).toBe(404)
    expect(db.eventGroupLink.delete).not.toHaveBeenCalled()
  })

  it("GET /api/admin/events/[id]/qr?link= of an org-B link returns 404", async () => {
    const { GET } = await import("@/app/api/admin/events/[id]/qr/route")
    setupGuard({ event: { findFirst: vi.fn().mockResolvedValue({ slug: "fete", title: "Fête", organization: { slug: "org-a" } }) } })
    const res = await GET(makeRequest("/api/admin/events/evt-a/qr?link=link-b"), params("evt-a"))
    expect(res.status).toBe(404)
  })
})

// ── Organization logo (#300) ─────────────────────────────────────────────────

describe("Organization logo — cross-tenant isolation", () => {
  beforeEach(() => vi.clearAllMocks())

  const logoDb = () => ({
    organizationLogo: {
      upsert: vi.fn().mockResolvedValue({ hash: "f".repeat(64), width: 64, height: 64 }),
      deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
  })

  it("PUT /api/admin/settings/organization/logo writes the session org's logo through the scoped db only", async () => {
    const { PUT } = await import("@/app/api/admin/settings/organization/logo/route")
    const db = { ...mockScopedDb(), ...logoDb() }
    requireOrgSessionMock.mockResolvedValue({ db, organizationId: ORG_A, session: SESSION_A })
    const sharp = (await import("sharp")).default
    const png = await sharp({ create: { width: 64, height: 64, channels: 3, background: "#000" } }).png().toBuffer()

    // An org-B id in the URL or the body has nowhere to go: the route has no id, only the session's org.
    const res = await PUT(new Request("http://localhost:3000/api/admin/settings/organization/logo?organizationId=org-b", { method: "PUT", body: new Uint8Array(png) }))
    expect(res.status).toBe(200)
    expect(db.organizationLogo.upsert).toHaveBeenCalledWith(expect.objectContaining({ where: { organizationId: ORG_A }, create: expect.objectContaining({ organizationId: ORG_A }) }))
    expect((await res.json()).logo.src).toContain(`/organizations/${ORG_A}/logo`)
  })

  it("DELETE /api/admin/settings/organization/logo removes only the session org's logo", async () => {
    const { DELETE } = await import("@/app/api/admin/settings/organization/logo/route")
    const db = { ...mockScopedDb(), ...logoDb() }
    requireOrgSessionMock.mockResolvedValue({ db, organizationId: ORG_A, session: SESSION_A })

    const res = await DELETE()
    expect(res.status).toBe(200)
    expect(db.organizationLogo.deleteMany).toHaveBeenCalledWith({ where: { organizationId: ORG_A } })
  })
})

// ── Routes without an isolation case until #1049 ─────────────────────────────

describe("Event actions — cross-tenant isolation (#1049)", () => {
  beforeEach(() => vi.clearAllMocks())

  it("GET /api/admin/events/[id]/day-of returns 404 for an org-B event, reading only through the scoped db (#1141)", async () => {
    const { GET } = await import("@/app/api/admin/events/[id]/day-of/route")
    const db = setupGuard() // event.findFirst → null
    const res = await GET(makeRequest("/api/admin/events/evt-b/day-of"), params("evt-b"))
    expect(res.status).toBe(404)
    expect(db.event.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "evt-b" } }))
    expect(prismaMock.event.findFirst).not.toHaveBeenCalled()
  })

  it("POST /api/admin/events/[id]/duplicate returns 404 for an org-B event, creating nothing", async () => {
    const { POST } = await import("@/app/api/admin/events/[id]/duplicate/route")
    const db = setupGuard() // event.findFirst → null
    const res = await POST(makeRequest("/api/admin/events/evt-b/duplicate", "POST", { title: "Copie" }), params("evt-b"))
    expect(res.status).toBe(404)
    expect(db.event.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "evt-b" } }))
    expect(db.event.create).not.toHaveBeenCalled()
    expect(prismaMock.event.findFirst).not.toHaveBeenCalled()
  })

  it("GET /api/admin/events/[id]/export/pdf returns 404 for an org-B event", async () => {
    const { GET } = await import("@/app/api/admin/events/[id]/export/pdf/route")
    const db = setupGuard()
    const res = await GET(makeRequest("/api/admin/events/evt-b/export/pdf"), params("evt-b"))
    expect(res.status).toBe(404)
    expect(db.event.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "evt-b" } }))
    expect(prismaMock.event.findFirst).not.toHaveBeenCalled()
  })

  it("POST /api/admin/events/[id]/invitations/test-email returns 404 for an org-B event, sending nothing", async () => {
    const { POST } = await import("@/app/api/admin/events/[id]/invitations/test-email/route")
    const { sendMemberInvite } = await import("@/lib/notification-helpers")
    setupGuard()
    const res = await POST(makeRequest("/api/admin/events/evt-b/invitations/test-email", "POST", { email: "test@a.com" }), params("evt-b"))
    expect(res.status).toBe(404)
    expect(sendMemberInvite).not.toHaveBeenCalled()
    expect(prismaMock.event.findFirst).not.toHaveBeenCalled()
  })

  it("GET /api/admin/events/[id]/log/candidates returns 404 for an org-B event, for both kinds", async () => {
    const { GET } = await import("@/app/api/admin/events/[id]/log/candidates/route")
    setupGuard()
    for (const kind of ["replay", "story"]) {
      const res = await GET(makeRequest(`/api/admin/events/evt-b/log/candidates?kind=${kind}`), params("evt-b"))
      expect(res.status).toBe(404)
    }
    expect(prismaMock.event.findFirst).not.toHaveBeenCalled()
  })

  it("POST /api/admin/events/[id]/reorder-roles returns 404 for an org-B event, reordering nothing", async () => {
    const { POST } = await import("@/app/api/admin/events/[id]/reorder-roles/route")
    const updateMany = vi.fn().mockResolvedValue({ count: 0 })
    setupGuard({ shift: { updateMany } })
    const res = await POST(makeRequest("/api/admin/events/evt-b/reorder-roles", "POST", { roleOrder: ["Bar", "Accueil"] }), params("evt-b"))
    expect(res.status).toBe(404)
    expect(updateMany).not.toHaveBeenCalled()
    expect(prismaMock.shift.update).not.toHaveBeenCalled()
  })

  it("POST /api/admin/events/[id]/reorder-roles scopes every shift update to the org-A event", async () => {
    const { POST } = await import("@/app/api/admin/events/[id]/reorder-roles/route")
    const updateMany = vi.fn().mockResolvedValue({ count: 1 })
    setupGuard({ event: { findFirst: vi.fn().mockResolvedValue({ id: "evt-a" }) }, shift: { updateMany } })
    const res = await POST(makeRequest("/api/admin/events/evt-a/reorder-roles", "POST", { roleOrder: ["Bar", "Accueil"] }), params("evt-a"))
    expect(res.status).toBe(200)
    expect(updateMany).toHaveBeenCalledTimes(2)
    for (const [arg] of updateMany.mock.calls) {
      expect(arg.where).toEqual(expect.objectContaining({ eventId: "evt-a", event: { organizationId: ORG_A } }))
    }
  })

  it("POST /api/admin/events/[id]/send-reminder returns 404 for an org-B event, sending and stamping nothing", async () => {
    const { POST } = await import("@/app/api/admin/events/[id]/send-reminder/route")
    const { sendNotification } = await import("@/lib/notifications")
    const update = vi.fn()
    const db = setupGuard({ event: { update } })
    const res = await POST(makeRequest("/api/admin/events/evt-b/send-reminder", "POST"), params("evt-b"))
    expect(res.status).toBe(404)
    expect(db.registration.findMany).not.toHaveBeenCalled()
    expect(sendNotification).not.toHaveBeenCalled()
    expect(update).not.toHaveBeenCalled()
    expect(prismaMock.event.update).not.toHaveBeenCalled()
    // Through the outbox since #1105: no stamp claimed, nothing queued.
    expect(prismaMock.event.updateMany).not.toHaveBeenCalled()
    expect(prismaMock.notificationOutbox.createMany).not.toHaveBeenCalled()
    expect(prismaMock.notificationOutbox.create).not.toHaveBeenCalled()
  })

  it("POST /api/admin/events/[id]/send-reminder reads only the registrations of the org-A event", async () => {
    const { POST } = await import("@/app/api/admin/events/[id]/send-reminder/route")
    const db = setupGuard({
      event: { findFirst: vi.fn().mockResolvedValue({ id: "evt-a", organizationId: ORG_A, title: "A", organization: { name: "Org A", slug: "org-a" } }) },
    })
    const res = await POST(makeRequest("/api/admin/events/evt-a/send-reminder", "POST"), params("evt-a"))
    expect(res.status).toBe(400) // no registration in the scoped db
    expect(db.registration.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ eventId: "evt-a", event: { organizationId: ORG_A } }) }))
  })

  it("POST /api/admin/events/from-template creates the draft in the session org, through the scoped db only", async () => {
    const { POST } = await import("@/app/api/admin/events/from-template/route")
    const create = vi.fn().mockResolvedValue({ id: "evt-new", organization: { timeZone: null } })
    const db = setupGuard({ event: { create } })
    // An org-B id in the body has nowhere to go: the event's organization comes from the session.
    const res = await POST(makeRequest("/api/admin/events/from-template", "POST", { templateId: "buvette", title: "Buvette", startDate: "2026-11-28", organizationId: "org-b" }))
    expect(res.status).toBe(201)
    expect(db.event.findFirst).toHaveBeenCalled() // slug collision checked within the org
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ organizationId: ORG_A }) }))
    expect(prismaMock.event.findFirst).not.toHaveBeenCalled()
  })
})

describe("Member import — cross-tenant isolation (#1049)", () => {
  beforeEach(() => vi.clearAllMocks())

  const file = () => new File(["prenom,nom,email\nAlice,Martin,alice@x.com"], "m.csv", { type: "text/csv" })

  async function previewThenImport(db: ReturnType<typeof mockScopedDb>) {
    const preview = await import("@/app/api/admin/members/import/preview/route")
    const pfd = new FormData()
    pfd.append("file", file())
    pfd.append("onDuplicate", "update")
    const analysis = await (await preview.POST(new Request("http://localhost:3000/api/admin/members/import/preview", { method: "POST", body: pfd }))).json()

    const { POST } = await import("@/app/api/admin/members/import/route")
    const fd = new FormData()
    fd.append("file", file())
    fd.append("onDuplicate", "update")
    fd.append("fileHash", analysis.fileHash)
    fd.append("planHash", analysis.planHash)
    const res = await POST(new Request("http://localhost:3000/api/admin/members/import", { method: "POST", body: fd }))
    expect(db.volunteer.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ organizationId: ORG_A }) }))
    return res
  }

  it("POST /api/admin/members/import never matches an org-B member: the address is created in org A", async () => {
    // An org-B member with this address exists in the raw (unscoped) data; the scoped db sees none.
    prismaMock.volunteer.findFirst.mockResolvedValueOnce({ id: "mem-b", organizationId: "org-b", email: "alice@x.com" })
    const create = vi.fn().mockResolvedValue({ id: "mem-new" })
    const update = vi.fn()
    const db = setupGuard({ volunteer: { findMany: vi.fn().mockResolvedValue([]), create, update } })
    const res = await previewThenImport(db)
    expect(res.status).toBe(200)
    expect((await res.json()).created).toBe(1)
    expect(create).toHaveBeenCalledWith({ data: expect.objectContaining({ organizationId: ORG_A, email: "alice@x.com" }) })
    expect(update).not.toHaveBeenCalled()
    expect(prismaMock.volunteer.update).not.toHaveBeenCalled()
    expect(prismaMock.volunteer.create).not.toHaveBeenCalled()
  })

  it("POST /api/admin/members/import updates only the org-A member it found through the scoped db", async () => {
    const create = vi.fn()
    const update = vi.fn().mockResolvedValue({ id: "mem-a" })
    const db = setupGuard({ volunteer: { findMany: vi.fn().mockResolvedValue([{ id: "mem-a", email: "alice@x.com", tags: [] }]), create, update } })
    const res = await previewThenImport(db)
    expect(res.status).toBe(200)
    expect((await res.json()).updated).toBe(1)
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "mem-a" } }))
    expect(create).not.toHaveBeenCalled()
    expect(prismaMock.volunteer.update).not.toHaveBeenCalled()
  })
})

describe("Organization settings — cross-tenant isolation (#1049)", () => {
  beforeEach(() => vi.clearAllMocks())

  const slugDb = () => ({
    ...mockScopedDb(),
    orgSlugHistory: {
      findMany: vi.fn().mockResolvedValue([{ slug: "ancien-a", createdAt: new Date("2026-01-01") }]),
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
  })

  it("GET /api/admin/settings/activity/export reads every page of the session org's log only", async () => {
    const { GET } = await import("@/app/api/admin/settings/activity/export/route")
    setupGuard()
    const row = (i: number) => ({ id: `log-${i}`, actorType: "system", actorId: null, action: "event.updated", entityType: "Event", entityId: "evt-a", changes: null, createdAt: new Date("2026-10-01") })
    prismaMock.orgLog.findMany.mockResolvedValueOnce(Array.from({ length: 201 }, (_, i) => row(i))).mockResolvedValueOnce([row(300)])
    const res = await GET()
    expect(res.status).toBe(200)
    expect(prismaMock.organization.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { id: ORG_A } }))
    expect(prismaMock.orgLog.findMany).toHaveBeenCalledTimes(2)
    for (const [arg] of prismaMock.orgLog.findMany.mock.calls) {
      expect(arg.where).toEqual(expect.objectContaining({ organizationId: ORG_A }))
    }
  })

  // #1101: a batch of emails is hydrated in the activity log only within the session org; an id
  // of an org-B batch written in an org-A entry would find nothing.
  it("GET /api/admin/settings/activity reads batches of emails of the session org only", async () => {
    const { GET } = await import("@/app/api/admin/settings/activity/route")
    setupGuard()
    prismaMock.orgLog.findMany.mockResolvedValueOnce([{ id: "log-1", actorType: "admin", actorId: null, action: "sendbatch.queued", entityType: "SendBatch", entityId: "batch-b", changes: null, createdAt: new Date("2026-10-22") }])
    const res = await GET(new Request("http://localhost/api/admin/settings/activity"))
    expect(res.status).toBe(200)
    expect(prismaMock.sendBatch.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ organizationId: ORG_A, id: { in: ["batch-b"] } }) }))
    const body = await res.json()
    expect(body.entries[0].batch).toBeNull()
  })

  it("GET /api/admin/settings/organization/slugs lists only the session org's former addresses", async () => {
    const { GET } = await import("@/app/api/admin/settings/organization/slugs/route")
    const db = slugDb()
    requireOrgSessionMock.mockResolvedValue({ db, organizationId: ORG_A, session: SESSION_A })
    const res = await GET()
    expect(res.status).toBe(200)
    expect(db.orgSlugHistory.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { organizationId: ORG_A } }))
    expect(db.event.count).toHaveBeenCalledWith({ where: { organizationId: ORG_A, publicStatus: "published" } })
  })

  it("DELETE /api/admin/settings/organization/slugs only frees a slug of the session org, never an org-B one", async () => {
    const { DELETE } = await import("@/app/api/admin/settings/organization/slugs/route")
    const db = slugDb()
    requireOrgSessionMock.mockResolvedValue({ db, organizationId: ORG_A, session: SESSION_A })
    // An org-B slug and id in the body: the delete stays filtered on the session org, so it matches nothing.
    const res = await DELETE(makeRequest("/api/admin/settings/organization/slugs", "DELETE", { slug: "ancien-b", organizationId: "org-b" }))
    expect(res.status).toBe(200)
    expect(db.orgSlugHistory.deleteMany).toHaveBeenCalledWith({ where: { slug: "ancien-b", organizationId: ORG_A } })
  })

  // #867: the hourly rate is written on the session org; an org-B id in the URL or the body has nowhere to go.
  it("PATCH /api/admin/settings/organization writes the hourly rate on the session org only", async () => {
    const { PATCH } = await import("@/app/api/admin/settings/organization/route")
    setupGuard()
    const res = await PATCH(makeRequest("/api/admin/settings/organization?organizationId=org-b", "PATCH", { organizationId: "org-b", volunteerHourRate: "25", volunteerHourRateCurrency: "CHF" }))
    expect(res.status).toBe(200)
    expect(prismaMock.organization.update).toHaveBeenCalledTimes(1)
    const arg = prismaMock.organization.update.mock.calls[0][0]
    expect(arg.where).toEqual({ id: ORG_A })
    expect(arg.data).not.toHaveProperty("organizationId")
    expect(arg.data).toEqual(expect.objectContaining({ volunteerHourRateCents: 2500, volunteerHourRateCurrency: "CHF" }))
  })

  // #1168: joining the beta writes the session org only; an org-B id in the URL or the body has nowhere to go.
  it("PUT /api/admin/settings/organization/beta opts in the session org only", async () => {
    vi.doMock("@/lib/beta-access", () => ({ readOpenBetaCapabilities: vi.fn().mockResolvedValue(["sectors"]) }))
    const { PUT } = await import("@/app/api/admin/settings/organization/beta/route")
    setupGuard()
    prismaMock.organization.findUnique.mockResolvedValueOnce({ betaOptInAt: null })
    const updateMany = vi.fn().mockResolvedValue({ count: 1 })
    ;(prismaMock.organization as Record<string, unknown>).updateMany = updateMany
    const res = await PUT(makeRequest("/api/admin/settings/organization/beta?organizationId=org-b", "PUT", { organizationId: "org-b", optIn: true }))
    expect(res.status).toBe(200)
    expect(updateMany).toHaveBeenCalledTimes(1)
    expect(updateMany.mock.calls[0][0].where).toEqual({ id: ORG_A, betaOptInAt: null })
    expect(updateMany.mock.calls[0][0].data).not.toHaveProperty("organizationId")
    for (const [args] of prismaMock.organization.findUnique.mock.calls) expect(args.where).toEqual({ id: ORG_A })
    expect(prismaMock.orgLog.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ organizationId: ORG_A, entityId: ORG_A, action: "organization.beta_opted_in" }) }))
    vi.doUnmock("@/lib/beta-access")
  })

  it("GET /api/admin/settings/notifications reads the session org's settings only", async () => {
    const { GET } = await import("@/app/api/admin/settings/notifications/route")
    setupGuard()
    const res = await GET()
    expect(res.status).toBe(200)
    expect(prismaMock.organization.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { id: ORG_A } }))
  })

  it("PATCH /api/admin/settings/notifications writes the session org only, whatever id the body carries", async () => {
    const { PATCH } = await import("@/app/api/admin/settings/notifications/route")
    setupGuard()
    const res = await PATCH(makeRequest("/api/admin/settings/notifications?organizationId=org-b", "PATCH", { organizationId: "org-b", settings: { signupAdminEmail: false } }))
    expect(res.status).toBe(200)
    expect(prismaMock.organization.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { id: ORG_A } }))
    expect(prismaMock.organization.update).toHaveBeenCalledTimes(1)
    expect(prismaMock.organization.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: ORG_A } }))
    expect(prismaMock.orgLog.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ organizationId: ORG_A }) }))
  })

  it("POST /api/admin/settings/notifications/test queues the email under the session org only", async () => {
    const { POST } = await import("@/app/api/admin/settings/notifications/test/route")
    setupGuard()
    const res = await POST()
    expect(res.status).toBe(200)
    expect(prismaMock.organization.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { id: ORG_A } }))
    expect(prismaMock.notificationOutbox.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ organizationId: ORG_A }) }))
  })
})

// ── Sectors (#1147) ──────────────────────────────────────────────────────────

describe("Sectors — cross-tenant isolation (#1147)", () => {
  beforeEach(() => vi.clearAllMocks())
  const sectorParams = (id: string, sectorId: string) => ({ params: Promise.resolve({ id, sectorId }) })
  /** A scoped db whose sector writes would be visible: none may run for an org-B event. */
  const sectorDb = (event: unknown = null, locked: unknown[] = []) => {
    const db = setupGuard({ event: { findFirst: vi.fn().mockResolvedValue(event) } })
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue(locked),
      sector: { findMany: vi.fn().mockResolvedValue([]), create: vi.fn(), update: vi.fn() },
      shift: { findMany: vi.fn().mockResolvedValue([]), updateMany: vi.fn() },
      event: { update: vi.fn() },
    }
    const extra = { sector: { findMany: vi.fn().mockResolvedValue([]) }, $transaction: vi.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)) }
    Object.assign(db, extra)
    return { db: db as typeof db & typeof extra, tx }
  }

  it("GET and POST /api/admin/events/[id]/sectors return 404 for an org-B event and write nothing", async () => {
    const { GET, POST } = await import("@/app/api/admin/events/[id]/sectors/route")
    const { db, tx } = sectorDb()
    expect((await GET(makeRequest("/api/admin/events/evt-b/sectors"), params("evt-b"))).status).toBe(404)
    expect((await POST(makeRequest("/api/admin/events/evt-b/sectors", "POST", { name: "Parking" }), params("evt-b"))).status).toBe(404)
    expect(db.sector.findMany).not.toHaveBeenCalled()
    expect(tx.sector.create).not.toHaveBeenCalled()
  })

  it("PATCH sectors/[sectorId], POST sectors/reorder and PUT sectors/mode return 404 for an org-B event", async () => {
    const one = await import("@/app/api/admin/events/[id]/sectors/[sectorId]/route")
    const reorder = await import("@/app/api/admin/events/[id]/sectors/reorder/route")
    const mode = await import("@/app/api/admin/events/[id]/sectors/mode/route")
    const { db, tx } = sectorDb()
    expect((await one.PATCH(makeRequest("/api/admin/events/evt-b/sectors/sec-b", "PATCH", { name: "X" }), sectorParams("evt-b", "sec-b"))).status).toBe(404)
    expect((await reorder.POST(makeRequest("/api/admin/events/evt-b/sectors/reorder", "POST", { sectorIds: [] }), params("evt-b"))).status).toBe(404)
    expect((await mode.PUT(makeRequest("/api/admin/events/evt-b/sectors/mode", "PUT", { enabled: false }), params("evt-b"))).status).toBe(404)
    expect(db.$transaction).not.toHaveBeenCalled()
    expect(tx.event.update).not.toHaveBeenCalled()
  })

  it("an org-B sector through an org-A event is not found: the row locks filter on the event and the organisation", async () => {
    const one = await import("@/app/api/admin/events/[id]/sectors/[sectorId]/route")
    const { tx } = sectorDb({ id: "evt-a" })
    tx.$queryRaw.mockResolvedValueOnce([{ id: "evt-a", sectorsEnabled: true, sectorsAdoptedAt: new Date() }]).mockResolvedValueOnce([])
    const res = await one.PATCH(makeRequest("/api/admin/events/evt-a/sectors/sec-b", "PATCH", { archived: true, detachPostes: true }), sectorParams("evt-a", "sec-b"))
    expect(res.status).toBe(404)
    const [eventLock, sectorLock] = tx.$queryRaw.mock.calls
    expect(eventLock.slice(1)).toEqual(["evt-a", ORG_A])
    expect(sectorLock.slice(1)).toEqual(["sec-b", "evt-a"])
    expect(tx.shift.updateMany).not.toHaveBeenCalled()
    expect(tx.sector.update).not.toHaveBeenCalled()
  })

  const newShift = { roleName: "Accueil", label: "Accueil", date: "2026-07-04", startTime: "10:00", endTime: "12:00", capacity: 2 }

  it("POST /api/admin/shifts with a sector returns 404 for an org-B event, locking and creating nothing", async () => {
    const { POST } = await import("@/app/api/admin/shifts/route")
    const { db, tx } = sectorDb()
    const create = vi.fn()
    Object.assign(tx.shift, { create })
    const res = await POST(makeRequest("/api/admin/shifts", "POST", { ...newShift, eventId: "evt-b", sectorId: "sec-b" }))
    expect(res.status).toBe(404)
    expect(db.$transaction).not.toHaveBeenCalled()
    expect(create).not.toHaveBeenCalled()
  })

  it("POST /api/admin/shifts with an org-B sector on an org-A event creates no shift: the sector lock filters on the event", async () => {
    const { POST } = await import("@/app/api/admin/shifts/route")
    const { tx } = sectorDb({ id: "evt-a", startDate: new Date("2026-07-01"), endDate: new Date("2026-07-31") })
    const create = vi.fn()
    Object.assign(tx.shift, { create })
    tx.$queryRaw.mockResolvedValueOnce([{ id: "evt-a", sectorsEnabled: true, sectorsAdoptedAt: new Date() }]).mockResolvedValueOnce([])
    const res = await POST(makeRequest("/api/admin/shifts", "POST", { ...newShift, eventId: "evt-a", sectorId: "sec-b" }))
    expect(res.status).toBe(404)
    const [eventLock, sectorLock] = tx.$queryRaw.mock.calls
    expect(eventLock.slice(1)).toEqual(["evt-a", ORG_A])
    expect(sectorLock.slice(1)).toEqual(["sec-b", "evt-a"])
    expect(create).not.toHaveBeenCalled()
  })

  const bulk = [
    { path: "/api/admin/shifts/series", load: () => import("@/app/api/admin/shifts/series/route"), body: { roleName: "Accueil", date: "2026-07-04", startTime: "10:00", endTime: "14:00", slotMinutes: 120, capacity: 2 } },
    {
      path: "/api/admin/shifts/recurrence", load: () => import("@/app/api/admin/shifts/recurrence/route"),
      body: { roleName: "Accueil", from: "2026-07-01", until: "2026-07-31", weekdays: [3], everyWeeks: 1, startTime: "14:00", endTime: "17:00", slotMinutes: 180, capacity: 2, holidays: "none", closures: [] },
    },
  ]

  it.each(bulk)("POST $path with a sector returns 404 for an org-B event, locking and creating nothing", async ({ path, load, body }) => {
    const { POST } = await load()
    const { db, tx } = sectorDb()
    const writes = { create: vi.fn(), createMany: vi.fn() }
    Object.assign(tx.shift, writes)
    const res = await POST(makeRequest(path, "POST", { ...body, eventId: "evt-b", sectorId: "sec-b" }))
    expect(res.status).toBe(404)
    expect(db.$transaction).not.toHaveBeenCalled()
    expect(writes.create).not.toHaveBeenCalled()
    expect(writes.createMany).not.toHaveBeenCalled()
  })

  it.each(bulk)("POST $path with an org-B sector on an org-A event creates nothing: the sector lock filters on the event", async ({ path, load, body }) => {
    const { POST } = await load()
    const { tx } = sectorDb({ id: "evt-a", startDate: new Date("2026-07-01"), endDate: new Date("2026-07-31") })
    const writes = { create: vi.fn(), createMany: vi.fn() }
    const ruleCreate = vi.fn()
    Object.assign(tx.shift, writes)
    Object.assign(tx, { shiftRecurrence: { create: ruleCreate } })
    tx.$queryRaw.mockResolvedValueOnce([{ id: "evt-a", sectorsEnabled: true, sectorsAdoptedAt: new Date() }]).mockResolvedValueOnce([])
    const res = await POST(makeRequest(path, "POST", { ...body, eventId: "evt-a", sectorId: "sec-b" }))
    expect(res.status).toBe(404)
    const [eventLock, sectorLock] = tx.$queryRaw.mock.calls
    expect(eventLock.slice(1)).toEqual(["evt-a", ORG_A])
    expect(sectorLock.slice(1)).toEqual(["sec-b", "evt-a"])
    expect(writes.create).not.toHaveBeenCalled()
    expect(writes.createMany).not.toHaveBeenCalled()
    expect(ruleCreate).not.toHaveBeenCalled()
  })

  it("PATCH roles/[roleName] with an org-B sector moves no shift", async () => {
    const { PATCH } = await import("@/app/api/admin/events/[id]/roles/[roleName]/route")
    const { db, tx } = sectorDb({ id: "evt-a" })
    db.shift.findMany = vi.fn().mockResolvedValue([{ id: "sh-1", sectorId: null, status: "open", _count: { registrations: 0 } }])
    tx.$queryRaw.mockResolvedValueOnce([{ id: "evt-a", sectorsEnabled: true, sectorsAdoptedAt: new Date() }]).mockResolvedValueOnce([])
    const res = await PATCH(makeRequest("/api/admin/events/evt-a/roles/Bar", "PATCH", { sectorId: "sec-b" }), { params: Promise.resolve({ id: "evt-a", roleName: "Bar" }) })
    expect(res.status).toBe(404)
    expect(tx.shift.updateMany).not.toHaveBeenCalled()
  })

  // #1169: a sector leader for an org-A event, naming an org-B sector, is never created.
  it("POST sector-leaders with an org-B sector through an org-A event creates no leader", async () => {
    // The beta gate open for org A: capability opened by the operator, org in the beta.
    ;(prismaMock as Record<string, unknown>).platformSetting = { findUnique: vi.fn().mockResolvedValue({ value: { open: ["sectors", "sectorLeaders"] } }) }
    prismaMock.organization.findUnique.mockResolvedValueOnce({ active: true, suspendedAt: null, betaOptInAt: new Date() })
    const { POST } = await import("@/app/api/admin/events/[id]/sector-leaders/route")
    const { db, tx } = sectorDb({ id: "evt-a", title: "Fête", organization: { slug: "org-a" } })
    const create = vi.fn()
    Object.assign(tx, { sectorLeader: { create } })
    ;(db as Record<string, unknown>).sectorLeader = { findFirst: vi.fn().mockResolvedValue(null), create }
    tx.$queryRaw.mockResolvedValueOnce([{ id: "evt-a", sectorsEnabled: true, sectorsAdoptedAt: new Date() }]).mockResolvedValueOnce([])
    const res = await POST(makeRequest("/api/admin/events/evt-a/sector-leaders", "POST", { sectorId: "sec-b", name: "Paula", email: "p@x.com" }), params("evt-a"))
    expect(res.status).toBe(404)
    const [eventLock, sectorLock] = tx.$queryRaw.mock.calls
    expect(eventLock.slice(1)).toEqual(["evt-a", ORG_A])
    expect(sectorLock.slice(1)).toEqual(["sec-b", "evt-a"])
    expect(create).not.toHaveBeenCalled()
  })

  it("POST sector-leaders with a sector for an org-B event returns 404 before any lock", async () => {
    const { POST } = await import("@/app/api/admin/events/[id]/sector-leaders/route")
    const { tx } = sectorDb()
    const res = await POST(makeRequest("/api/admin/events/evt-b/sector-leaders", "POST", { sectorId: "sec-b", name: "Paula", email: "p@x.com" }), params("evt-b"))
    expect(res.status).toBe(404)
    expect(tx.$queryRaw).not.toHaveBeenCalled()
  })
})

// ── « Secteur » filter on views and exports (#1170) ───────────────────────────

describe("Sector filter of the exports — cross-tenant isolation (#1170)", () => {
  beforeEach(() => vi.clearAllMocks())

  const routes: [string, () => Promise<{ GET: (req: Request, ctx: { params: Promise<{ id: string; view: string }> }) => Promise<Response> }>, string][] = [
    ["export/attendance", () => import("@/app/api/admin/events/[id]/export/attendance/route"), "day"],
    ["export/answers", () => import("@/app/api/admin/events/[id]/export/answers/route"), "day"],
    ["export/sheets/[view]", () => import("@/app/api/admin/events/[id]/export/sheets/[view]/route"), "day"],
    ["export/badges", () => import("@/app/api/admin/events/[id]/export/badges/route"), "day"],
    ["export/pdf", () => import("@/app/api/admin/events/[id]/export/pdf/route"), "day"],
    ["day-of", () => import("@/app/api/admin/events/[id]/day-of/route"), "day"],
  ]

  for (const [name, load, view] of routes) {
    it(`GET /api/admin/events/[id]/${name}?secteur= returns 404 for an org-B event, reading no shift and nothing unscoped`, async () => {
      const { GET } = await load()
      const db = setupGuard() // event.findFirst → null
      const res = await GET(makeRequest(`/api/admin/events/evt-b/${name.replace("[view]", view)}?secteur=sec-b`), { params: Promise.resolve({ id: "evt-b", view }) })
      expect(res.status).toBe(404)
      expect(db.event.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "evt-b" } }))
      expect(db.shift.findMany).not.toHaveBeenCalled()
      expect(prismaMock.event.findFirst).not.toHaveBeenCalled()
    })
  }

  it("an org-B sector id on an org-A event is ignored: the export is the whole event, no poste lookup", async () => {
    const { GET } = await import("@/app/api/admin/events/[id]/export/attendance/route")
    const findFirst = vi.fn(async (args: { select: Record<string, unknown> }) =>
      "title" in args.select
        ? { id: "evt-a", title: "A", slug: "a", organization: { timeZone: null }, questions: [], registrations: [] }
        // The org-scoped read of the event's sectors: org-A's only.
        : { sectorsEnabled: true, sectorsAdoptedAt: new Date("2026-10-01"), sectors: [{ id: "sec-a", name: "Parking", displayOrder: 0, archivedAt: null }] })
    const db = setupGuard({ event: { findFirst } })
    const res = await GET(makeRequest("/api/admin/events/evt-a/export/attendance?secteur=sec-b"), params("evt-a"))
    expect(res.status).toBe(200)
    const dataRead = findFirst.mock.calls.map((c) => c[0]).find((a) => "title" in a.select)!
    expect((dataRead.select.registrations as { where: unknown }).where).toEqual({ status: "active" })
    expect(db.shift.findMany).not.toHaveBeenCalled()
    expect(prismaMock.event.findFirst).not.toHaveBeenCalled()
  })
})

// ── Sector audience of the messages (#1170) ──────────────────────────────────

describe("Sector-targeted messages — cross-tenant isolation (#1170)", () => {
  beforeEach(() => vi.clearAllMocks())

  it("POST /api/admin/events/[id]/message with a sector audience returns 404 for an org-B event, reading no sector and sending nothing", async () => {
    const { POST } = await import("@/app/api/admin/events/[id]/message/route")
    const db = setupGuard() // event.findFirst → null
    const res = await POST(makeRequest("/api/admin/events/evt-b/message", "POST", { audience: { kind: "sector", sectorId: "sec-b" }, subject: "Hi", message: "Hello" }), params("evt-b"))
    expect(res.status).toBe(404)
    expect(db.shift.findMany).not.toHaveBeenCalled()
    expect(db.registration.findMany).not.toHaveBeenCalled()
    expect(prismaMock.notificationOutbox.createMany).not.toHaveBeenCalled()
  })

  it("POST /api/admin/events/[id]/message refuses an org-B sector on an org-A event like an unknown one (400), reading no registration", async () => {
    const { POST } = await import("@/app/api/admin/events/[id]/message/route")
    const findFirst = vi.fn(async (args: { select: Record<string, unknown> }) =>
      "sectorsAdoptedAt" in args.select
        ? { sectorsEnabled: true, sectorsAdoptedAt: new Date("2026-10-01"), sectors: [{ id: "sec-a", name: "Parking", displayOrder: 0, archivedAt: null }] }
        : { id: "evt-a", title: "A", slug: "a", organizationId: ORG_A, organization: { name: "Org A", slug: "org-a" } })
    const db = setupGuard({ event: { findFirst } })
    const res = await POST(makeRequest("/api/admin/events/evt-a/message", "POST", { audience: { kind: "sector", sectorId: "sec-b" }, subject: "Hi", message: "Hello" }), params("evt-a"))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe("Secteur introuvable dans cet événement.")
    expect(db.registration.findMany).not.toHaveBeenCalled()
    expect(prismaMock.notificationOutbox.createMany).not.toHaveBeenCalled()
  })

  it("POST /api/admin/events/[id]/scheduled-messages with a sector audience returns 404 for an org-B event, storing nothing", async () => {
    const { POST } = await import("@/app/api/admin/events/[id]/scheduled-messages/route")
    const create = vi.fn()
    const db = { ...mockScopedDb(), scheduledMessage: { create } }
    requireOrgSessionMock.mockResolvedValue({ db, organizationId: ORG_A, session: SESSION_A })
    const res = await POST(makeRequest("/api/admin/events/evt-b/scheduled-messages", "POST", { audience: { kind: "sector", sectorId: "sec-b" }, subject: "Hi", message: "Hello", date: "2099-01-01", time: "10:00" }), params("evt-b"))
    expect(res.status).toBe(404)
    expect(create).not.toHaveBeenCalled()
    expect(db.shift.findMany).not.toHaveBeenCalled()
  })
})

describe("Shift swaps — cross-tenant isolation (#1174)", () => {
  beforeEach(() => vi.clearAllMocks())
  const swapParams = (id: string, requestId: string) => ({ params: Promise.resolve({ id, requestId }) })

  it("GET /api/admin/events/[id]/swaps returns 404 for an org-B event and reads no request", async () => {
    const { GET } = await import("@/app/api/admin/events/[id]/swaps/route")
    const db = setupGuard()
    const extra = { shiftSwapRequest: { findMany: vi.fn().mockResolvedValue([]) } }
    Object.assign(db, extra)
    expect((await GET(makeRequest("/api/admin/events/evt-b/swaps"), params("evt-b"))).status).toBe(404)
    expect(extra.shiftSwapRequest.findMany).not.toHaveBeenCalled()
  })

  it("POST /api/admin/events/[id]/swaps/[requestId] returns 404 for an org-B request and decides nothing", async () => {
    const { POST } = await import("@/app/api/admin/events/[id]/swaps/[requestId]/route")
    const { decideSwap } = await import("@/lib/shift-swap-server")
    const db = setupGuard()
    const extra = { shiftSwapRequest: { findFirst: vi.fn().mockResolvedValue(null) } }
    Object.assign(db, extra)
    const res = await POST(makeRequest("/api/admin/events/evt-b/swaps/swap-b", "POST", { approve: true, revision: 1 }), swapParams("evt-b", "swap-b"))
    expect(res.status).toBe(404)
    expect(extra.shiftSwapRequest.findFirst).toHaveBeenCalledWith({ where: { id: "swap-b", eventId: "evt-b" }, select: { id: true } })
    expect(decideSwap).not.toHaveBeenCalled()
  })

  it("POST /api/admin/events/[id]/swaps/[requestId] decides with the caller's organisation only", async () => {
    const { POST } = await import("@/app/api/admin/events/[id]/swaps/[requestId]/route")
    const { decideSwap } = await import("@/lib/shift-swap-server")
    vi.mocked(decideSwap).mockResolvedValue({ ok: true, requestId: "swap-a", status: "applied" })
    const db = setupGuard()
    Object.assign(db, { shiftSwapRequest: { findFirst: vi.fn().mockResolvedValue({ id: "swap-a" }) } })
    const res = await POST(makeRequest("/api/admin/events/evt-a/swaps/swap-a", "POST", { approve: true, revision: 2 }), swapParams("evt-a", "swap-a"))
    expect(res.status).toBe(200)
    expect(decideSwap).toHaveBeenCalledWith(db, expect.objectContaining({ organizationId: ORG_A, requestId: "swap-a", approve: true, revision: 2 }))
  })

  it("POST /api/admin/events/[id]/swaps/[requestId] passes the availability acknowledgements (#1146, lot B) with the caller's organisation, and relays a refusal", async () => {
    const { POST } = await import("@/app/api/admin/events/[id]/swaps/[requestId]/route")
    const { decideSwap } = await import("@/lib/shift-swap-server")
    const outside = [{ volunteerId: "vol-a", shiftId: "shift-a", name: "Bar", key: "k", state: "outside" as const, detail: "", label: "Pas disponible à ces heures" }]
    vi.mocked(decideSwap).mockResolvedValue({ ok: false, httpStatus: 409, error: "Refus", status: "approval", code: "availability", outside })
    const db = setupGuard()
    Object.assign(db, { shiftSwapRequest: { findFirst: vi.fn().mockResolvedValue({ id: "swap-a" }) } })
    const res = await POST(makeRequest("/api/admin/events/evt-a/swaps/swap-a", "POST", { approve: true, revision: 2, availabilityAck: ["k"] }), swapParams("evt-a", "swap-a"))
    expect(res.status).toBe(409)
    expect(await res.json()).toMatchObject({ code: "availability", status: "approval", outside })
    expect(decideSwap).toHaveBeenCalledWith(db, expect.objectContaining({ organizationId: ORG_A, availabilityAck: ["k"] }))
    // More than one acknowledgement per person is refused before anything is read.
    const tooMany = await POST(makeRequest("/api/admin/events/evt-a/swaps/swap-a", "POST", { approve: true, revision: 2, availabilityAck: ["a", "b", "c"] }), swapParams("evt-a", "swap-a"))
    expect(tooMany.status).toBe(400)
  })

  it("PUT /api/admin/events/[id]/swaps/mode returns 404 for an org-B event: the row lock filters on the organisation", async () => {
    const { PUT } = await import("@/app/api/admin/events/[id]/swaps/mode/route")
    const db = setupGuard()
    const tx = { $queryRaw: vi.fn().mockResolvedValue([]), event: { update: vi.fn() } }
    Object.assign(db, { $transaction: vi.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)) })
    const res = await PUT(makeRequest("/api/admin/events/evt-b/swaps/mode", "PUT", { enabled: false }), params("evt-b"))
    expect(res.status).toBe(404)
    expect(String(tx.$queryRaw.mock.calls[0][0].join("?"))).toContain('"organizationId" =')
    expect(tx.$queryRaw.mock.calls[0]).toContain(ORG_A)
    expect(tx.event.update).not.toHaveBeenCalled()
  })
})

describe("Dated availability — cross-tenant isolation (#1146)", () => {
  beforeEach(() => vi.clearAllMocks())
  const personParams = (id: string, volunteerId: string) => ({ params: Promise.resolve({ id, volunteerId }) })
  const withTx = (db: ReturnType<typeof setupGuard>, tx: Record<string, unknown>) => Object.assign(db, { $transaction: vi.fn(async (fn: (t: unknown) => unknown) => fn(tx)) })

  it("GET /api/admin/events/[id]/availability returns 404 for an org-B event and reads no answer", async () => {
    const { GET } = await import("@/app/api/admin/events/[id]/availability/route")
    const db = setupGuard()
    const extra = { availabilityRequest: { findMany: vi.fn().mockResolvedValue([]) } }
    Object.assign(db, extra)
    expect((await GET(makeRequest("/api/admin/events/evt-b/availability"), params("evt-b"))).status).toBe(404)
    expect(db.event.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "evt-b" } }))
    expect(extra.availabilityRequest.findMany).not.toHaveBeenCalled()
  })

  it("POST /api/admin/events/[id]/availability returns 404 for an org-B event and creates no link", async () => {
    const { POST } = await import("@/app/api/admin/events/[id]/availability/route")
    const db = setupGuard()
    const tx = { $queryRaw: vi.fn().mockResolvedValue([]), availabilityRequest: { create: vi.fn(), findMany: vi.fn() } }
    withTx(db, tx)
    const res = await POST(makeRequest("/api/admin/events/evt-b/availability", "POST", { volunteerIds: ["vol-b"] }), params("evt-b"))
    expect(res.status).toBe(404)
    expect(tx.availabilityRequest.create).not.toHaveBeenCalled()
  })

  it("POST /api/admin/events/[id]/availability/remind returns 404 for an org-B event and emails nobody", async () => {
    const { POST } = await import("@/app/api/admin/events/[id]/availability/remind/route")
    const db = setupGuard()
    const tx = { $queryRaw: vi.fn().mockResolvedValue([]), availabilityRequest: { findMany: vi.fn() } }
    withTx(db, tx)
    expect((await POST(makeRequest("/api/admin/events/evt-b/availability/remind", "POST"), params("evt-b"))).status).toBe(404)
    expect(tx.availabilityRequest.findMany).not.toHaveBeenCalled()
  })

  it("PUT /api/admin/events/[id]/availability/mode returns 404 for an org-B event: the row lock filters on the organisation", async () => {
    const { PUT } = await import("@/app/api/admin/events/[id]/availability/mode/route")
    const db = setupGuard()
    const tx = { $queryRaw: vi.fn().mockResolvedValue([]), event: { update: vi.fn() }, availabilityRequest: { updateMany: vi.fn() } }
    withTx(db, tx)
    const res = await PUT(makeRequest("/api/admin/events/evt-b/availability/mode", "PUT", { enabled: false, confirm: true }), params("evt-b"))
    expect(res.status).toBe(404)
    expect(String(tx.$queryRaw.mock.calls[0][0].join("?"))).toContain('"organizationId" =')
    expect(tx.$queryRaw.mock.calls[0]).toContain(ORG_A)
    expect(tx.event.update).not.toHaveBeenCalled()
    expect(tx.availabilityRequest.updateMany).not.toHaveBeenCalled()
  })

  it("GET and PUT /api/admin/events/[id]/availability/[volunteerId] return 404 for an org-B event or person, and write nothing", async () => {
    const route = await import("@/app/api/admin/events/[id]/availability/[volunteerId]/route")
    const db = setupGuard()
    const tx = { $queryRaw: vi.fn(), availabilityDay: { create: vi.fn() } }
    const scoped = withTx(db, tx)
    expect((await route.GET(makeRequest("/api/admin/events/evt-b/availability/vol-b"), personParams("evt-b", "vol-b"))).status).toBe(404)
    const res = await route.PUT(makeRequest("/api/admin/events/evt-b/availability/vol-b", "PUT", { days: [{ date: "2030-06-01", ranges: [] }] }), personParams("evt-b", "vol-b"))
    expect(res.status).toBe(404)
    expect(scoped.$transaction).not.toHaveBeenCalled()
    expect(tx.availabilityDay.create).not.toHaveBeenCalled()
  })
})

describe("Assisted manual assignment — cross-tenant isolation (#1146, lot B)", () => {
  beforeEach(() => vi.clearAllMocks())

  it("GET /api/admin/events/[id]/availability/fit returns 404 for an org-B event or person and reads no answer", async () => {
    const { GET } = await import("@/app/api/admin/events/[id]/availability/fit/route")
    const db = setupGuard()
    const extra = { availabilityRequest: { findFirst: vi.fn().mockResolvedValue(null) } }
    Object.assign(db, extra)
    const res = await GET(makeRequest("/api/admin/events/evt-b/availability/fit?volunteerId=vol-b&shiftId=shift-b"), params("evt-b"))
    expect(res.status).toBe(404)
    expect(db.event.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "evt-b" } }))
    expect(extra.availabilityRequest.findFirst).not.toHaveBeenCalled()
  })
})

describe("Workload protection — cross-tenant isolation (#1171)", () => {
  beforeEach(() => vi.clearAllMocks())

  it("GET /api/admin/events/[id]/workload-policy returns 404 for an org-B event and scans no registration", async () => {
    const { GET } = await import("@/app/api/admin/events/[id]/workload-policy/route")
    const db = setupGuard()
    expect((await GET(makeRequest("/api/admin/events/evt-b/workload-policy"), params("evt-b"))).status).toBe(404)
    expect(db.event.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "evt-b" } }))
    expect(db.registration.findMany).not.toHaveBeenCalled()
  })

  it("PUT /api/admin/events/[id]/workload-policy returns 404 for an org-B event: read through the organisation's client, nothing written", async () => {
    const { PUT } = await import("@/app/api/admin/events/[id]/workload-policy/route")
    const db = setupGuard()
    const tx = { $executeRaw: vi.fn(), event: { findFirst: vi.fn().mockResolvedValue(null), update: vi.fn() }, registration: { findMany: vi.fn() } }
    Object.assign(db, { $transaction: vi.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)) })
    const res = await PUT(makeRequest("/api/admin/events/evt-b/workload-policy", "PUT", { enabled: false }), params("evt-b"))
    expect(res.status).toBe(404)
    expect(tx.event.update).not.toHaveBeenCalled()
    expect(tx.registration.findMany).not.toHaveBeenCalled()
  })

  it("POST /api/admin/events/[id]/workload-policy/preview returns 404 for an org-B event and scans no registration", async () => {
    const { POST } = await import("@/app/api/admin/events/[id]/workload-policy/preview/route")
    const db = setupGuard()
    const values = { serviceDayStart: "08:00", maxContinuousMinutes: 360, minBreakMinutes: 30, maxDailyMinutes: 600, maxEventMinutes: 2400, minRestMinutes: 600, maxIdleGapMinutes: 120 }
    expect((await POST(makeRequest("/api/admin/events/evt-b/workload-policy/preview", "POST", { values }), params("evt-b"))).status).toBe(404)
    expect(db.registration.findMany).not.toHaveBeenCalled()
  })
})

// ── Places of an event (#1171, lot 2) ────────────────────────────────────────

describe("Places — cross-tenant isolation (#1171)", () => {
  beforeEach(() => vi.clearAllMocks())
  const placeParams = (id: string, placeId: string) => ({ params: Promise.resolve({ id, placeId }) })
  const placeDb = (event: unknown = null, places: unknown[] = []) => {
    const db = setupGuard({ event: { findFirst: vi.fn().mockResolvedValue(event) } })
    const extra = { eventPlace: { findMany: vi.fn().mockResolvedValue(places), create: vi.fn(), update: vi.fn() } }
    Object.assign(db, extra)
    return db as typeof db & typeof extra
  }

  it("GET and POST /api/admin/events/[id]/places return 404 for an org-B event and write nothing", async () => {
    const { GET, POST } = await import("@/app/api/admin/events/[id]/places/route")
    const db = placeDb()
    expect((await GET(makeRequest("/api/admin/events/evt-b/places"), params("evt-b"))).status).toBe(404)
    expect((await POST(makeRequest("/api/admin/events/evt-b/places", "POST", { name: "Grande Scène" }), params("evt-b"))).status).toBe(404)
    expect(db.eventPlace.findMany).not.toHaveBeenCalled()
    expect(db.eventPlace.create).not.toHaveBeenCalled()
  })

  it("PATCH places/[placeId] returns 404 for an org-B event, and for a place that is not the event's", async () => {
    const one = await import("@/app/api/admin/events/[id]/places/[placeId]/route")
    const db = placeDb()
    expect((await one.PATCH(makeRequest("/api/admin/events/evt-b/places/pl-b", "PATCH", { name: "X" }), placeParams("evt-b", "pl-b"))).status).toBe(404)
    expect(db.eventPlace.update).not.toHaveBeenCalled()
    // An event of org A, but a place id from elsewhere: the event's list does not have it.
    const own = placeDb({ id: "evt-a" }, [{ id: "pl-a", name: "Chapiteau", displayOrder: 0, archivedAt: null }])
    expect((await one.PATCH(makeRequest("/api/admin/events/evt-a/places/pl-b", "PATCH", { archived: true }), placeParams("evt-a", "pl-b"))).status).toBe(404)
    expect(own.eventPlace.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { eventId: "evt-a" } }))
    expect(own.eventPlace.update).not.toHaveBeenCalled()
  })
})

// ── Personal workload limits (#1171, lot 2) ──────────────────────────────────

describe("Personal workload limits — cross-tenant isolation (#1171)", () => {
  beforeEach(() => vi.clearAllMocks())
  const limitParams = (id: string, volunteerId: string) => ({ params: Promise.resolve({ id, volunteerId }) })

  it("GET workload-limits and PUT/DELETE workload-limits/[volunteerId] return 404 for an org-B event, and for a member of another organisation", async () => {
    const list = await import("@/app/api/admin/events/[id]/workload-limits/route")
    const one = await import("@/app/api/admin/events/[id]/workload-limits/[volunteerId]/route")
    const db = setupGuard({ event: { findFirst: vi.fn().mockResolvedValue(null) }, volunteer: { findFirst: vi.fn().mockResolvedValue(null) } })
    const extra = { eventVolunteerLimit: { findMany: vi.fn(), upsert: vi.fn(), deleteMany: vi.fn() }, $transaction: vi.fn() }
    Object.assign(db, extra)
    expect((await list.GET(makeRequest("/api/admin/events/evt-b/workload-limits"), params("evt-b"))).status).toBe(404)
    expect((await one.PUT(makeRequest("/api/admin/events/evt-b/workload-limits/vol-b", "PUT", { limits: { maxDailyMinutes: 300 } }), limitParams("evt-b", "vol-b"))).status).toBe(404)
    expect((await one.DELETE(makeRequest("/api/admin/events/evt-b/workload-limits/vol-b", "DELETE"), limitParams("evt-b", "vol-b"))).status).toBe(404)
    // An org-A event, but a member the scoped client does not find (another organisation's).
    ;(db as unknown as { event: { findFirst: ReturnType<typeof vi.fn> } }).event.findFirst.mockResolvedValue({ id: "evt-a" })
    expect((await one.PUT(makeRequest("/api/admin/events/evt-a/workload-limits/vol-b", "PUT", { limits: { maxDailyMinutes: 300 } }), limitParams("evt-a", "vol-b"))).status).toBe(404)
    expect(extra.$transaction).not.toHaveBeenCalled()
    expect(extra.eventVolunteerLimit.upsert).not.toHaveBeenCalled()
  })
})

describe("Draft assignments and their publication — cross-tenant isolation (#1146, lot C)", () => {
  beforeEach(() => vi.clearAllMocks())

  /** The scoped db of org A, which sees no org-B row, with the transaction and draft delegates. */
  function draftsDb() {
    const db = setupGuard() as ReturnType<typeof setupGuard> & Record<string, unknown>
    const writes = {
      draftCreate: vi.fn(), draftUpdate: vi.fn(), registrationCreate: vi.fn(), requestUpdate: vi.fn(),
    }
    Object.assign(db, {
      $transaction: async (fn: (tx: unknown) => unknown) => fn(db),
      $queryRaw: vi.fn().mockResolvedValue([]),
      $executeRaw: vi.fn().mockResolvedValue(0),
      draftAssignment: { findFirst: vi.fn().mockResolvedValue(null), findMany: vi.fn().mockResolvedValue([]), count: vi.fn().mockResolvedValue(0), create: writes.draftCreate, updateMany: writes.draftUpdate },
      draftPublication: { findFirst: vi.fn().mockResolvedValue(null), updateMany: vi.fn() },
      availabilityRequest: { findFirst: vi.fn().mockResolvedValue(null), findMany: vi.fn().mockResolvedValue([]), updateMany: writes.requestUpdate },
      adminUser: { findFirst: vi.fn().mockResolvedValue(null) },
    })
    ;(db.registration as Record<string, unknown>).create = writes.registrationCreate
    return { db, writes }
  }
  const p2 = (id: string, draftId: string) => ({ params: Promise.resolve({ id, draftId }) })

  it("POST /api/admin/events/[id]/drafts returns 404 for an org-B event and creates nothing", async () => {
    const { POST } = await import("@/app/api/admin/events/[id]/drafts/route")
    const { db, writes } = draftsDb()
    const res = await POST(makeRequest("/api/admin/events/evt-b/drafts", "POST", { shiftId: "shift-b", volunteerId: "vol-b" }), params("evt-b"))
    expect(res.status).toBe(404)
    expect(db.event.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "evt-b" } }))
    expect(writes.draftCreate).not.toHaveBeenCalled()
  })

  it("GET /api/admin/events/[id]/drafts/options returns 404 for an org-B event and reads no draft", async () => {
    const { GET } = await import("@/app/api/admin/events/[id]/drafts/options/route")
    const { db } = draftsDb()
    const res = await GET(makeRequest("/api/admin/events/evt-b/drafts/options?volunteerId=vol-b&date=2031-07-11"), params("evt-b"))
    expect(res.status).toBe(404)
    expect((db.draftAssignment as { findMany: ReturnType<typeof vi.fn> }).findMany).not.toHaveBeenCalled()
  })

  it("PATCH and DELETE /api/admin/events/[id]/drafts/[draftId] return 404 for an org-B event and write nothing", async () => {
    const { PATCH, DELETE } = await import("@/app/api/admin/events/[id]/drafts/[draftId]/route")
    const { writes } = draftsDb()
    expect((await PATCH(makeRequest("/api/admin/events/evt-b/drafts/d-b", "PATCH", { revision: 1 }), p2("evt-b", "d-b"))).status).toBe(404)
    expect((await DELETE(makeRequest("/api/admin/events/evt-b/drafts/d-b?revision=1", "DELETE"), p2("evt-b", "d-b"))).status).toBe(404)
    expect(writes.draftUpdate).not.toHaveBeenCalled()
  })

  it("POST /api/admin/events/[id]/drafts/publish returns 404 for an org-B event and registers nobody", async () => {
    const { POST } = await import("@/app/api/admin/events/[id]/drafts/publish/route")
    const { writes } = draftsDb()
    const res = await POST(makeRequest("/api/admin/events/evt-b/drafts/publish", "POST", { selection: [{ id: "d-b", revision: 1 }], idempotencyKey: "key-12345678" }), params("evt-b"))
    expect(res.status).toBe(404)
    expect(writes.registrationCreate).not.toHaveBeenCalled()
    expect(prismaMock.registration.create).not.toHaveBeenCalled()
  })

  it("POST /api/admin/events/[id]/availability/[volunteerId]/review returns 404 for an org-B answer and clears nothing", async () => {
    const { POST } = await import("@/app/api/admin/events/[id]/availability/[volunteerId]/review/route")
    const { writes } = draftsDb()
    const res = await POST(makeRequest("/api/admin/events/evt-b/availability/vol-b/review", "POST", { revision: 2 }), { params: Promise.resolve({ id: "evt-b", volunteerId: "vol-b" }) })
    expect(res.status).toBe(404)
    expect(writes.requestUpdate).not.toHaveBeenCalled()
  })
})

describe("Generated assignment proposals — cross-tenant isolation (#1172)", () => {
  beforeEach(() => vi.clearAllMocks())

  /** The scoped db of org A, which sees no org-B row, with the run, target and draft delegates. */
  function proposalsDb() {
    const db = setupGuard() as ReturnType<typeof setupGuard> & Record<string, unknown>
    const writes = { runCreate: vi.fn(), runUpdate: vi.fn(), targetCreate: vi.fn(), targetUpdate: vi.fn(), draftUpdate: vi.fn(), draftCreate: vi.fn() }
    Object.assign(db, {
      $transaction: async (fn: (tx: unknown) => unknown) => fn(db),
      $queryRaw: vi.fn().mockResolvedValue([]),
      $executeRaw: vi.fn().mockResolvedValue(0),
      proposalRun: { findFirst: vi.fn().mockResolvedValue(null), findMany: vi.fn().mockResolvedValue([]), count: vi.fn().mockResolvedValue(0), create: writes.runCreate, updateMany: writes.runUpdate },
      eventVolunteerTarget: { findMany: vi.fn().mockResolvedValue([]), create: writes.targetCreate, updateMany: writes.targetUpdate, deleteMany: writes.targetUpdate },
      draftAssignment: { findFirst: vi.fn().mockResolvedValue(null), findMany: vi.fn().mockResolvedValue([]), updateMany: writes.draftUpdate, create: writes.draftCreate },
    })
    return { db, writes }
  }
  const run = (id: string, runId: string) => ({ params: Promise.resolve({ id, runId }) })
  const config = { scope: { shiftIds: ["shift-b"], volunteerIds: ["vol-b"] }, rotation: { maxConsecutiveDays: 2, maxNightAddOns: 2 }, seed: 1 }

  it("GET and POST /api/admin/events/[id]/proposals return 404 for an org-B event and launch nothing", async () => {
    const { GET, POST } = await import("@/app/api/admin/events/[id]/proposals/route")
    const { db, writes } = proposalsDb()
    expect((await GET(makeRequest("/api/admin/events/evt-b/proposals"), params("evt-b"))).status).toBe(404)
    expect((await POST(makeRequest("/api/admin/events/evt-b/proposals", "POST", { idempotencyKey: "key-12345678", configuration: config }), params("evt-b"))).status).toBe(404)
    // « Proposer une autre répartition » names a run, never a configuration: still the event first.
    expect((await POST(makeRequest("/api/admin/events/evt-b/proposals", "POST", { idempotencyKey: "key-12345678", anotherOf: "run-b" }), params("evt-b"))).status).toBe(404)
    expect(db.event.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "evt-b" } }))
    expect(writes.runCreate).not.toHaveBeenCalled()
    expect((db.proposalRun as { findMany: ReturnType<typeof vi.fn> }).findMany).not.toHaveBeenCalled()
  })

  it("GET …/proposals/[runId], POST …/cancel and …/write return 404 for an org-B event and change nothing", async () => {
    const one = await import("@/app/api/admin/events/[id]/proposals/[runId]/route")
    const cancel = await import("@/app/api/admin/events/[id]/proposals/[runId]/cancel/route")
    const write = await import("@/app/api/admin/events/[id]/proposals/[runId]/write/route")
    const { writes } = proposalsDb()
    expect((await one.GET(makeRequest("/api/admin/events/evt-b/proposals/run-b"), run("evt-b", "run-b"))).status).toBe(404)
    expect((await cancel.POST(makeRequest("/api/admin/events/evt-b/proposals/run-b/cancel", "POST"), run("evt-b", "run-b"))).status).toBe(404)
    expect((await write.POST(makeRequest("/api/admin/events/evt-b/proposals/run-b/write", "POST"), run("evt-b", "run-b"))).status).toBe(404)
    expect(writes.runUpdate).not.toHaveBeenCalled()
    expect(writes.draftCreate).not.toHaveBeenCalled()
  })

  it("an org-A event with an org-B run id finds no run and writes nothing", async () => {
    const one = await import("@/app/api/admin/events/[id]/proposals/[runId]/route")
    const cancel = await import("@/app/api/admin/events/[id]/proposals/[runId]/cancel/route")
    const { db, writes } = proposalsDb()
    ;(db.event.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "evt-a", availabilityEnabled: true, availabilityAdoptedAt: new Date() })
    ;(db.proposalRun as { count: ReturnType<typeof vi.fn> }).count.mockResolvedValue(1) // adopted: no beta check
    expect((await one.GET(makeRequest("/api/admin/events/evt-a/proposals/run-b"), run("evt-a", "run-b"))).status).toBe(404)
    expect((await cancel.POST(makeRequest("/api/admin/events/evt-a/proposals/run-b/cancel", "POST"), run("evt-a", "run-b"))).status).toBe(404)
    expect((db.proposalRun as { findFirst: ReturnType<typeof vi.fn> }).findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "run-b", eventId: "evt-a" } }))
    // Another assignment from an org-B run id: the source is looked up within the org-A event, not found, nothing launched.
    const list = await import("@/app/api/admin/events/[id]/proposals/route")
    ;(db.proposalRun as { findFirst: ReturnType<typeof vi.fn> }).findFirst.mockClear()
    expect((await list.POST(makeRequest("/api/admin/events/evt-a/proposals", "POST", { idempotencyKey: "key-12345678", anotherOf: "run-b" }), params("evt-a"))).status).toBe(404)
    expect((db.proposalRun as { findFirst: ReturnType<typeof vi.fn> }).findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "run-b", eventId: "evt-a" } }))
    expect(writes.runCreate).not.toHaveBeenCalled()
    expect(writes.runUpdate).not.toHaveBeenCalled()
  })

  it("GET and PUT /api/admin/events/[id]/proposal-targets return 404 for an org-B event and save nothing", async () => {
    const { GET, PUT } = await import("@/app/api/admin/events/[id]/proposal-targets/route")
    const { writes } = proposalsDb()
    expect((await GET(makeRequest("/api/admin/events/evt-b/proposal-targets"), params("evt-b"))).status).toBe(404)
    expect((await PUT(makeRequest("/api/admin/events/evt-b/proposal-targets", "PUT", { targets: [{ volunteerId: "vol-b", targetMinutes: 600 }] }), params("evt-b"))).status).toBe(404)
    expect(writes.targetCreate).not.toHaveBeenCalled()
    expect(writes.targetUpdate).not.toHaveBeenCalled()
  })

  it("an org-A event refuses a target for an org-B member", async () => {
    const { PUT } = await import("@/app/api/admin/events/[id]/proposal-targets/route")
    const { db, writes } = proposalsDb()
    ;(db.event.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "evt-a", availabilityEnabled: true, availabilityAdoptedAt: new Date() })
    ;(db.proposalRun as { count: ReturnType<typeof vi.fn> }).count.mockResolvedValue(1)
    const res = await PUT(makeRequest("/api/admin/events/evt-a/proposal-targets", "PUT", { targets: [{ volunteerId: "vol-b", targetMinutes: 600 }] }), params("evt-a"))
    expect(res.status).toBe(404)
    expect(db.volunteer.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ id: { in: ["vol-b"] }, organizationId: ORG_A }) }))
    expect(writes.targetCreate).not.toHaveBeenCalled()
  })

  it("POST /api/admin/events/[id]/drafts/[draftId]/lock returns 404 for an org-B event and locks nothing", async () => {
    const { POST } = await import("@/app/api/admin/events/[id]/drafts/[draftId]/lock/route")
    const { writes } = proposalsDb()
    const res = await POST(makeRequest("/api/admin/events/evt-b/drafts/d-b/lock", "POST", { revision: 1, locked: true }), { params: Promise.resolve({ id: "evt-b", draftId: "d-b" }) })
    expect(res.status).toBe(404)
    expect(writes.draftUpdate).not.toHaveBeenCalled()
  })
})
