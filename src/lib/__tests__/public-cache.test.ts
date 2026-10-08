import { describe, it, expect } from "vitest"
import { anonymousPublicCacheControl, isPublicContentPath, PUBLIC_PAGE_CACHE, type PublicCacheRequest } from "../public-cache"

// Anonymous public content pages (#773, #759 F3): no Auth.js, cacheable. Everything else keeps
// Auth.js and Next.js's `no-store`.
const request = (url: string, over: Partial<PublicCacheRequest> = {}): PublicCacheRequest => {
  const u = new URL(url)
  return { method: "GET", pathname: u.pathname, host: u.host, searchParams: u.searchParams, cookieNames: [], ...over }
}
const policy = (url: string, over: Partial<PublicCacheRequest> = {}) => anonymousPublicCacheControl(request(url, over))

const PUBLIC_PAGES = [
  "/",
  "/fonctionnalites",
  "/nouveautes",
  "/accessibilite",
  "/doc",
  "/doc/admin",
  "/doc/benevole",
  "/doc/creer-son-premier-evenement",
  "/videos",
  "/videos/ADMIN_NAVIGATION",
  "/legal/privacy",
  "/legal/terms",
]

describe("anonymousPublicCacheControl", () => {
  it("makes every public content page cacheable on the www site, and on localhost", () => {
    for (const path of PUBLIC_PAGES) {
      expect(policy(`https://www.benevol.app${path}`), path).toBe(PUBLIC_PAGE_CACHE)
      expect(policy(`http://localhost:3000${path}`), path).toBe(PUBLIC_PAGE_CACHE)
    }
    expect(policy("https://www.benevol.app/doc", { method: "HEAD" })).toBe(PUBLIC_PAGE_CACHE)
    expect(policy("https://www.benevol.app/videos/ADMIN_NAVIGATION?from=doc")).toBe(PUBLIC_PAGE_CACHE)
  })

  it("lets a shared cache keep the HTML a short while, the browser revalidating each time", () => {
    expect(PUBLIC_PAGE_CACHE).toMatch(/^public, /)
    expect(PUBLIC_PAGE_CACHE).toContain("max-age=0")
    expect(PUBLIC_PAGE_CACHE).toMatch(/s-maxage=\d+/)
    expect(PUBLIC_PAGE_CACHE).toMatch(/stale-while-revalidate=\d+/)
    expect(PUBLIC_PAGE_CACHE).not.toMatch(/no-store|private/)
  })

  it("never applies to an organisation: its subdomain or ?org=", () => {
    for (const path of PUBLIC_PAGES) {
      expect(policy(`https://lausanne-rocks.benevol.app${path}`), path).toBeNull()
      expect(policy(`https://www.benevol.app${path}?org=lausanne-rocks`), path).toBeNull()
      expect(policy(`http://localhost:3000${path}?org=default`), path).toBeNull()
    }
  })

  it("never applies to the admin, the super-admin, the API, personal links or event pages", () => {
    for (const path of [
      "/admin",
      "/admin/login",
      "/admin/events",
      "/super-admin",
      "/api/auth/session",
      "/api/auth/csrf",
      "/api/public/registrations/abc",
      "/my/abc",
      "/leader/abc",
      "/waitlist/abc/confirm",
      "/fete-du-village",
      "/product-updates/unsubscribe",
      "/documentation",
      "/videosx",
      "/legalese",
      "/doc/",
      "/videos/",
    ]) {
      expect(policy(`https://www.benevol.app${path}`), path).toBeNull()
    }
  })

  it("never applies with a personal token in the query", () => {
    const key = "token"
    expect(policy(`https://www.benevol.app/doc?${key}=abc`)).toBeNull()
    expect(policy("https://www.benevol.app/?t=abc")).toBeNull()
    expect(policy("https://www.benevol.app/?t=")).toBeNull()
  })

  it("never applies to a signed-in visitor (session cookie, chunked or not, http or https)", () => {
    for (const name of ["authjs.session-token", "__Secure-authjs.session-token", "__Secure-authjs.session-token.0", "authjs.session-token.1"]) {
      expect(policy("https://www.benevol.app/doc", { cookieNames: ["theme", name] }), name).toBeNull()
    }
    // Other cookies (an old CSRF cookie, a callback URL) do not make a session.
    expect(policy("https://www.benevol.app/doc", { cookieNames: ["__Host-authjs.csrf-token", "__Secure-authjs.callback-url"] })).toBe(PUBLIC_PAGE_CACHE)
  })

  it("never applies to a form or server action", () => {
    for (const method of ["POST", "PUT", "PATCH", "DELETE", "OPTIONS"]) {
      expect(policy("https://www.benevol.app/", { method }), method).toBeNull()
    }
  })

  it("leaves files under the public paths to their own cache rules", () => {
    expect(isPublicContentPath("/videos/og-image.png")).toBe(false)
    expect(isPublicContentPath("/doc/guide.md")).toBe(false)
    expect(isPublicContentPath("/doc/creer-son-premier-evenement")).toBe(true)
  })
})
