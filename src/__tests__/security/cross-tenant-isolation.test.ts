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
import { NextResponse } from "next/server"

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
    findFirst: vi.fn().mockResolvedValue({ id: "evt-b", organizationId: "org-b" }), // org-B data!
  },
  member: {
    update: vi.fn().mockResolvedValue({ id: "mem-b" }),
    findFirst: vi.fn().mockResolvedValue(null),
  },
  shift: {
    update: vi.fn().mockResolvedValue({ id: "shift-b", status: "open", capacity: 5 }),
    findFirst: vi.fn().mockResolvedValue(null),
  },
  registration: {
    update: vi.fn().mockResolvedValue({ id: "reg-b", shiftId: "shift-b", shift: { status: "open", capacity: 5 } }),
    create: vi.fn().mockResolvedValue({ id: "reg-new" }),
    count: vi.fn().mockResolvedValue(0),
    findFirst: vi.fn().mockResolvedValue(null),
  },
  volunteer: {
    findFirst: vi.fn().mockResolvedValue(null),
    create: vi.fn().mockResolvedValue({ id: "vol-1", email: "v@x.com", firstName: "V", lastName: "L" }),
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
}
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
      ...((overrides.event as object) ?? {}),
    },
    member: {
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({ id: "mem-a" }),
      count: vi.fn().mockResolvedValue(0),
      ...((overrides.member as object) ?? {}),
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
  })
})

// ── Members ───────────────────────────────────────────────────────────────────

describe("Members — cross-tenant isolation", () => {
  beforeEach(() => vi.clearAllMocks())

  it("GET /api/admin/members returns only org-A members", async () => {
    const { GET } = await import("@/app/api/admin/members/route")
    const db = setupGuard({
      member: { findMany: vi.fn().mockResolvedValue([{ id: "mem-a", organizationId: ORG_A, firstName: "Alice", lastName: "M", tags: [], active: true }]) },
    })

    const res = await GET(makeRequest("/api/admin/members"))
    expect(res.status).toBe(200)
    const body = await res.json()
    // All returned members belong to org-A (from mock)
    expect(Array.isArray(body)).toBe(true)
    expect((body as { organizationId: string }[]).every((m) => m.organizationId === ORG_A)).toBe(true)
    expect(db.member.findMany).toHaveBeenCalledOnce()
  })

  it("PATCH /api/admin/members/[id] returns 404 for org-B member (scoped db returns null)", async () => {
    const { PATCH } = await import("@/app/api/admin/members/[id]/route")
    setupGuard() // findFirst → null

    const res = await PATCH(
      makeRequest("/api/admin/members/mem-b", "PATCH", { firstName: "Hacked" }),
      params("mem-b"),
    )
    expect(res.status).toBe(404)
    expect(prismaMock.member.update).not.toHaveBeenCalled()
  })

  it("DELETE /api/admin/members/[id] returns 404 for org-B member", async () => {
    const { DELETE } = await import("@/app/api/admin/members/[id]/route")
    setupGuard()

    const res = await DELETE(makeRequest("/api/admin/members/mem-b", "DELETE"), params("mem-b"))
    expect(res.status).toBe(404)
    expect(prismaMock.member.update).not.toHaveBeenCalled()
  })

  it("PATCH does not bypass ownership check using raw prisma", async () => {
    const { PATCH } = await import("@/app/api/admin/members/[id]/route")
    setupGuard() // scoped db → null

    // Raw prisma has data — if route used raw prisma for check, it would patch
    prismaMock.member.findFirst.mockResolvedValue({ id: "mem-b", organizationId: "org-b" })

    const res = await PATCH(
      makeRequest("/api/admin/members/mem-b", "PATCH", { firstName: "Hacked" }),
      params("mem-b"),
    )
    expect(res.status).toBe(404)
    expect(prismaMock.member.update).not.toHaveBeenCalled()
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
      makeRequest("/api/admin/events/evt-b/invitations", "POST", { memberIds: ["mem-a"] }),
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
