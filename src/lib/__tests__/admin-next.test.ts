import { describe, it, expect } from "vitest"
import { adminEventIdFromPath, DEFAULT_ADMIN_NEXT, orgSwitchUrl, orgSwitchAction, canonicalRedirect, safeAdminNext } from "../admin-next"

describe("safeAdminNext", () => {
  it.each([
    ["/admin/events/ev1/questions", "/admin/events/ev1/questions"],
    ["/admin/events/ev1/registrations?filtre=attente", "/admin/events/ev1/registrations?filtre=attente"],
    ["/admin/members?verify=1", "/admin/members?verify=1"],
    ["/admin/events/ev1#section", "/admin/events/ev1"],
    ["/admin/events/ev%C3%A9", "/admin/events/ev%C3%A9"],
  ])("keeps the admin page %s", (raw, expected) => {
    expect(safeAdminNext(raw)).toBe(expected)
  })

  it.each([
    [undefined],
    [null],
    [""],
    ["https://evil.example"],
    ["https://evil.example/admin/events"],
    ["http:/evil.example/admin/"],
    ["javascript:alert(1)"],
    ["//evil.example/admin/events"],
    ["///evil.example/admin/"],
    ["/\\evil.example"],
    ["\\\\evil.example/admin/"],
    ["/admin\\..\\..\\api"],
    ["/admin/\\evil.example"],
    ["/admin/%2F%2Fevil.example"],
    ["/admin/%5cevil.example"],
    ["/admin/%2e%2e/api/super-admin/use-org/x"],
    ["/admin/%252e%252e/api"],
    ["/admin/../api/super-admin/organizations"],
    ["/admin/./events"],
    ["/admin/events/.."],
    ["/admin/events\n/x"],
    ["/admin/events\t"],
    ["/admin/ events"],
    ["/admin/events\u0000"],
    ["/admin"],
    ["/administration/x"],
    ["/super-admin/organizations"],
    ["/api/super-admin/use-org/x"],
    ["admin/events"],
    [" /admin/events"],
    [`/admin/${"a".repeat(2100)}`],
  ])("falls back to the events list for %j", (raw) => {
    expect(safeAdminNext(raw as string | null | undefined)).toBe(DEFAULT_ADMIN_NEXT)
  })

  it("never returns anything but a same-origin /admin/ path", () => {
    for (const raw of ["/admin/x", "//x", "https://x", "/admin/%2f", "/\\x"]) {
      const out = safeAdminNext(raw)
      expect(out.startsWith("/admin/")).toBe(true)
      expect(out.startsWith("//")).toBe(false)
    }
  })
})

describe("adminEventIdFromPath", () => {
  it.each([
    ["/admin/events/cm123abc", "cm123abc"],
    ["/admin/events/cm123abc/questions", "cm123abc"],
    ["/admin/events/cm123abc/staffing/search?q=1", "cm123abc"],
    ["/admin/events/cm123abc?x=1", "cm123abc"],
  ])("reads the event id of %s", (path, id) => {
    expect(adminEventIdFromPath(path)).toBe(id)
  })

  it.each([
    [null],
    [""],
    ["/admin/events"],
    ["/admin/events/"],
    ["/admin/events/new"],
    ["/admin/members?verify=1"],
    ["/admin/events/a%20b/questions"],
    ["/super-admin/events/cm1"],
  ])("is null for %j", (path) => {
    expect(adminEventIdFromPath(path)).toBeNull()
  })
})

describe("orgSwitchUrl", () => {
  it("switches organization and comes back to the page", () => {
    expect(orgSwitchUrl("org-1", "/admin/events/ev1/questions?x=1&y=2")).toBe(
      "/super-admin/use-org/org-1?next=%2Fadmin%2Fevents%2Fev1%2Fquestions%3Fx%3D1%26y%3D2",
    )
  })

  it("never carries an unsafe next", () => {
    expect(orgSwitchUrl("org-1", "//evil.example")).toBe("/super-admin/use-org/org-1?next=%2Fadmin%2Fevents")
  })

  it("opens a confirmation page, never the switch itself (#1048)", () => {
    expect(orgSwitchUrl("org-1", "/admin/events/ev1")).not.toContain("/api/")
  })
})

describe("orgSwitchAction", () => {
  it("is the switch's API, the id encoded", () => {
    expect(orgSwitchAction("org-1")).toBe("/api/super-admin/use-org/org-1")
    expect(orgSwitchAction("a/b")).toBe("/api/super-admin/use-org/a%2Fb")
  })
})

describe("canonicalRedirect (#1048)", () => {
  const APP = "https://www.benevol.app/"

  it("stays on the site's own host the browser used, with the configured scheme", () => {
    expect(canonicalRedirect("/admin/events", APP, "http://internal:3000/api/x", "www.benevol.app")).toBe("https://www.benevol.app/admin/events")
    // An organization's subdomain: its cookies belong to that host (regression of the first draft).
    expect(canonicalRedirect("/admin/events", APP, "http://internal:3000/api/x", "lausanne.benevol.app")).toBe("https://lausanne.benevol.app/admin/events")
  })

  it("goes to the configured address for any other host", () => {
    for (const host of ["evil.example", "benevol.app.evil.example", "evil.example/x", "", null]) {
      expect(canonicalRedirect("/admin/events", APP, "http://evil.example/api/x", host)).toBe("https://www.benevol.app/admin/events")
    }
  })

  it("keeps the query of the page", () => {
    expect(canonicalRedirect("/admin/events/ev1?x=1&y=2", APP, "http://localhost:3000/", "www.benevol.app")).toBe("https://www.benevol.app/admin/events/ev1?x=1&y=2")
  })

  it("keeps the port on localhost", () => {
    expect(canonicalRedirect("/admin/events", "http://localhost:3100", "http://localhost:3100/api/x", "localhost:3100")).toBe("http://localhost:3100/admin/events")
  })

  it("falls back to the request's origin when nothing is configured (development)", () => {
    expect(canonicalRedirect("/admin/events", undefined, "http://localhost:3100/api/x", "localhost:3100")).toBe("http://localhost:3100/admin/events")
    expect(canonicalRedirect("/admin/events", "not a url", "http://localhost:3100/api/x", null)).toBe("http://localhost:3100/admin/events")
  })
})
