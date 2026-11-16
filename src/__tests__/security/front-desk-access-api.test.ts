/**
 * Front-desk access, owner side (#1142): the routes that create, list, resend and revoke a
 * grant. The guards are the real ones (auth-guard, permissions), the org-scoped client is the
 * real extension (prisma-org) over an in-memory database. Only the session provider, the Prisma
 * client underneath, the sending functions and the rate limiter are replaced.
 */
import { describe, it, expect, vi, beforeEach } from "vitest"

const auth = vi.hoisted(() => vi.fn())
vi.mock("@/auth", () => ({ auth }))

type Row = Record<string, unknown>

const fake = vi.hoisted(() => {
  type R = Record<string, unknown>
  const state = {
    organizations: [] as R[], events: [] as R[], admins: [] as R[], grants: [] as R[],
    calls: [] as [string, string, unknown][],
    nextId: 1,
  }

  function matches(row: R | null | undefined, where: unknown): boolean {
    if (!where) return true
    if (!row) return false
    return Object.entries(where as R).every(([key, cond]) => {
      if (key === "AND") return (Array.isArray(cond) ? cond : [cond]).every((w) => matches(row, w))
      if (key === "OR") return (cond as unknown[]).some((w) => matches(row, w))
      if (key === "NOT") return !matches(row, cond)
      const value = row[key]
      if (cond === null) return value === null || value === undefined
      if (typeof cond === "object" && !(cond instanceof Date)) {
        const c = cond as R
        if ("in" in c) return (c.in as unknown[]).includes(value)
        if ("not" in c) return value !== c.not
        if ("equals" in c) {
          const eq = c.mode === "insensitive" ? String(value).toLowerCase() === String(c.equals).toLowerCase() : value === c.equals
          return eq
        }
        if ("gt" in c) return value instanceof Date && value.getTime() > (c.gt as Date).getTime()
        if ("lt" in c) return value instanceof Date && value.getTime() < (c.lt as Date).getTime()
        return typeof value === "object" && value !== null && matches(value as R, c)
      }
      return value === cond
    })
  }

  const org = (id: unknown) => state.organizations.find((o) => o.id === id) ?? null
  const eventView = (e: R | null) => (e ? { ...e, organization: org(e.organizationId) } : null)
  const adminView = (a: R) => ({ ...a, organization: org(a.organizationId) })
  const grantView = (g: R) => ({
    ...g,
    adminUser: state.admins.find((a) => a.id === g.adminUserId) ?? null,
    event: eventView(state.events.find((e) => e.id === g.eventId) ?? null),
  })

  const raw: Record<string, Record<string, (args: { where?: unknown; data?: R; select?: unknown }) => Promise<unknown>>> = {
    organization: {
      findUnique: async ({ where }) => {
        const found = org((where as R)?.id)
        return found ? { ...found } : null
      },
      findFirst: async () => state.organizations[0] ?? null,
    },
    event: {
      findFirst: async ({ where }) => {
        const e = state.events.find((row) => matches(eventView(row), where))
        return e ? eventView(e) : null
      },
    },
    adminUser: {
      findFirst: async ({ where }) => {
        const a = state.admins.find((row) => matches(adminView(row), where))
        return a ? adminView(a) : null
      },
      count: async ({ where }) => state.admins.filter((a) => matches(adminView(a), where)).length,
      create: async ({ data }) => {
        const admin = { id: `adm-${state.nextId++}`, sessionVersion: 0, createdAt: new Date(), ...data }
        state.admins.push(admin)
        return admin
      },
      update: async ({ where, data }) => {
        const admin = state.admins.find((a) => a.id === (where as R)?.id)
        if (!admin) throw new Error("adminUser.update: not found")
        for (const [key, value] of Object.entries(data ?? {})) {
          if (value && typeof value === "object" && "increment" in (value as object)) {
            admin[key] = Number(admin[key] ?? 0) + Number((value as { increment: number }).increment)
          } else admin[key] = value
        }
        return admin
      },
      updateMany: async ({ where, data }) => {
        const hits = state.admins.filter((a) => matches(adminView(a), where))
        for (const admin of hits) {
          for (const [key, value] of Object.entries(data ?? {})) {
            if (value && typeof value === "object" && "increment" in (value as object)) {
              admin[key] = Number(admin[key] ?? 0) + Number((value as { increment: number }).increment)
            } else admin[key] = value
          }
        }
        return { count: hits.length }
      },
    },
    adminEventAccess: {
      findUnique: async ({ where }) => {
        const g = state.grants.find((row) => row.id === (where as R)?.id)
        return g ? grantView(g) : null
      },
      findFirst: async ({ where }) => {
        const g = state.grants.find((row) => matches(grantView(row), where))
        return g ? grantView(g) : null
      },
      findMany: async ({ where }) => state.grants.map(grantView).filter((g) => matches(g, where)),
      create: async ({ data }) => {
        const grant = { id: `grant-${state.nextId++}`, createdAt: new Date(), revokedAt: null, ...data }
        state.grants.push(grant)
        return grant
      },
      update: async ({ where, data }) => {
        const grant = state.grants.find((g) => g.id === (where as R)?.id)
        if (!grant) throw new Error("adminEventAccess.update: not found")
        Object.assign(grant, data)
        return grant
      },
    },
  }

  const rawOp = (model: string, op: string, args: unknown) => {
    state.calls.push([model, op, args])
    const fn = raw[model]?.[op]
    if (!fn) throw new Error(`fake database: ${model}.${op} is not expected here`)
    return fn((args ?? {}) as { where?: unknown; data?: R })
  }

  type Hook = (input: { model: string; operation: string; args: unknown; query: (a: unknown) => Promise<unknown> }) => Promise<unknown>
  const makeClient = (): unknown => new Proxy({}, {
    get: (_t, name) => {
      if (name === "$extends") {
        return (config: { query: { $allModels: { $allOperations: Hook } } }) => new Proxy({}, {
          get: (_c, model) => new Proxy({}, {
            get: (_m, op) => (args: unknown) => config.query.$allModels.$allOperations({
              model: String(model).charAt(0).toUpperCase() + String(model).slice(1),
              operation: String(op),
              args,
              query: (a) => rawOp(String(model), String(op), a),
            }),
          }),
        })
      }
      if (name === "$transaction") return async (arg: unknown) => {
        state.calls.push(["$transaction", "$transaction", undefined])
        return typeof arg === "function" ? (arg as (tx: unknown) => unknown)(client) : Promise.all(arg as unknown[])
      }
      if (name === "then") return undefined
      return new Proxy({}, { get: (_m, op) => (args: unknown) => rawOp(String(name), String(op), args) })
    },
  })
  const client = makeClient()
  return { state, client }
})
vi.mock("@/lib/prisma", () => ({ prisma: fake.client }))
vi.mock("@/lib/org-activity", () => ({ touchOrgActivity: vi.fn() }))

