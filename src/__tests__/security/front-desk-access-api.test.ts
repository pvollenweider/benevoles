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
    // Simulates an activation that lands between the read and the conditional token write.
    forcePendingUpdateZero: false,
    // Simulates a failed session invalidation after the revocation write.
    failAdminUpdateMany: false,
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
        if (state.forcePendingUpdateZero) return { count: 0 }
        if (state.failAdminUpdateMany) {
          state.failAdminUpdateMany = false
          throw new Error("session invalidation failed")
        }
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
      updateMany: async ({ where, data }) => {
        const hits = state.grants.filter((g) => matches(grantView(g), where))
        for (const grant of hits) Object.assign(grant, data)
        return { count: hits.length }
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
      if (name === "$queryRaw") return async () => {
        state.calls.push(["$queryRaw", "$queryRaw", undefined])
        return [{ id: "locked" }]
      }
      if (name === "$transaction") return async (arg: unknown) => {
        state.calls.push(["$transaction", "$transaction", undefined])
        if (typeof arg !== "function") return Promise.all(arg as unknown[])
        // A real transaction rolls back on a throw: the atomicity tests rely on it.
        const snapshot = {
          admins: state.admins.map((a) => ({ ...a })),
          grants: state.grants.map((g) => ({ ...g })),
          nextId: state.nextId,
        }
        try {
          return await (arg as (tx: unknown) => unknown)(client)
        } catch (e) {
          state.admins = snapshot.admins
          state.grants = snapshot.grants
          state.nextId = snapshot.nextId
          throw e
        }
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
  s.forcePendingUpdateZero = false
  s.failAdminUpdateMany = false
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

const writes = () => fake.state.calls.filter(([, op]) => op === "create" || op === "update" || op === "updateMany" || op === "delete" || op === "deleteMany" || op === "$transaction")

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

  it("an existing never-activated front-desk account of this organisation is reused: no second account, grant created, invitation resent", async () => {
    fake.state.admins.push({
      id: "adm-lea", organizationId: ORG, name: "Léa Favre", email: "lea.favre@example.org", role: "front_desk",
      isActive: false, sessionVersion: 0, setupTokenHash: "old-hash", setupTokenExpiresAt: new Date("2027-01-01T00:00:00Z"),
    })
    const res = await call("POST", "events/[id]/front-desk-access", body)
    expect(res.status).toBe(202)
    expect(fake.state.admins.filter((a) => a.email === "lea.favre@example.org")).toHaveLength(1)
    expect(fake.state.grants).toHaveLength(1)
    expect(enqueue).toHaveBeenCalledTimes(1)
  })

  it("an existing active front-desk account gets the grant but no second invitation: it already has its password", async () => {
    fake.state.admins.push({ id: "adm-lea", organizationId: ORG, name: "Léa Favre", email: "lea.favre@example.org", role: "front_desk", isActive: true, sessionVersion: 0, setupTokenHash: null, setupTokenExpiresAt: null })
    const res = await call("POST", "events/[id]/front-desk-access", body)
    expect(res.status).toBe(202)
    expect(fake.state.grants).toHaveLength(1)
    expect(enqueue).not.toHaveBeenCalled()
    expect(logEvent).toHaveBeenCalledWith(expect.objectContaining({ action: "frontdesk.access_granted" }))
  })

  it("an activation that wins the race installs no setup token and queues no email, but keeps the grant", async () => {
    fake.state.admins.push({
      id: "adm-lea", organizationId: ORG, name: "Léa Favre", email: "lea.favre@example.org", role: "front_desk",
      isActive: false, sessionVersion: 0, setupTokenHash: "old-hash", setupTokenExpiresAt: new Date("2027-01-01T00:00:00Z"),
    })
    fake.state.forcePendingUpdateZero = true
    const res = await call("POST", "events/[id]/front-desk-access", body)
    expect(res.status).toBe(202)
    expect(fake.state.grants).toHaveLength(1)
    expect(fake.state.admins.find((a) => a.id === "adm-lea")!.setupTokenHash).toBe("old-hash")
    expect(enqueue).not.toHaveBeenCalled()
  })

  it("the existing-account grant, token replacement and email commit together: an enqueue failure rolls all of it back", async () => {
    fake.state.admins.push({
      id: "adm-lea", organizationId: ORG, name: "Léa Favre", email: "lea.favre@example.org", role: "front_desk",
      isActive: false, sessionVersion: 0, setupTokenHash: "old-hash", setupTokenExpiresAt: new Date("2027-01-01T00:00:00Z"),
    })
    enqueue.mockRejectedValueOnce(new Error("outbox indisponible"))
    await expect(call("POST", "events/[id]/front-desk-access", body)).rejects.toThrow("outbox indisponible")
    expect(fake.state.grants).toEqual([])
    expect(fake.state.admins.find((a) => a.id === "adm-lea")!.setupTokenHash).toBe("old-hash")
    expect(logEvent).not.toHaveBeenCalled()
  })

  it("an activated then deactivated front-desk account is refused openly, and nothing is written", async () => {
    fake.state.admins.push({ id: "adm-lea", organizationId: ORG, name: "Léa Favre", email: "lea.favre@example.org", role: "front_desk", isActive: false, sessionVersion: 1, setupTokenHash: null, setupTokenExpiresAt: null })
    const res = await call("POST", "events/[id]/front-desk-access", body)
    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({ error: "Ce compte accueil a été désactivé." })
    expect(fake.state.grants).toEqual([])
    expect(enqueue).not.toHaveBeenCalled()
    expect(logEvent).not.toHaveBeenCalled()
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
    ["a super admin", { organizationId: null, role: "super_admin", isActive: true }],
    ["a super admin attached to this organisation", { organizationId: ORG, role: "super_admin", isActive: true }],
    ["an owner of another organisation", { organizationId: OTHER_ORG, role: "admin", isActive: true }],
    ["an organiser of another organisation", { organizationId: OTHER_ORG, role: "organizer", isActive: true }],
    ["a front-desk account of another organisation", { organizationId: OTHER_ORG, role: "front_desk", isActive: true }],
  ])("gives %s exactly the same 202 as a free address, and writes, sends or logs nothing", async (_label, holder) => {
    fake.state.admins.push({ id: "adm-taken", name: "Personne Concernée", email: "lea.favre@example.org", sessionVersion: 0, ...holder })
    const res = await call("POST", "events/[id]/front-desk-access", body)
    expect(res.status).toBe(202)
    expect(await res.json()).toEqual({ accepted: true })
    expect(fake.state.admins.filter((a) => a.email === "lea.favre@example.org")).toHaveLength(1)
    expect(fake.state.grants).toEqual([])
    expect(writes()).toEqual([])
    expect(enqueue).not.toHaveBeenCalled()
    expect(logEvent).not.toHaveBeenCalled()
  })

  it.each([
    ["an owner of this organisation", { organizationId: ORG, role: "admin", isActive: true }],
    ["an organiser of this organisation", { organizationId: ORG, role: "organizer", isActive: true }],
  ])("refuses %s openly: this person already administers the organisation", async (_label, holder) => {
    fake.state.admins.push({ id: "adm-taken", name: "Personne Concernée", email: "lea.favre@example.org", sessionVersion: 0, ...holder })
    const res = await call("POST", "events/[id]/front-desk-access", body)
    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({ error: "Cette personne fait déjà partie de l'équipe d'administration de votre organisation : elle n'a pas besoin d'un accès accueil." })
    expect(fake.state.admins.filter((a) => a.email === "lea.favre@example.org")).toHaveLength(1)
    expect(fake.state.grants).toEqual([])
    expect(enqueue).not.toHaveBeenCalled()
    expect(logEvent).not.toHaveBeenCalled()
  })

  it("a free address and another organisation's account get the same status and body", async () => {
    const free = await call("POST", "events/[id]/front-desk-access", body)
    const freeBody = await free.json()
    seed()
    fake.state.admins.push({ id: "adm-other", organizationId: OTHER_ORG, name: "Personne Concernée", email: "lea.favre@example.org", role: "front_desk", isActive: true, sessionVersion: 0 })
    const hidden = await call("POST", "events/[id]/front-desk-access", body)
    expect(hidden.status).toBe(free.status)
    expect(await hidden.json()).toEqual(freeBody)
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
    fake.state.admins.push({
      id: "adm-lea", organizationId: ORG, name: "Léa Favre", email: "lea.favre@example.org", role: "front_desk",
      isActive: false, sessionVersion: 0, setupTokenHash: "old-hash", setupTokenExpiresAt: new Date("2027-01-01T00:00:00Z"),
    })
    fake.state.grants.push(grantRow({ adminUserId: "adm-lea" }))
  })

  it("sends a new seven-day link to an account not activated yet, and logs it", async () => {
    const res = await call("POST", "events/[id]/front-desk-access/[accessId]/resend")
    expect(res.status).toBe(200)
    expect(enqueue).toHaveBeenCalledTimes(1)
    expect(logEvent).toHaveBeenCalledWith(expect.objectContaining({ action: "frontdesk.invitation_resent", entityId: "grant-1" }))
  })

  it("counts every resend against the same daily budget as an invitation", async () => {
    rateLimit.mockResolvedValue({ ok: false, remaining: 0, retryAfter: 42 })
    const res = await call("POST", "events/[id]/front-desk-access/[accessId]/resend")
    expect(res.status).toBe(429)
    expect(rateLimit).toHaveBeenCalledWith(`org:${ORG}`, "front-desk-invite", 20, 24 * 60 * 60 * 1000)
    expect(fake.state.calls.filter(([m]) => m === "adminEventAccess")).toEqual([])
    expect(enqueue).not.toHaveBeenCalled()
    expect(logEvent).not.toHaveBeenCalled()
  })

  it("an activation that wins the race makes the token write match no row: none installed, no email, no log", async () => {
    // The account was read as pending, then activated before the conditional updateMany.
    fake.state.forcePendingUpdateZero = true
    const before = fake.state.admins.find((a) => a.id === "adm-lea")!
    const res = await call("POST", "events/[id]/front-desk-access/[accessId]/resend")
    expect(res.status).toBe(404)
    expect(fake.state.admins.find((a) => a.id === "adm-lea")).toMatchObject({ setupTokenHash: before.setupTokenHash })
    expect(enqueue).not.toHaveBeenCalled()
    expect(logEvent).not.toHaveBeenCalled()
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
    // One transaction, and the account row is locked before the grant is touched.
    const ops = fake.state.calls.map(([model, op]) => `${model}.${op}`)
    expect(ops.indexOf("$transaction.$transaction")).toBeGreaterThanOrEqual(0)
    expect(ops.indexOf("$queryRaw.$queryRaw")).toBeGreaterThan(ops.indexOf("$transaction.$transaction"))
    expect(ops.indexOf("$queryRaw.$queryRaw")).toBeLessThan(ops.indexOf("adminEventAccess.updateMany"))
  })

  it("a failed session invalidation rolls the revocation back, so a retry completes both", async () => {
    fake.state.failAdminUpdateMany = true
    await expect(call("DELETE", "events/[id]/front-desk-access/[accessId]")).rejects.toThrow("session invalidation failed")
    expect(fake.state.grants[0].revokedAt).toBeNull()
    expect(fake.state.admins.find((a) => a.id === "adm-lea")!.sessionVersion).toBe(3)
    // The retry is a normal revocation, not the « already revoked » path.
    const res = await call("DELETE", "events/[id]/front-desk-access/[accessId]")
    expect(res.status).toBe(200)
    expect(fake.state.grants[0].revokedAt).toBeInstanceOf(Date)
    expect(fake.state.admins.find((a) => a.id === "adm-lea")!.sessionVersion).toBe(4)
    expect(logEvent).toHaveBeenCalledWith(expect.objectContaining({ action: "frontdesk.access_revoked" }))
  })

  it("a retry repairs a revocation that committed without invalidating the sessions", async () => {
    // The old, non-transactional path could leave the grant revoked and the version unbumped.
    fake.state.grants[0].revokedAt = new Date("2026-11-02T00:00:00Z")
    const res = await call("DELETE", "events/[id]/front-desk-access/[accessId]")
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ revoked: true, alreadyRevoked: true })
    expect(fake.state.admins.find((a) => a.id === "adm-lea")!.sessionVersion).toBe(4)
    expect(logEvent).not.toHaveBeenCalled()
  })

  it("is idempotent for the resource: a second call changes no row and logs nothing", async () => {
    await call("DELETE", "events/[id]/front-desk-access/[accessId]")
    const revokedAt = fake.state.grants[0].revokedAt
    logEvent.mockClear()
    const res = await call("DELETE", "events/[id]/front-desk-access/[accessId]")
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ revoked: true, alreadyRevoked: true })
    expect(fake.state.grants[0].revokedAt).toBe(revokedAt)
    expect(logEvent).not.toHaveBeenCalled()
  })

  it("a grant re-opened after a revocation never revives the old session", async () => {
    await call("DELETE", "events/[id]/front-desk-access/[accessId]")
    expect(fake.state.admins.find((a) => a.id === "adm-lea")!.sessionVersion).toBe(4)
    fake.state.admins.find((a) => a.id === "adm-lea")!.isActive = true
    const res = await call("POST", "events/[id]/front-desk-access", { name: "Léa Favre", email: "lea.favre@example.org" })
    expect(res.status).toBe(202)
    expect(fake.state.grants[0].revokedAt).toBeNull()
    // Re-opening a grant does not lower or reset the version: the session issued before the
    // revocation (version 3) stays refused.
    expect(fake.state.admins.find((a) => a.id === "adm-lea")!.sessionVersion).toBe(4)
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
