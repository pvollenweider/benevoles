/**
 * Front-desk access limited to one event (#1142): what a front-desk session reaches of the admin
 * API. Every `route.ts` under src/app/api/admin is found on the file system, imported, and each
 * HTTP method it exports is called with a front-desk session. The guards are the real ones
 * (auth-guard, permissions, front-desk-access are NOT mocked): only the session provider, Prisma
 * and the sending functions are.
 *
 * Every call must be refused (401 or 403) without touching the database or sending anything,
 * except the explicit allow-list below. A new admin route, or a new method on an existing one,
 * is covered automatically: it fails here until it refuses the role, or until someone decides to
 * add it to the allow-list.
 */
import { describe, it, expect, vi, beforeEach } from "vitest"
import fs from "node:fs"
import path from "node:path"

const auth = vi.hoisted(() => vi.fn())
vi.mock("@/auth", () => ({ auth }))

/** Every Prisma call: [model, operation, args]. `answer` decides what a call resolves to. */
const db = vi.hoisted(() => {
  const state = {
    calls: [] as [string, string, unknown][],
    answer: (() => null) as (model: string, op: string, args: unknown) => unknown,
  }
  const model = (name: string) => new Proxy({}, {
    get: (_m, op) => (...args: unknown[]) => { state.calls.push([name, String(op), args[0]]); return Promise.resolve(state.answer(name, String(op), args[0])) },
  })
  const client: unknown = new Proxy({}, {
    get: (_t, name) => {
      // The org-scoped client: the same recorder (the routes' own queries are not under test here).
      if (name === "$extends") return () => client
      if (name === "$transaction") return (arg: unknown) => { state.calls.push(["$transaction", "$transaction", undefined]); return typeof arg === "function" ? (arg as (tx: unknown) => unknown)(client) : Promise.all(arg as unknown[]) }
      if (name === "$queryRaw" || name === "$executeRaw") return (...args: unknown[]) => { state.calls.push([String(name), String(name), args]); return Promise.resolve([]) }
      if (name === "then") return undefined
      return model(String(name))
    },
  })
  return { state, client }
})
vi.mock("@/lib/prisma", () => ({ prisma: db.client }))

// Everything that sends: none of it may run for a refused call.
const sent = vi.hoisted(() => vi.fn())
vi.mock("@/lib/notifications", () => ({ sendNotification: (...a: unknown[]) => { sent("sendNotification", a); return Promise.resolve({ ok: true }) } }))
vi.mock("@/lib/notifications/outbox", () => ({
  enqueueNotifications: (...a: unknown[]) => { sent("enqueueNotifications", a); return Promise.resolve([]) },
  deliverAfterResponse: (...a: unknown[]) => { sent("deliverAfterResponse", a) },
}))
vi.mock("@/lib/notification-helpers", () => ({}))
// Some routes import @/lib/env transitively; it has to import cleanly, nothing more.
vi.mock("@/lib/env", () => ({ env: { AUTH_SECRET: "a".repeat(32) } }))
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }), headers: async () => new Headers() }))

import { FRONT_DESK_ROUTES, PERMISSIONS, PUBLIC_ADMIN_ROUTES } from "@/lib/permissions"

/**
 * The only routes and methods a front-desk session may pass, and only with a live grant on the
 * event of the path. A constant of this test on purpose: adding a route to the application's own
 * list (FRONT_DESK_ROUTES) is not enough, this one has to be changed too.
 */
const ALLOWED: readonly string[] = [
  "GET events/[id]/day-of",
  "POST events/[id]/registrations/bulk",
]

/**
 * Routes that cannot be judged by « refused with 401 or 403 », with the reason. They are still
 * called below with the front-desk session, and still must write and send nothing.
 */
const NOT_SESSION_GATED: Record<string, string> = {
  "GET accept-invite": "No session at all: it looks an invitation token up, whoever is signed in. Called here without a valid token: 404, nothing written.",
  "POST accept-invite": "No session at all: a single-use invitation token decides, whoever is signed in. Called here without a valid token: 4xx, nothing written.",
  "POST two-factor": "Its own guard (requireSecondFactorStep): the second step of a super admin's sign-in. A session with no factor pending gets 409; with one pending, the account is read again and a role that gives no second factor gets 403 (tested below).",
}