const enqueue = vi.hoisted(() => vi.fn().mockResolvedValue(["outbox-1"]))
const deliver = vi.hoisted(() => vi.fn())
vi.mock("@/lib/notifications/outbox", () => ({ enqueueNotifications: enqueue, deliverAfterResponse: deliver }))
const logEvent = vi.hoisted(() => vi.fn().mockResolvedValue("log-1"))
vi.mock("@/lib/event-log", async (orig) => ({ ...(await orig<typeof import("@/lib/event-log")>()), logEvent }))
const rateLimit = vi.hoisted(() => vi.fn())
vi.mock("@/lib/rate-limit", () => ({ rateLimit }))
vi.mock("@/lib/urls", () => ({ apexBaseUrl: () => "https://app.benevol.test" }))
vi.mock("bcryptjs", () => ({ default: { hash: vi.fn().mockResolvedValue("$hashed") }, hash: vi.fn().mockResolvedValue("$hashed") }))
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }), headers: async () => new Headers() }))

const ORG = "org-fete"
const OTHER_ORG = "org-tournoi"
const EVENT = "evt-fete-2027"
const OTHER_EVENT = "evt-marche-2027"

const owner = { user: { id: "adm-owner", name: "Sacha Bonvin", email: "sacha.bonvin@example.org", role: "admin", organizationId: ORG } }
const organiser = { user: { id: "adm-sami", name: "Sami Haddad", email: "sami.haddad@example.org", role: "organizer", organizationId: ORG } }
const frontDesk = { user: { id: "adm-colette", name: "Colette Favre", email: "colette.favre@example.org", role: "front_desk", organizationId: ORG } }

