/**
 * Owner-only admin routes (#469): an organiser gets a 403 before any data is read or written,
 * whatever the route. The matrix itself is checked against the files in permissions.test.ts.
 */
import { describe, it, expect, vi, beforeEach } from "vitest"

const auth = vi.hoisted(() => vi.fn())
vi.mock("@/auth", () => ({ auth }))
const prismaTouched = vi.hoisted(() => vi.fn())
vi.mock("@/lib/prisma", () => ({
  prisma: new Proxy({}, { get: (_t, model) => new Proxy({}, { get: (_m, op) => (...args: unknown[]) => { prismaTouched(model, op, args); return Promise.resolve(null) } }) }),
}))

vi.mock("@/lib/notifications/outbox", () => ({ enqueueNotifications: vi.fn(), deliverAfterResponse: vi.fn() }))
vi.mock("@/lib/email", () => ({}))

import { PERMISSIONS } from "@/lib/permissions"

const organizer = { user: { id: "adm-o", email: "o@x.ch", role: "organizer", organizationId: "org-a" } }
const owners = Object.entries(PERMISSIONS).flatMap(([route, methods]) =>
  Object.entries(methods).filter(([, level]) => level === "owner").map(([method]) => [route, method] as const))

describe("owner-only routes refuse organisers", () => {
  beforeEach(() => { vi.clearAllMocks(); auth.mockResolvedValue(organizer) })

  it("has owner-only routes to check", () => {
    expect(owners.length).toBeGreaterThanOrEqual(6)
  })

  it.each(owners)("%s %s answers 403 to an organiser, touching nothing", async (route, method) => {
    const mod = await import(`@/app/api/admin/${route}/route`)
    const req = new Request(`http://localhost/api/admin/${route}`, { method, headers: { "Content-Type": "application/json" }, body: method === "GET" ? undefined : JSON.stringify({ role: "admin", name: "X", email: "x@y.ch" }) })
    const res = await mod[method](req, { params: Promise.resolve({ id: "x" }) })
    expect(res.status).toBe(403)
    expect((await res.json()).error).toMatch(/propriétaires/)
    expect(prismaTouched).not.toHaveBeenCalled()
  })
})
