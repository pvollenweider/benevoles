import { describe, it, expect } from "vitest"
import fs from "node:fs"
import path from "node:path"
import { DYNAMIC_CHILD_FOLDERS, isServerNotFound, NOT_FOUND_ROUTE, OWN_FOLDERS, reachesEventRoute, STATIC_ROUTES, type NotFoundLookups } from "../server-not-found"

// #935: a 404 the proxy answers with the not-found route, so its HTML carries the page.

const APEX: NotFoundLookups = {
  hasOrg: false,
  docSlugExists: (slug) => slug === "se-connecter" || slug === "ancien-nom",
  videoExists: (param) => param === "EVENT_CREATE_BLANK" || param === "event-create-blank",
}
const ORG: NotFoundLookups = { ...APEX, hasOrg: true }

const APP = path.join(process.cwd(), "src/app")

/** The app's routes (a folder with a page or a route handler) at one or two segments, as paths. */
function appRoutes(): string[] {
  const routes: string[] = []
  const isRoute = (dir: string) => fs.existsSync(path.join(dir, "page.tsx")) || fs.existsSync(path.join(dir, "route.ts")) || fs.existsSync(path.join(dir, "route.tsx"))
  const folders = (dir: string) => fs.readdirSync(dir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name)
  if (isRoute(APP)) routes.push("/")
  for (const first of folders(APP)) {
    if (isRoute(path.join(APP, first))) routes.push(`/${first}`)
    for (const second of folders(path.join(APP, first))) {
      if (isRoute(path.join(APP, first, second))) routes.push(`/${first}/${second}`)
    }
  }
  return routes
}

describe("the route tables of src/lib/server-not-found.ts", () => {
  const routes = appRoutes().filter((r) => {
    const [first] = r.split("/").filter(Boolean)
    return first === undefined || (first !== "[eventSlug]" && !OWN_FOLDERS.has(first))
  })

  it("list every static page of the app at one or two segments, and nothing else", () => {
    const statics = routes.filter((r) => !r.includes("[") && !r.includes("."))
    expect([...STATIC_ROUTES].sort()).toEqual(statics.sort())
  })

  it("list every folder with a parameter as its second segment, and the event segment is the only top-level parameter", () => {
    const dynamicChildren = new Set(routes.filter((r) => !r.includes(".") && /^\/[^/[]+\/\[[^/]+\]$/.test(r)).map((r) => r.split("/")[1]))
    expect([...DYNAMIC_CHILD_FOLDERS].sort()).toEqual([...dynamicChildren].sort())
    const topLevelParams = fs.readdirSync(APP, { withFileTypes: true }).filter((d) => d.isDirectory() && d.name.startsWith("[")).map((d) => d.name)
    expect(topLevelParams).toEqual(["[eventSlug]"])
  })

  it("never rewrites a route of the app", () => {
    for (const route of appRoutes()) {
      if (route.includes("[")) continue
      expect(isServerNotFound(route, APEX), route).toBe(false)
    }
  })
})

describe("reachesEventRoute", () => {
  it("is true for the event segment's shapes: one or two segments matched by no other route", () => {
    for (const p of ["/fete-du-village", "/fete-du-village/", "/fete-du-village/infos-pratiques", "/fete-du-village/success", "/legal/inconnu", "/accessibilite/x", "/inscription/autre", "/my", "/leader", "/waitlist", "/waitlist/abc", "/legal"]) {
      expect(reachesEventRoute(p), p).toBe(true)
    }
  })

  it("is false for the app's other routes, files, the administration, the API and deeper paths", () => {
    for (const p of ["/", "/doc", "/doc/admin", "/doc/inconnu", "/videos/X", "/my/abc", "/leader/abc", "/legal/privacy", "/inscription/confirmer", "/robots.txt", "/sitemap.xml", "/llms.txt", "/og-image.png/doc", "/doc-img/admin-pages.png", "/sw.js", "/admin", "/admin/inconnu", "/super-admin/x", "/api/public/x", "/a/b/c", "/waitlist/abc/confirm"]) {
      expect(reachesEventRoute(p), p).toBe(false)
    }
  })
})

describe("isServerNotFound", () => {
  it("answers an address of the event segment with the 404 page where there is no organisation", () => {
    expect(isServerNotFound("/nexistepas", APEX)).toBe(true)
    expect(isServerNotFound("/legal/inconnu", APEX)).toBe(true)
    expect(isServerNotFound("/fete-du-village/infos", APEX)).toBe(true)
  })

  it("leaves an organisation's events to their page (it needs the database)", () => {
    expect(isServerNotFound("/nexistepas", ORG)).toBe(false)
    expect(isServerNotFound("/fete-du-village/infos", ORG)).toBe(false)
  })

  it("answers an unknown documentation unit, but not a unit, a former slug or a static page", () => {
    expect(isServerNotFound("/doc/unite-inexistante", APEX)).toBe(true)
    expect(isServerNotFound("/doc/unite-inexistante", ORG)).toBe(true)
    expect(isServerNotFound("/doc/se-connecter", APEX)).toBe(false)
    expect(isServerNotFound("/doc/ancien-nom", APEX)).toBe(false)
    expect(isServerNotFound("/doc/admin", APEX)).toBe(false)
    expect(isServerNotFound("/doc/benevole", APEX)).toBe(false)
    expect(isServerNotFound("/doc", APEX)).toBe(false)
  })

  it("answers an unknown video, but not a video's id or slug, nor the library's social card", () => {
    expect(isServerNotFound("/videos/VIDEO_INEXISTANTE", APEX)).toBe(true)
    expect(isServerNotFound("/videos/EVENT_CREATE_BLANK", APEX)).toBe(false)
    expect(isServerNotFound("/videos/event-create-blank", APEX)).toBe(false)
    expect(isServerNotFound("/videos/og-image.png", APEX)).toBe(false)
    expect(isServerNotFound("/videos", APEX)).toBe(false)
  })

  it("leaves personal links, the administration and the API to their own checks", () => {
    for (const p of ["/my/abc", "/leader/abc", "/waitlist/abc/confirm", "/admin", "/admin/login", "/api/public/x"]) {
      expect(isServerNotFound(p, APEX), p).toBe(false)
    }
  })

  it("rewrites to the not-found route Next.js builds from src/app/not-found.tsx", () => {
    expect(NOT_FOUND_ROUTE).toBe("/_not-found")
    expect(fs.existsSync(path.join(APP, "not-found.tsx"))).toBe(true)
  })
})