function seed() {
  const s = fake.state
  s.calls.length = 0
  s.nextId = 1
  s.organizations = [
    { id: ORG, name: "Fête du village", active: true, outboundEmailApprovedAt: new Date("2026-01-01T00:00:00Z"), slug: "fete", timeZone: "Europe/Zurich" },
    { id: OTHER_ORG, name: "Tournoi", active: true, outboundEmailApprovedAt: new Date("2026-01-01T00:00:00Z"), slug: "tournoi", timeZone: "Europe/Zurich" },
  ]
  const event = (id: string, organizationId: string, title: string) => ({
    id, organizationId, title, publicStatus: "published",
    startDate: new Date("2027-06-12T00:00:00Z"), endDate: new Date("2027-06-14T00:00:00Z"),
  })
  s.events = [event(EVENT, ORG, "Fête du village"), event(OTHER_EVENT, ORG, "Marché de Noël"), event("evt-tournoi", OTHER_ORG, "Tournoi")]
  s.admins = [
    { id: "adm-owner", organizationId: ORG, name: "Sacha Bonvin", email: "sacha.bonvin@example.org", role: "admin", isActive: true, sessionVersion: 0 },
    { id: "adm-sami", organizationId: ORG, name: "Sami Haddad", email: "sami.haddad@example.org", role: "organizer", isActive: true, sessionVersion: 0 },
  ]
  s.grants = []
  rateLimit.mockResolvedValue({ ok: true, remaining: 19, retryAfter: 0 })
  enqueue.mockClear()
  deliver.mockClear()
  logEvent.mockClear()
}

const grantRow = (over: Row = {}) => ({
  id: "grant-1", adminUserId: "adm-lea", eventId: EVENT, organizationId: ORG,
  createdById: "adm-owner", createdAt: new Date("2026-11-01T08:00:00Z"), expiresAt: new Date("2027-06-15T04:00:00Z"), revokedAt: null,
  ...over,
})

async function call(method: "GET" | "POST" | "DELETE", path: string, body?: unknown, accessId?: string) {
  const mod = await import(`@/app/api/admin/${path}/route`)
  const params = path.includes("[accessId]")
    ? { params: Promise.resolve({ id: EVENT, accessId: accessId ?? "grant-1" }) }
    : { params: Promise.resolve({ id: EVENT }) }
  const req = new Request(`http://localhost/api/admin/${path.replace("[id]", EVENT).replace("[accessId]", accessId ?? "grant-1")}`, {
    method, headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body),
  })
  return mod[method](req, params)
}

const writes = () => fake.state.calls.filter(([model, op]) => op === "create" || op === "update" || op === "$transaction" || model === "adminUser")

beforeEach(() => {
  vi.clearAllMocks()
  seed()
  auth.mockResolvedValue(owner)
})

describe("front-desk access routes: who gets in", () => {
  it.each([
    ["GET", "events/[id]/front-desk-access", undefined],
    ["POST", "events/[id]/front-desk-access", { name: "Léa Favre", email: "lea.favre@example.org" }],
    ["DELETE", "events/[id]/front-desk-access/[accessId]", undefined],
    ["POST", "events/[id]/front-desk-access/[accessId]/resend", undefined],
  ] as const)("%s %s: 401 signed out, 403 organiser, 403 front desk, and nothing written or sent", async (method, path, body) => {
    auth.mockResolvedValue(null)
    expect((await call(method, path, body)).status).toBe(401)
    for (const session of [organiser, frontDesk]) {
      auth.mockResolvedValue(session)
      const res = await call(method, path, body)
      expect(res.status, `${session.user.role} ${method} ${path}`).toBe(403)
    }
    expect(writes()).toEqual([])
    expect(enqueue).not.toHaveBeenCalled()
    expect(logEvent).not.toHaveBeenCalled()
  })
})

