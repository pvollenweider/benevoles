import { describe, it, expect } from "vitest"
import { apexSitemap, availablePublicPages, pageAvailable, publicPage } from "../doc-pages"
import { isHostedService, privacyHref } from "../site"

// #760: the hosted service's own pages exist only where HOSTED_SERVICE=true; another instance
// shows its operator page instead.
describe("hosted service pages", () => {
  it("reads the flag, else the upstream instance and an instance with no address are the hosted service", () => {
    expect(isHostedService({ HOSTED_SERVICE: " TRUE ", NEXT_PUBLIC_APP_URL: "https://asso.example.org" })).toBe(true)
    expect(isHostedService({ HOSTED_SERVICE: "false", NEXT_PUBLIC_APP_URL: "https://www.benevol.app" })).toBe(false)
    expect(isHostedService({ NEXT_PUBLIC_APP_URL: "https://www.benevol.app" })).toBe(true)
    expect(isHostedService({ NEXT_PUBLIC_APP_URL: "http://localhost:3100" })).toBe(true)
    expect(isHostedService({ NEXT_PUBLIC_APP_URL: "https://asso.example.org" })).toBe(false)
  })

  it("keeps legal pages, the statement and the marketing page to the hosted service", () => {
    const hostedOnly = ["/legal/privacy", "/legal/terms", "/legal/sous-traitance", "/legal/sous-traitants", "/accessibilite", "/logiciel-planning-benevoles"]
    for (const path of hostedOnly) {
      expect(pageAvailable(publicPage(path), true), path).toBe(true)
      expect(pageAvailable(publicPage(path), false), path).toBe(false)
    }
    expect(pageAvailable(publicPage("/legal/exploitant"), true)).toBe(false)
    expect(pageAvailable(publicPage("/legal/exploitant"), false)).toBe(true)
    expect(pageAvailable(publicPage("/fonctionnalites"), false)).toBe(true)
  })

  it("lists only this instance's pages in the sitemap", () => {
    const paths = (hosted: boolean) => apexSitemap("https://x.example", () => null, [], hosted).map((e) => new URL(e.url).pathname)
    expect(paths(false)).toContain("/legal/exploitant")
    expect(paths(false)).not.toContain("/legal/privacy")
    expect(paths(true)).toContain("/legal/privacy")
    expect(paths(true)).not.toContain("/legal/exploitant")
    expect(availablePublicPages(false).some((p) => p.path === "/accessibilite")).toBe(false)
  })

  it("points privacy links to the operator page on another instance", () => {
    expect(privacyHref({ HOSTED_SERVICE: "true" })).toBe("/legal/privacy")
    expect(privacyHref({ NEXT_PUBLIC_APP_URL: "https://asso.example.org" })).toBe("/legal/exploitant")
  })
})