const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"] as const
const WRITES = new Set(["create", "createMany", "createManyAndReturn", "update", "updateMany", "updateManyAndReturn", "upsert", "delete", "deleteMany", "$transaction", "$queryRaw", "$executeRaw"])

const root = path.join(__dirname, "..", "..", "app", "api", "admin")
const routes: string[] = []
const walk = (dir: string) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) walk(path.join(dir, e.name))
    else if (e.name === "route.ts") routes.push(path.relative(root, dir).split(path.sep).join("/"))
  }
}
walk(root)
routes.sort()

// Colette Favre holds a front-desk account of the organisation « org-a ».
const frontDesk = { user: { id: "adm-accueil", name: "Colette Favre", email: "colette.favre@example.org", role: "front_desk", organizationId: "org-a" } }

/** Route params answering any name (`id`, `shiftId`, `view`…) with the same value. */
const anyParams = () => ({ params: Promise.resolve(new Proxy({}, { get: (_t, key) => (key === "then" ? undefined : "evt-1") })) })

function request(route: string, method: string): Request {
  const body = method === "GET" || method === "HEAD" || method === "OPTIONS" ? undefined
    : JSON.stringify({ action: "cancel", registrationIds: ["reg-1"], role: "admin", name: "Luc Berset", email: "luc.berset@example.org", token: "x" })
  return new Request(`http://localhost/api/admin/${route}?secteur=s1`, { method, headers: { "Content-Type": "application/json" }, body })
}

async function call(route: string, method: string): Promise<Response> {
  const mod = await import(`@/app/api/admin/${route}/route`)
  return mod[method](request(route, method), anyParams())
}

/** [route, method] for every HTTP method each route module really exports. */
async function exportedHandlers(): Promise<[string, string][]> {
  const out: [string, string][] = []
  for (const route of routes) {
    const mod = await import(`@/app/api/admin/${route}/route`)
    for (const method of METHODS) if (typeof mod[method] === "function") out.push([route, method])
  }
  return out
}

const writes = () => db.state.calls.filter(([, op]) => WRITES.has(op))