describe("GET front-desk-access", () => {
  it("returns the event's grants with name, email, status and end date, never a token", async () => {
    fake.state.admins.push({ id: "adm-lea", organizationId: ORG, name: "Léa Favre", email: "lea.favre@example.org", role: "front_desk", isActive: true, sessionVersion: 0 })
    fake.state.grants.push(grantRow())
    const res = await call("GET", "events/[id]/front-desk-access")
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.accesses).toEqual([{ id: "grant-1", name: "Léa Favre", email: "lea.favre@example.org", status: "active", endsOn: "2027-06-14", endsOnLabel: "14 juin 2027" }])
    expect(JSON.stringify(body)).not.toMatch(/token|hash|setup/i)
  })

  it("404 for an event of another organisation, nothing read from the grant", async () => {
    auth.mockResolvedValue(owner)
    const mod = await import("@/app/api/admin/events/[id]/front-desk-access/route")
    const res = await mod.GET(new Request("http://localhost/x"), { params: Promise.resolve({ id: "evt-tournoi" }) })
    expect(res.status).toBe(404)
    expect(fake.state.calls.filter(([m]) => m === "adminEventAccess")).toEqual([])
  })
})

describe("POST front-desk-access", () => {
  const body = { name: "Léa Favre", email: "lea.favre@example.org" }

  it("counts every attempt first: over 20 a day, 429 before the event or the address is read", async () => {
    rateLimit.mockResolvedValue({ ok: false, remaining: 0, retryAfter: 42 })
    const res = await call("POST", "events/[id]/front-desk-access", body)
    expect(res.status).toBe(429)
    expect(rateLimit).toHaveBeenCalledWith(`org:${ORG}`, "front-desk-invite", 20, 24 * 60 * 60 * 1000)
    expect(fake.state.calls.filter(([m]) => m === "event")).toEqual([])
    expect(enqueue).not.toHaveBeenCalled()
  })

  it("creates the inactive front-desk account, its grant, and queues the invitation", async () => {
    const res = await call("POST", "events/[id]/front-desk-access", body)
    expect(res.status).toBe(202)
    const admin = fake.state.admins.find((a) => a.email === "lea.favre@example.org")!
    expect(admin).toMatchObject({ organizationId: ORG, name: "Léa Favre", role: "front_desk", isActive: false, receiveProductUpdates: false })
    expect(admin.setupTokenHash).toEqual(expect.any(String))
    expect(admin.setupTokenExpiresAt).toBeInstanceOf(Date)
    const grant = fake.state.grants.find((g) => g.adminUserId === admin.id)!
    expect(grant).toMatchObject({ eventId: EVENT, organizationId: ORG, createdById: "adm-owner", revokedAt: null })
    expect((grant.expiresAt as Date).toISOString()).toBe("2027-06-15T04:00:00.000Z")
    expect(enqueue).toHaveBeenCalledTimes(1)
    const payload = enqueue.mock.calls[0][0][0]
    expect(payload).toMatchObject({ kind: "front_desk_invite", organizationId: ORG, recipient: { email: "lea.favre@example.org", name: "Léa Favre" } })
    expect(payload.data).toMatchObject({ eventTitle: "Fête du village", eventDates: "du 12 juin 2027 au 14 juin 2027", untilLabel: "14 juin 2027", inviterName: "Sacha Bonvin" })
    expect(payload.data.inviteUrl).toMatch(/^https:\/\/app\.benevol\.test\/admin\/accept-invite\?token=[a-f0-9]{64}$/)
    expect(deliver).toHaveBeenCalledWith(["outbox-1"])
    expect(logEvent).toHaveBeenCalledWith(expect.objectContaining({ eventId: EVENT, action: "frontdesk.access_granted", entityId: grant.id, actor: { type: "admin", id: "adm-owner" } }))
  })

  it("an existing inactive front-desk account of this organisation is reused: no second account, grant created, invitation resent", async () => {
    fake.state.admins.push({ id: "adm-lea", organizationId: ORG, name: "Léa Favre", email: "lea.favre@example.org", role: "front_desk", isActive: false, sessionVersion: 0 })
    const res = await call("POST", "events/[id]/front-desk-access", body)
    expect(res.status).toBe(202)
    expect(fake.state.admins.filter((a) => a.email === "lea.favre@example.org")).toHaveLength(1)
    expect(fake.state.grants).toHaveLength(1)
    expect(enqueue).toHaveBeenCalledTimes(1)
  })

  it("an existing actives front-desk account gets the grant but no second invitation", async () => {
    fake.state.admins.push({ id: "adm-lea", organizationId: ORG, name: "Léa Favre", email: "lea.favre@example.org", role: "front_desk", isActive: true, sessionVersion: 0 })
    const res = await call("POST", "events/[id]/front-desk-access", body)
    expect(res.status).toBe(202)
    expect(fake.state.grants).toHaveLength(1)
    expect(enqueue).not.toHaveBeenCalled()
  })

  it("re-opens a revoked grant of this event, and logs it as reopened", async () => {
    fake.state.admins.push({ id: "adm-lea", organizationId: ORG, name: "Léa Favre", email: "lea.favre@example.org", role: "front_desk", isActive: true, sessionVersion: 0 })
    fake.state.grants.push(grantRow({ adminUserId: "adm-lea", revokedAt: new Date("2026-11-02T00:00:00Z") }))
    const res = await call("POST", "events/[id]/front-desk-access", body)
    expect(res.status).toBe(202)
    expect(fake.state.grants[0]).toMatchObject({ id: "grant-1", revokedAt: null })
    expect(logEvent).toHaveBeenCalledWith(expect.objectContaining({ action: "frontdesk.access_reopened", entityId: "grant-1" }))
  })

  it.each([
    ["an owner of this organisation", { organizationId: ORG, role: "admin", isActive: true }],
    ["an organiser of this organisation", { organizationId: ORG, role: "organizer", isActive: true }],
    ["a super admin", { organizationId: null, role: "super_admin", isActive: true }],
    ["a front-desk account of another organisation", { organizationId: OTHER_ORG, role: "front_desk", isActive: true }],
  ])("refuses %s with the same neutral message: no account, no grant, no email", async (_label, holder) => {
    fake.state.admins.push({ id: "adm-taken", name: "Personne Concernée", email: "lea.favre@example.org", sessionVersion: 0, ...holder })
    const res = await call("POST", "events/[id]/front-desk-access", body)
    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({ error: "Cette adresse ne peut pas recevoir d'accès accueil." })
    expect(fake.state.admins.filter((a) => a.email === "lea.favre@example.org")).toHaveLength(1)
    expect(fake.state.grants).toEqual([])
    expect(enqueue).not.toHaveBeenCalled()
    expect(logEvent).not.toHaveBeenCalled()
  })

  it("404 for an event of another organisation, creating nothing", async () => {
    const mod = await import("@/app/api/admin/events/[id]/front-desk-access/route")
    const res = await mod.POST(new Request("http://localhost/x", { method: "POST", body: JSON.stringify(body) }), { params: Promise.resolve({ id: "evt-tournoi" }) })
    expect(res.status).toBe(404)
    expect(fake.state.admins.filter((a) => a.email === body.email)).toEqual([])
    expect(fake.state.grants).toEqual([])
  })
})

