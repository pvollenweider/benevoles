import { describe, it, expect } from "vitest"
import fs from "node:fs"
import path from "node:path"
import { hasLevel, lastOwnerProblem, PERMISSIONS, PUBLIC_ADMIN_ROUTES } from "../permissions"

// Two admin levels (#469): Propriétaire and Organisateur.
describe("hasLevel", () => {
  it("gives owners (the legacy « admin ») and the super admin everything, organisers the organiser level", () => {
    expect(hasLevel("admin", "owner")).toBe(true)
    expect(hasLevel("super_admin", "owner")).toBe(true)
    expect(hasLevel("organizer", "organizer")).toBe(true)
    expect(hasLevel("organizer", "owner")).toBe(false)
    expect(hasLevel(undefined, "organizer")).toBe(false)
    expect(hasLevel("volunteer", "organizer")).toBe(false)
  })
})

describe("lastOwnerProblem", () => {
  it("never leaves the organisation without an active owner", () => {
    expect(lastOwnerProblem({ targetIsActiveOwner: true, nextRole: "organizer", owners: 1 })).toMatch(/au moins un propriétaire/)
    expect(lastOwnerProblem({ targetIsActiveOwner: true, nextRole: null, owners: 1 })).toMatch(/au moins un propriétaire/)
    expect(lastOwnerProblem({ targetIsActiveOwner: true, nextRole: "organizer", owners: 2 })).toBeNull()
    expect(lastOwnerProblem({ targetIsActiveOwner: false, nextRole: null, owners: 1 })).toBeNull()
    expect(lastOwnerProblem({ targetIsActiveOwner: true, nextRole: "admin", owners: 1 })).toBeNull()
  })
})

describe("permission matrix", () => {
  const root = path.join(__dirname, "..", "..", "app", "api", "admin")
  const routes: string[] = []
  const walk = (dir: string) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.isDirectory()) walk(path.join(dir, e.name))
      else if (e.name === "route.ts") routes.push(path.relative(root, dir).split(path.sep).join("/"))
    }
  }
  walk(root)
  const handlers = (route: string) => {
    const src = fs.readFileSync(path.join(root, route, "route.ts"), "utf-8")
    const parts = src.split(/export async function (GET|POST|PATCH|PUT|DELETE)\(/)
    const out: Record<string, string> = {}
    for (let i = 1; i < parts.length; i += 2) out[parts[i]] = parts[i + 1]
    return out
  }

  it("classifies every admin route and method, and nothing that doesn't exist", () => {
    const expected = routes.filter((r) => !PUBLIC_ADMIN_ROUTES.includes(r)).sort()
    expect(Object.keys(PERMISSIONS).sort()).toEqual(expected)
    for (const r of expected) expect(Object.keys(PERMISSIONS[r]).sort()).toEqual(Object.keys(handlers(r)).sort())
  })

  it("makes each handler ask its session at its level", () => {
    for (const [route, methods] of Object.entries(PERMISSIONS)) {
      const bodies = handlers(route)
      for (const [method, level] of Object.entries(methods)) {
        const body = bodies[method]
        if (level === "owner") expect(body, `${method} ${route}`).toContain('requireOrgSession("owner")')
        else expect(body, `${method} ${route}`).toMatch(/requireOrgSession\(\)/)
      }
    }
  })
})
