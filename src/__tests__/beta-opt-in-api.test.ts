/**
 * « Essayer les fonctions avancées en bêta » (#1168): PUT /api/admin/settings/organization/beta.
 * Runs the real owner guard (src/lib/auth-guard.ts) on an in-memory organisation; any other model
 * the route touched (events, shifts, registrations, emails) would be recorded.
 */
import { describe, it, expect, vi, beforeEach } from "vitest"

const m = vi.hoisted(() => ({
  auth: vi.fn(),
  open: [] as string[],
  org: null as null | { id: string; active: boolean; betaOptInAt: Date | null; betaOptInById: string | null },
  orgLogCreate: vi.fn(),
  otherModels: vi.fn(),
}))

vi.mock("@/auth", () => ({ auth: m.auth }))
vi.mock("@/lib/beta-access", () => ({ readOpenBetaCapabilities: vi.fn(async () => m.open) }))
vi.mock("@/lib/prisma", () => {
  type Where = { id: string; betaOptInAt?: null | { not: null } }
  const organization = {
    findUnique: vi.fn(async ({ where }: { where: { id: string } }) => (m.org && m.org.id === where.id ? { ...m.org } : null)),
    updateMany: vi.fn(async ({ where, data }: { where: Where; data: Partial<NonNullable<typeof m.org>> }) => {
      if (!m.org || m.org.id !== where.id) return { count: 0 }
      if (where.betaOptInAt === null && m.org.betaOptInAt !== null) return { count: 0 }
      if (where.betaOptInAt && m.org.betaOptInAt === null) return { count: 0 }
      m.org = { ...m.org, ...data }
      return { count: 1 }
    }),
  }
  const known = { organization, orgLog: { create: m.orgLogCreate } }
  return {
    prisma: new Proxy(known, {
      get: (target, model: string) => (model in target ? target[model as keyof typeof target] : new Proxy({}, { get: (_m, op) => (...args: unknown[]) => { m.otherModels(model, op, args); return Promise.resolve(null) } })),
    }),
  }
})
vi.mock("@/lib/prisma-org", () => ({ getOrgClient: () => ({ adminUser: { findFirst: async () => ({ name: "Paula Propriétaire" }) } }) }))

const owner = { user: { id: "adm-owner", email: "p@x.ch", role: "admin", organizationId: "org-a" } }
const organizer = { user: { id: "adm-org", email: "o@x.ch", role: "organizer", organizationId: "org-a" } }

const put = (body: unknown) => new Request("http://localhost/api/admin/settings/organization/beta", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })

async function route() {
  return (await import("@/app/api/admin/settings/organization/beta/route")).PUT
}

beforeEach(() => {
  vi.clearAllMocks()
  m.open = ["sectors"]
  m.org = { id: "org-a", active: true, betaOptInAt: null, betaOptInById: null }
  m.auth.mockResolvedValue(owner)
  m.orgLogCreate.mockResolvedValue({ id: "log-1" })
})

describe("PUT /api/admin/settings/organization/beta (#1168)", () => {
  it("BE03: an organiser who is not an owner cannot opt in, and nothing is written", async () => {
    m.auth.mockResolvedValue(organizer)
    const res = await (await route())(put({ optIn: true }))
    expect(res.status).toBe(403)
    expect((await res.json()).error).toMatch(/propriétaires/)
    expect(m.org?.betaOptInAt).toBeNull()
    expect(m.orgLogCreate).not.toHaveBeenCalled()
  })

  it("an owner opts in: date and author stored, logged with the author", async () => {
    const res = await (await route())(put({ optIn: true }))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual(expect.objectContaining({ optedIn: true, optedInByName: "Paula Propriétaire" }))
    expect(m.org?.betaOptInAt).toBeInstanceOf(Date)
    expect(m.org?.betaOptInById).toBe("adm-owner")
    expect(m.orgLogCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ organizationId: "org-a", actorType: "admin", actorId: "adm-owner", action: "organization.beta_opted_in", entityType: "Organization" }),
    }))
  })

  it("BE02 / BE04: opting in touches no event, shift, registration or email", async () => {
    await (await route())(put({ optIn: true }))
    expect(m.otherModels).not.toHaveBeenCalled()
  })

  it("refuses to opt in when the operator opened nothing", async () => {
    m.open = []
    const res = await (await route())(put({ optIn: true }))
    expect(res.status).toBe(409)
    expect(m.org?.betaOptInAt).toBeNull()
    expect(m.orgLogCreate).not.toHaveBeenCalled()
  })

  it("BE06: an owner leaves even when everything was closed; logged, and nothing else touched", async () => {
    m.open = []
    m.org = { id: "org-a", active: true, betaOptInAt: new Date("2026-10-01T08:00:00Z"), betaOptInById: "adm-other" }
    const res = await (await route())(put({ optIn: false }))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ optedIn: false, optedInAt: null, optedInByName: null })
    expect(m.org?.betaOptInAt).toBeNull()
    expect(m.org?.betaOptInById).toBeNull()
    expect(m.orgLogCreate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ action: "organization.beta_opted_out", actorId: "adm-owner" }) }))
    expect(m.otherModels).not.toHaveBeenCalled()
  })

  it("asking for the current state again writes and logs nothing", async () => {
    const res = await (await route())(put({ optIn: false }))
    expect(res.status).toBe(200)
    expect(m.orgLogCreate).not.toHaveBeenCalled()
  })

  it("refuses a body without a yes or no", async () => {
    expect((await (await route())(put({ optIn: "oui" }))).status).toBe(400)
  })

  it("refuses an organisation deactivated since the session started", async () => {
    m.org = { id: "org-a", active: false, betaOptInAt: null, betaOptInById: null }
    expect((await (await route())(put({ optIn: true }))).status).toBe(403)
  })
})
