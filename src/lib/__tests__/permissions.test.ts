import { describe, it, expect } from "vitest"
import fs from "node:fs"
import path from "node:path"
import { FRONT_DESK_BULK_ACTIONS, FRONT_DESK_ROLE, FRONT_DESK_ROUTES, hasLevel, isFrontDeskBulkAction, isFrontDeskRole, isOrgAdminRole, isOwnerRole, lastOwnerProblem, ORG_ADMIN_ROLE_WHERE, ORG_ROLES, PERMISSIONS, PUBLIC_ADMIN_ROUTES, ROLE_LABEL } from "../permissions"

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

// Front-desk access limited to one event (#1142): a stored role, not an admin level.
describe("front-desk role", () => {
  it("reaches no level", () => {
    expect(hasLevel(FRONT_DESK_ROLE, "organizer")).toBe(false)
    expect(hasLevel(FRONT_DESK_ROLE, "owner")).toBe(false)
    expect(hasLevel("front_desk", "organizer")).toBe(false)
    expect(hasLevel("front_desk", "owner")).toBe(false)
    expect(isOwnerRole(FRONT_DESK_ROLE)).toBe(false)
  })

  it("is known, and is not one of the organisation's administrators", () => {
    expect(isFrontDeskRole("front_desk")).toBe(true)
    for (const role of ["admin", "organizer", "super_admin", undefined, null, "", "FRONT_DESK", "front_desk "]) expect(isFrontDeskRole(role)).toBe(false)
    expect(isOrgAdminRole("admin")).toBe(true)
    expect(isOrgAdminRole("organizer")).toBe(true)
    for (const role of ["front_desk", "super_admin", "volunteer", undefined, null, ""]) expect(isOrgAdminRole(role)).toBe(false)
    expect(ORG_ADMIN_ROLE_WHERE).toEqual({ role: { in: ["admin", "organizer"] } })
  })

  it("cannot be chosen or assigned: the role pickers and the team routes keep exactly owner and organiser", () => {
    expect([...ORG_ROLES]).toEqual(["admin", "organizer"])
    expect(Object.keys(ROLE_LABEL).sort()).toEqual(["admin", "organizer"])
  })

  it("is limited to the attendance actions of the bulk route", () => {
    expect([...FRONT_DESK_BULK_ACTIONS]).toEqual(["check_in", "undo_check_in", "mark_absent", "undo_absent"])
    for (const action of FRONT_DESK_BULK_ACTIONS) expect(isFrontDeskBulkAction(action)).toBe(true)
    for (const action of ["cancel", "make_leader", "resend_link", "left_early", "", "CHECK_IN"]) expect(isFrontDeskBulkAction(action)).toBe(false)
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
        // The two routes also open to a front-desk account (#1142) ask the guard that reads its grant.
        const frontDesk = (FRONT_DESK_ROUTES[route] ?? []).includes(method as "GET")
        if (frontDesk) {
          expect(level, `${method} ${route}`).toBe("organizer")
          expect(body, `${method} ${route}`).toMatch(/requireFrontDeskOrOrganizer\(\w+\)/)
          expect(body, `${method} ${route}`).not.toContain("requireOrgSession(")
        } else {
          if (level === "owner") expect(body, `${method} ${route}`).toContain('requireOrgSession("owner")')
          else expect(body, `${method} ${route}`).toMatch(/requireOrgSession\(\)/)
          expect(body, `${method} ${route}`).not.toContain("requireFrontDeskOrOrganizer")
        }
      }
    }
  })

  it("opens exactly two routes to a front-desk account, both declared in the matrix (#1142)", () => {
    expect(FRONT_DESK_ROUTES).toEqual({ "events/[id]/day-of": ["GET"], "events/[id]/registrations/bulk": ["POST"] })
    for (const [route, methods] of Object.entries(FRONT_DESK_ROUTES)) {
      for (const method of methods) expect(PERMISSIONS[route]?.[method], `${method} ${route}`).toBe("organizer")
    }
    // No other file under src/app asks the front-desk guard.
    const users: string[] = []
    const scan = (dir: string) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, e.name)
        if (e.isDirectory()) scan(full)
        else if (/\.tsx?$/.test(e.name) && fs.readFileSync(full, "utf-8").includes("requireFrontDeskOrOrganizer")) users.push(path.relative(path.join(root, "..", ".."), full).split(path.sep).join("/"))
      }
    }
    scan(path.join(root, "..", ".."))
    expect(users.sort()).toEqual(["api/admin/events/[id]/day-of/route.ts", "api/admin/events/[id]/registrations/bulk/route.ts"])
  })
})
