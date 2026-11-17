/**
 * Every super-admin route asks `requireSuperAdmin()` in each of its handlers, and an
 * administrator of an organisation (owner or organiser) gets a 403 from each before any data is
 * read or written. A new route or method fails here until it does the same.
 */
import { describe, it, expect, vi, beforeEach } from "vitest"
import { readFileSync } from "node:fs"
import { join, relative, resolve, sep } from "node:path"
import { handlerBodies, routeFilesUnder } from "../helpers/route-handlers"

const auth = vi.hoisted(() => vi.fn())
vi.mock("@/auth", () => ({ auth }))
const prismaTouched = vi.hoisted(() => vi.fn())
vi.mock("@/lib/prisma", () => ({
  prisma: new Proxy({}, { get: (_t, model) => new Proxy({}, { get: (_m, op) => (...args: unknown[]) => { prismaTouched(model, op, args); return Promise.resolve(null) } }) }),
}))
vi.mock("@/lib/notifications/outbox", () => ({ enqueueNotifications: vi.fn(), deliverAfterResponse: vi.fn() }))
vi.mock("@/lib/env", () => ({ env: { AUTH_SECRET: "a".repeat(32) } }))
vi.mock("@/lib/notifications", () => ({ sendNotification: vi.fn() }))
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined, set: () => {}, delete: () => {} }), headers: async () => new Headers() }))

const root = resolve(import.meta.dirname, "../../..")
const superAdminDir = join(root, "src/app/api/super-admin")

/**
 * Handlers that legitimately answer without `requireSuperAdmin()`, as "route METHOD" with the
 * reason in a comment. Empty: every super-admin handler asks it today.
 */
const WITHOUT_GUARD: string[] = []

const handlers = routeFilesUnder(superAdminDir).flatMap((file) => {
  const route = relative(superAdminDir, file).split(sep).slice(0, -1).join("/")
  return Object.entries(handlerBodies(readFileSync(file, "utf8"))).map(([method, body]) => ({ route, method, body }))
})

describe("super-admin routes", () => {
  it("finds the super-admin handlers", () => {
    expect(handlers.length).toBeGreaterThanOrEqual(25)
  })

  it("every handler asks requireSuperAdmin()", () => {
    const missing = handlers
      .filter((h) => !WITHOUT_GUARD.includes(`${h.route} ${h.method}`) && !h.body.includes("requireSuperAdmin()"))
      .map((h) => `${h.method} ${h.route}`)
    expect(missing).toEqual([])
  })

  describe.each([
    ["an owner", { user: { id: "adm-o", email: "elodie.favre@example.org", role: "admin", organizationId: "org-a" } }],
    ["an organiser", { user: { id: "adm-g", email: "sami.haddad@example.org", role: "organizer", organizationId: "org-a" } }],
  ])("for %s", (_who, session) => {
    beforeEach(() => { vi.clearAllMocks(); auth.mockResolvedValue(session) })

    it.each(handlers.filter((h) => !WITHOUT_GUARD.includes(`${h.route} ${h.method}`)).map((h) => [h.method, h.route] as const))(
      "%s %s answers 403, touching nothing",
      async (method, route) => {
        const mod = await import(`@/app/api/super-admin/${route}/route`)
        const url = `http://localhost/api/super-admin/${route}`
        const req = new Request(url, { method, headers: { "Content-Type": "application/json" }, body: method === "GET" || method === "DELETE" ? undefined : JSON.stringify({}) })
        const res = await mod[method](req, { params: Promise.resolve({ id: "x" }) })
        expect(res.status).toBe(403)
        expect(prismaTouched).not.toHaveBeenCalled()
      },
    )
  })
})