describe("POST front-desk-access/[accessId]/resend", () => {
  beforeEach(() => {
    fake.state.admins.push({ id: "adm-lea", organizationId: ORG, name: "Léa Favre", email: "lea.favre@example.org", role: "front_desk", isActive: false, sessionVersion: 0 })
    fake.state.grants.push(grantRow({ adminUserId: "adm-lea" }))
  })

  it("sends a new seven-day link to an account not activated yet, and logs it", async () => {
    const res = await call("POST", "events/[id]/front-desk-access/[accessId]/resend")
    expect(res.status).toBe(200)
    expect(enqueue).toHaveBeenCalledTimes(1)
    expect(logEvent).toHaveBeenCalledWith(expect.objectContaining({ action: "frontdesk.invitation_resent", entityId: "grant-1" }))
  })

  it("refuses an activated account, an ended access, and another event's access", async () => {
    fake.state.admins.find((a) => a.id === "adm-lea")!.isActive = true
    expect((await call("POST", "events/[id]/front-desk-access/[accessId]/resend")).status).toBe(409)
    fake.state.admins.find((a) => a.id === "adm-lea")!.isActive = false
    fake.state.grants[0].revokedAt = new Date()
    expect((await call("POST", "events/[id]/front-desk-access/[accessId]/resend")).status).toBe(409)
    fake.state.grants[0].revokedAt = null
    expect((await call("POST", "events/[id]/front-desk-access/[accessId]/resend", undefined, "grant-autre")).status).toBe(404)
    expect(enqueue).not.toHaveBeenCalled()
  })
})

