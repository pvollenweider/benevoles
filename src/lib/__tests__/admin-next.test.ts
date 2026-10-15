import { describe, it, expect } from "vitest"
import { adminEventIdFromPath, DEFAULT_ADMIN_NEXT, orgSwitchUrl, safeAdminNext } from "../admin-next"

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
      "/api/super-admin/use-org/org-1?next=%2Fadmin%2Fevents%2Fev1%2Fquestions%3Fx%3D1%26y%3D2",
    )
  })

  it("never carries an unsafe next", () => {
    expect(orgSwitchUrl("org-1", "//evil.example")).toBe("/api/super-admin/use-org/org-1?next=%2Fadmin%2Fevents")
  })
})
