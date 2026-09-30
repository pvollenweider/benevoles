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
  },
  adminUser: {
    findUnique: vi.fn().mockResolvedValue(null),
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
    create: vi.fn().mockResolvedValue({ id: "row-1" }),
    createMany: vi.fn().mockResolvedValue({ count: 1 }),
    findUniqueOrThrow: vi.fn().mockResolvedValue({ id: "row-1" }),
  },
  async $transaction(fn: (tx: unknown) => unknown) { return fn(this) },
}
vi.mock("@/lib/push", () => ({ pushDeviceCount: vi.fn().mockResolvedValue(0), sendTargetedPush: vi.fn() }))
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }))

vi.mock("@/lib/notifications", () => ({
  sendNotification: vi.fn().mockResolvedValue({ ok: true }),
}))
vi.mock("@/lib/email", () => ({
  sendMemberInvite: vi.fn().mockResolvedValue(undefined),
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

  it("POST /api/admin/settings/notifications/[id]/retry returns 404 for an org-B outbox row (#382)", async () => {
    const { POST } = await import("@/app/api/admin/settings/notifications/[id]/retry/route")
    setupGuard()
    const res = await POST(makeRequest("/api/admin/settings/notifications/out-b/retry", "POST"), params("out-b"))
    expect(res.status).toBe(404)
    // The organization filter is in the update itself: an org-B row can never flip.
    expect(prismaMock.notificationOutbox.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "out-b", organizationId: ORG_A, status: "failed" } }))
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

  it("GET /api/admin/members/export reads members through the scoped client only (#384)", async () => {
    const { GET } = await import("@/app/api/admin/members/export/route")
    const db = setupGuard({ volunteer: { findMany: vi.fn().mockResolvedValue([]) } })
    const res = await GET()
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
  })

  it("GET /api/admin/events/[id]/invitations returns 404 for org-B event", async () => {
    const { GET } = await import("@/app/api/admin/events/[id]/invitations/route")
    setupGuard()

    const res = await GET(makeRequest("/api/admin/events/evt-b/invitations"), params("evt-b"))
    expect(res.status).toBe(404)
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