describe("admin API as a front-desk account (#1142)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    db.state.calls.length = 0
    db.state.answer = () => null
    auth.mockResolvedValue(frontDesk)
  })

  it("finds the admin routes on the file system", () => {
    expect(routes.length).toBeGreaterThan(100)
    expect(routes).toContain("events/[id]/day-of")
    expect(routes).toContain("events/[id]/registrations/bulk")
  })

  it("has the same allow-list as the application declares, and every exception names a real handler", async () => {
    const declared = Object.entries(FRONT_DESK_ROUTES).flatMap(([route, methods]) => methods.map((m) => `${m} ${route}`))
    expect([...ALLOWED].sort()).toEqual(declared.sort())
    const handlers = (await exportedHandlers()).map(([route, method]) => `${method} ${route}`)
    for (const key of [...ALLOWED, ...Object.keys(NOT_SESSION_GATED)]) expect(handlers, key).toContain(key)
    // The exceptions are routes the permission matrix itself lists as session-less.
    for (const key of Object.keys(NOT_SESSION_GATED)) expect(PUBLIC_ADMIN_ROUTES).toContain(key.split(" ")[1])
  }, 120_000)

  it("calls exactly the handlers of the permission matrix, plus the declared session-less routes", async () => {
    // The modules' real exports, not a reading of their source: nothing exported is left out.
    const exported = (await exportedHandlers()).filter(([route]) => !PUBLIC_ADMIN_ROUTES.includes(route)).map(([route, method]) => `${method} ${route}`)
    const matrix = Object.entries(PERMISSIONS).flatMap(([route, methods]) => Object.keys(methods).map((m) => `${m} ${route}`))
    expect(exported.sort()).toEqual(matrix.sort())
  }, 120_000)

  it("refuses every other route and method with 401 or 403, touching nothing and sending nothing", async () => {
    const handlers = await exportedHandlers()
    const refused: string[] = []
    const problems: string[] = []
    for (const [route, method] of handlers) {
      const key = `${method} ${route}`
      if (ALLOWED.includes(key) || key in NOT_SESSION_GATED) continue
      db.state.calls.length = 0
      sent.mockClear()
      let status: number | string
      try {
        status = (await call(route, method)).status
      } catch (e) {
        status = `threw ${(e as Error).message}`
      }
      if (status !== 401 && status !== 403) problems.push(`${key}: answered ${status}`)
      if (db.state.calls.length > 0) problems.push(`${key}: touched the database (${db.state.calls.map(([m, op]) => `${m}.${op}`).join(", ")})`)
      if (sent.mock.calls.length > 0) problems.push(`${key}: sent something (${sent.mock.calls.map(([name]) => name).join(", ")})`)
      refused.push(key)
    }
    expect(problems).toEqual([])
    // Everything but the allow-list and the declared exceptions went through the loop.
    expect(refused.length).toBe(handlers.length - ALLOWED.length - Object.keys(NOT_SESSION_GATED).length)
    expect(refused.length).toBeGreaterThan(100)
  }, 300_000)

  it.each(ALLOWED)("%s: without a grant, 403; only the organisation's state and the grant were read", async (key) => {
    const [method, route] = key.split(" ")
    // The organisation is active; no grant row exists.
    db.state.answer = (model, op) => (model === "organization" && op === "findUnique" ? { active: true } : null)
    const res = await call(route, method)
    expect(res.status).toBe(403)
    expect(db.state.calls.map(([m, op]) => `${m}.${op}`)).toEqual(["organization.findUnique", "adminEventAccess.findFirst"])
    expect(writes()).toEqual([])
    expect(sent).not.toHaveBeenCalled()
  })

  it.each(ALLOWED)("%s: with a live grant on the event of the path, it is not refused", async (key) => {
    const [method, route] = key.split(" ")
    db.state.answer = (model, op) => {
      if (model === "organization" && op === "findUnique") return { active: true }
      if (model === "adminEventAccess" && op === "findFirst") {
        return {
          id: "grant-1", adminUserId: "adm-accueil", eventId: "evt-1", organizationId: "org-a", expiresAt: null, revokedAt: null,
          adminUser: { organizationId: "org-a", isActive: true, role: "front_desk" },
          event: { id: "evt-1", organizationId: "org-a", publicStatus: "published" },
        }
      }
      return null
    }
    const res = await call(route, method)
    // Past the guard: the recorder then answers « no such event » to the route's own read (404),
    // or the route refuses the non-attendance action of this generic body (403 from the route,
    // after the grant was accepted: see front-desk-attendance.test.ts for the full matrix).
    expect(res.status).not.toBe(401)
    expect(db.state.calls.map(([m, op]) => `${m}.${op}`).slice(0, 2)).toEqual(["organization.findUnique", "adminEventAccess.findFirst"])
    expect(writes()).toEqual([])
    expect(sent).not.toHaveBeenCalled()
  })

  it.each(Object.keys(NOT_SESSION_GATED))("%s: no session check, but nothing written or sent without what it asks for", async (key) => {
    const [method, route] = key.split(" ")
    const res = await call(route, method)
    expect(res.status).toBeGreaterThanOrEqual(400)
    expect(res.status).toBeLessThan(500)
    expect(writes()).toEqual([])
    expect(sent).not.toHaveBeenCalled()
  })

  it("POST two-factor: a front-desk account presented as still owing a second factor gets 403, nothing written", async () => {
    // Role and organisation are masked in such a session; the route reads the account again.
    auth.mockResolvedValue({ user: { id: "adm-accueil" }, secondFactor: { pending: true, loginNonce: "n", authAt: 0 } })
    db.state.answer = (model, op) => (model === "adminUser" && op === "findUnique" ? { id: "adm-accueil", email: "colette.favre@example.org", role: "front_desk", sessionVersion: 0, isActive: true } : null)
    const res = await call("two-factor", "POST")
    expect(res.status).toBe(403)
    expect(writes()).toEqual([])
    expect(sent).not.toHaveBeenCalled()
  })

  it("a signed-out caller gets 401 on the two allow-listed routes", async () => {
    auth.mockResolvedValue(null)
    for (const key of ALLOWED) {
      const [method, route] = key.split(" ")
      expect((await call(route, method)).status, key).toBe(401)
    }
    expect(db.state.calls).toEqual([])
  })
})
