import { describe, it, expect } from "vitest"
import fs from "node:fs"
import path from "node:path"
import { FRONT_DESK_HOME, frontDeskRedirect, SESSIONLESS_ADMIN_PAGES } from "../front-desk-pages"
import { authConfig } from "@/auth.config"

// Front-desk access limited to one event (#1142): the pages such a session may open.
describe("frontDeskRedirect", () => {
  it("lets the landing page through, and nothing else of the admin", () => {
    expect(FRONT_DESK_HOME).toBe("/admin/front-desk")
    expect(frontDeskRedirect("/admin/front-desk")).toBeNull()
    for (const page of ["/admin", "/admin/", "/admin/dashboard", "/admin/events", "/admin/events/evt-1", "/admin/events/evt-1/day-of", "/admin/members", "/admin/settings/admins", "/admin/account", "/admin/search", "/admin/two-factor"]) {
      expect(frontDeskRedirect(page), page).toBe("/admin/front-desk")
    }
  })

  it("sends every page of the super-admin space to the landing page too", () => {
    for (const page of ["/super-admin", "/super-admin/organizations", "/super-admin/profile"]) expect(frontDeskRedirect(page), page).toBe("/admin/front-desk")
  })

  it("leaves the session-less pages alone: they work the same signed out", () => {
    for (const page of SESSIONLESS_ADMIN_PAGES) expect(frontDeskRedirect(page), page).toBeNull()
    expect(frontDeskRedirect("/admin/login?callbackUrl=%2Fadmin%2Fevents")).toBeNull()
    expect(frontDeskRedirect("/admin/reset-password?lien=abc")).toBeNull()
  })

  it("matches whole paths only: nothing is let through for starting like an allowed page", () => {
    for (const page of ["/admin/front-desk/x", "/admin/front-desk-2", "/admin/login/x", "/admin/keep/../events", "/admin/front-desk/../events", "/admin/FRONT-DESK", "/admin/front-desk/"]) {
      expect(frontDeskRedirect(page), page).toBe("/admin/front-desk")
    }
    expect(frontDeskRedirect("/admin/front-desk?x=1")).toBeNull()
  })

  it("is not concerned with the public site or the API (the routes' guards decide there)", () => {
    for (const page of ["/", "/fonctionnalites", "/administration", "/admins", "/api/admin/events", "/my/abc", "/super-administrateur"]) expect(frontDeskRedirect(page), page).toBeNull()
  })

  it("the session-less list is the proxy's own list of public admin pages, plus the login page", () => {
    const proxy = fs.readFileSync(path.join(__dirname, "..", "..", "proxy.ts"), "utf-8")
    const block = proxy.slice(proxy.indexOf("const isPublicAdminPage"), proxy.indexOf("// --- Second factor"))
    const inProxy = [...block.matchAll(/pathname === "([^"]+)"/g)].map((m) => m[1])
    expect(inProxy.length).toBeGreaterThanOrEqual(6)
    expect([...SESSIONLESS_ADMIN_PAGES].sort()).toEqual(["/admin/login", ...inProxy].sort())
    // Each one is a real page.
    for (const page of SESSIONLESS_ADMIN_PAGES) expect(fs.existsSync(path.join(__dirname, "..", "..", "app", page, "page.tsx")), page).toBe(true)
  })

  it("the proxy applies the rule to a front-desk session before its other admin checks", () => {
    const proxy = fs.readFileSync(path.join(__dirname, "..", "..", "proxy.ts"), "utf-8")
    const rule = proxy.indexOf("isFrontDeskRole(req.auth?.user?.role)")
    expect(rule).toBeGreaterThan(-1)
    expect(proxy.slice(rule, rule + 300)).toContain("frontDeskRedirect(pathname)")
    expect(rule).toBeLessThan(proxy.indexOf("if (isSuperAdminPath) {"))
  })

  it("that redirect is inside handle(), after the canonical-host redirects and the origin check, and built like the role redirects next to it", () => {
    const proxy = fs.readFileSync(path.join(__dirname, "..", "..", "proxy.ts"), "utf-8")
    const handle = proxy.slice(proxy.indexOf("function handle(req: NextAuthRequest): Response {"), proxy.indexOf("// Typed with the event"))
    const rule = handle.indexOf("isFrontDeskRole(req.auth?.user?.role)")
    expect(rule).toBeGreaterThan(-1)
    for (const earlier of ["if (apexTarget) return", "if (orgHostTarget) return", "if (refused) return"]) {
      expect(handle.indexOf(earlier), earlier).toBeGreaterThan(-1)
      expect(handle.indexOf(earlier), earlier).toBeLessThan(rule)
    }
    // Same construction as the super-admin role redirect: Response.redirect on the request's own URL.
    expect(handle).toContain("if (frontDeskTarget) return Response.redirect(new URL(frontDeskTarget, req.url))")
    expect(handle).toContain('return Response.redirect(new URL("/admin", req.url))')
  })
})

// The edge-safe `authorized` callback (src/auth.config.ts) has no role rule: a Response returned
// there is sent by the next-auth wrapper without the proxy's handle(), so it would skip the
// canonical-host redirects and the security headers. The front-desk redirect is in handle() only.
describe("authConfig.callbacks.authorized has no front-desk rule", () => {
  const authorized = authConfig.callbacks!.authorized!
  const run = (role: string | undefined, pathname: string) =>
    authorized({ auth: role === undefined ? null : ({ user: { role } } as never), request: { nextUrl: new URL(`https://fete.example.org${pathname}`) } as never })

  it("never answers with a Response, whatever the role and the page", async () => {
    for (const role of ["front_desk", "admin", "organizer", "super_admin"]) {
      for (const page of ["/admin/dashboard", "/admin/events/evt-1/day-of", "/admin/front-desk", "/admin/login", "/super-admin/organizations", "/"]) {
        expect(await run(role, page), `${role} ${page}`).toBe(true)
      }
    }
    expect(await run(undefined, "/admin/dashboard")).toBe(false)
    expect(await run(undefined, "/admin/login")).toBe(true)
    expect(await run(undefined, "/")).toBe(true)
  })

  it("its source does not mention the role or build a redirect", () => {
    const source = fs.readFileSync(path.join(__dirname, "..", "..", "auth.config.ts"), "utf-8")
    expect(source).not.toMatch(/isFrontDeskRole|frontDeskRedirect|Response\.redirect/)
  })
})