describe("DELETE front-desk-access/[accessId]", () => {
  beforeEach(() => {
    fake.state.admins.push({ id: "adm-lea", organizationId: ORG, name: "Léa Favre", email: "lea.favre@example.org", role: "front_desk", isActive: true, sessionVersion: 3 })
    fake.state.grants.push(grantRow({ adminUserId: "adm-lea" }))
  })

  it("revokes, keeps the account, ends its sessions when no other live grant remains, and logs", async () => {
    const res = await call("DELETE", "events/[id]/front-desk-access/[accessId]")
    expect(res.status).toBe(200)
    expect(fake.state.grants[0].revokedAt).toBeInstanceOf(Date)
    expect(fake.state.admins.find((a) => a.id === "adm-lea")!).toMatchObject({ id: "adm-lea", isActive: true, sessionVersion: 4 })
    expect(logEvent).toHaveBeenCalledWith(expect.objectContaining({ action: "frontdesk.access_revoked", entityId: "grant-1" }))
  })

  it("is idempotent: a second revocation changes nothing, logs nothing and does not bump the version again", async () => {
    await call("DELETE", "events/[id]/front-desk-access/[accessId]")
    logEvent.mockClear()
    const res = await call("DELETE", "events/[id]/front-desk-access/[accessId]")
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ revoked: true, alreadyRevoked: true })
    expect(fake.state.admins.find((a) => a.id === "adm-lea")!.sessionVersion).toBe(4)
    expect(logEvent).not.toHaveBeenCalled()
  })

  it("keeps the session when the account still has another live grant", async () => {
    fake.state.grants.push(grantRow({ id: "grant-2", adminUserId: "adm-lea", eventId: OTHER_EVENT, expiresAt: new Date("2027-12-05T05:00:00Z") }))
    await call("DELETE", "events/[id]/front-desk-access/[accessId]")
    expect(fake.state.admins.find((a) => a.id === "adm-lea")!.sessionVersion).toBe(3)
  })

  it("an expired other grant does not count as live", async () => {
    fake.state.grants.push(grantRow({ id: "grant-2", adminUserId: "adm-lea", eventId: OTHER_EVENT, expiresAt: new Date("2026-01-01T00:00:00Z") }))
    await call("DELETE", "events/[id]/front-desk-access/[accessId]")
    expect(fake.state.admins.find((a) => a.id === "adm-lea")!.sessionVersion).toBe(4)
  })

  it("404 for another event's access, changing nothing", async () => {
    const res = await call("DELETE", "events/[id]/front-desk-access/[accessId]", undefined, "grant-autre")
    expect(res.status).toBe(404)
    expect(fake.state.grants[0].revokedAt).toBeNull()
    expect(logEvent).not.toHaveBeenCalled()
  })
})
