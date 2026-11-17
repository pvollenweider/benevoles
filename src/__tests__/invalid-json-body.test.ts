/**
 * A request body that is not valid JSON answers 400, never a 500, and nothing is read or written.
 * Every handler below used to call `await req.json()` bare, so a body such as `{` threw before any
 * validation. The static guard at the end fails when a route reads its body that way again.
 */
import { describe, it, expect, vi, beforeEach } from "vitest"
import fs from "node:fs"
import path from "node:path"

const state = vi.hoisted(() => ({ calls: [] as string[] }))
const client = vi.hoisted(() => {
  const model = (name: string) => new Proxy({}, {
    get: (_m, op) => (...args: unknown[]) => { void args; state.calls.push(`${name}.${String(op)}`); return Promise.resolve(null) },
  })
  const c: unknown = new Proxy({}, {
    get: (_t, name) => {
      if (name === "then") return undefined
      if (name === "$extends") return () => c
      if (name === "$transaction" || name === "$queryRaw" || name === "$executeRaw") return () => { state.calls.push(String(name)); return Promise.resolve(null) }
      return model(String(name))
    },
  })
  return c
})
vi.mock("@/lib/prisma", () => ({ prisma: client }))
vi.mock("@/lib/auth-guard", () => {
  const ok = () => Promise.resolve({
    session: { user: { id: "adm-1", name: "Luc Berset", email: "luc.berset@example.org", role: "admin", organizationId: "org-a" } },
    organizationId: "org-a",
    db: client,
    access: "organizer" as const,
    grant: null,
  })
  return { requireOrgSession: ok, requireSuperAdmin: ok, requireFrontDeskOrOrganizer: ok }
})
vi.mock("@/lib/rate-limit", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/rate-limit")>()
  return { ...real, rateLimit: () => Promise.resolve({ ok: true, retryAfter: 0 }) }
})
vi.mock("@/lib/env", () => ({ env: { AUTH_SECRET: "a".repeat(32) } }))
vi.mock("@/lib/notifications", () => ({ sendNotification: () => Promise.resolve({ ok: true }) }))
vi.mock("@/lib/notifications/outbox", () => ({ enqueueNotifications: () => Promise.resolve([]), deliverAfterResponse: () => {} }))
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }), headers: async () => new Headers() }))

const anyParams = () => ({ params: Promise.resolve(new Proxy({}, { get: (_t, key) => (key === "then" ? undefined : "x") })) })
const send = (route: string, method: string, body: string) =>
  import(`@/app/api/${route}/route`).then((mod) =>
    mod[method](new Request(`http://localhost/api/${route}`, { method, headers: { "Content-Type": "application/json" }, body }), anyParams()))

const HANDLERS: [string, string][] = [
  ["admin/members", "POST"],
  ["admin/members/[id]", "PATCH"],
  ["admin/events", "POST"],
  ["admin/events/[id]", "PATCH"],
  ["admin/events/[id]/roles/[roleName]", "PATCH"],
  ["admin/events/[id]/sector-leaders", "POST"],
  ["admin/events/[id]/milestones", "POST"],
  ["admin/events/[id]/milestones/[milestoneId]", "PATCH"],
  ["admin/events/[id]/pages", "POST"],
  ["admin/events/[id]/pages/[pageId]", "PATCH"],
  ["admin/events/[id]/invitations", "POST"],
  ["admin/events/[id]/invitations/test-email", "POST"],
  ["admin/shifts", "POST"],
  ["admin/shifts/[id]", "PATCH"],
  ["admin/shifts/series", "POST"],
  ["admin/shifts/recurrence", "POST"],
  ["admin/shifts/recurrence/[id]/change", "POST"],
  ["admin/shifts/recurrence/[id]/stop", "POST"],
  ["admin/registrations", "POST"],
  ["admin/registrations/[id]", "PATCH"],
  ["admin/accept-invite", "POST"],
  ["super-admin/organizations", "POST"],
  ["super-admin/organizations/[id]", "PATCH"],
  ["super-admin/profile", "PATCH"],
  ["super-admin/product-updates/test", "POST"],
  ["super-admin/product-updates/send", "POST"],
  ["public/registrations", "POST"],
]

describe("a body that is not valid JSON", () => {
  beforeEach(() => { state.calls.length = 0 })

  it.each(HANDLERS)("%s %s answers 400 and touches nothing", async (route, method) => {
    const res = await send(route, method, "{")
    expect(res.status).toBe(400)
    expect(typeof (await res.json()).error).toBe("string")
    expect(state.calls).toEqual([])
  })

  it.each(["null", "[]", "42"])("PATCH settings/organization with the body %s answers 400 and writes nothing", async (body) => {
    const res = await send("admin/settings/organization", "PATCH", body)
    expect(res.status).toBe(400)
    expect(state.calls).toEqual([])
  })

  it("PATCH settings/organization with the body { answers 400", async () => {
    expect((await send("admin/settings/organization", "PATCH", "{")).status).toBe(400)
    expect(state.calls).toEqual([])
  })
})

describe("route files read their body defensively", () => {
  const root = path.join(__dirname, "..", "app", "api")
  const files: string[] = []
  const walk = (dir: string) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.isDirectory()) walk(path.join(dir, e.name))
      else if (e.name === "route.ts") files.push(path.join(dir, e.name))
    }
  }
  walk(root)

  it("finds the route files", () => { expect(files.length).toBeGreaterThan(100) })

  it("never calls req.json() or request.json() without a .catch(", () => {
    const bare = /\b(?:req|request)\s*\.json\(\)(?!\s*\.catch\()/
    const offenders = files.filter((f) => bare.test(fs.readFileSync(f, "utf8"))).map((f) => path.relative(root, f))
    expect(offenders).toEqual([])
  })

  it("covers every handler listed above on the file system", () => {
    const rel = new Set(files.map((f) => path.relative(root, path.dirname(f)).split(path.sep).join("/")))
    for (const [route] of HANDLERS) expect(rel.has(route), route).toBe(true)
  })
})
