import { describe, it, expect } from "vitest"
import fs from "node:fs"
import path from "node:path"
import { APEX_ONLY_PATHS, apexRedirectUrl, isApexOnlyPath, orgHostApexRedirectUrl } from "../apex-redirect"
import { PUBLIC_PAGES } from "../doc-pages"

const SITE = "https://www.benevol.app"

describe("apexRedirectUrl (#759)", () => {
  it("sends the bare domain to the www site, keeping the path and the query", () => {
    expect(apexRedirectUrl("benevol.app", "/", SITE)).toBe("https://www.benevol.app/")
    expect(apexRedirectUrl("benevol.app", "/fonctionnalites", SITE)).toBe("https://www.benevol.app/fonctionnalites")
    expect(apexRedirectUrl("benevol.app:443", "/doc/admin?x=1#top", SITE)).toBe("https://www.benevol.app/doc/admin?x=1#top")
    expect(apexRedirectUrl("Benevol.App", "/admin/login?callbackUrl=%2Fadmin", SITE)).toBe("https://www.benevol.app/admin/login?callbackUrl=%2Fadmin")
  })

  it("leaves every other host alone", () => {
    for (const host of ["www.benevol.app", "fete-du-village.benevol.app", "medias.benevol.app", "localhost:3000", "evil-benevol.app", "benevol.app.evil.com"]) {
      expect(apexRedirectUrl(host, "/", SITE), host).toBeNull()
    }
  })

  it("does nothing when the site address has no www (development, a self-hosted instance)", () => {
    expect(apexRedirectUrl("localhost", "/", "http://localhost:3000")).toBeNull()
    expect(apexRedirectUrl("benevoles.example.org", "/", "https://benevoles.example.org")).toBeNull()
    expect(apexRedirectUrl("benevol.app", "/", "not a url")).toBeNull()
  })
})

describe("orgHostApexRedirectUrl (#933)", () => {
  const ORG = "rugbysplash.benevol.app"

  it("sends the apex site's own pages on an organisation's host to www, keeping the query", () => {
    expect(orgHostApexRedirectUrl(ORG, "/doc/admin?from=doc", SITE)).toBe("https://www.benevol.app/doc/admin?from=doc")
    expect(orgHostApexRedirectUrl(`${ORG}:443`, "/doc", SITE)).toBe("https://www.benevol.app/doc")
    expect(orgHostApexRedirectUrl("RugbySplash.Benevol.App", "/videos/EVENT_CREATE_BLANK", SITE)).toBe("https://www.benevol.app/videos/EVENT_CREATE_BLANK")
    for (const p of ["/fonctionnalites", "/logiciel-planning-benevoles", "/nouveautes", "/accessibilite", "/legal/privacy", "/legal/terms", "/doc/se-connecter", "/videos", "/inscription", "/inscription/confirmer?t=x", "/product-updates/unsubscribed?ok=1", "/llms.txt", "/llms-full.txt"]) {
      expect(orgHostApexRedirectUrl(ORG, p, SITE), p).toBe(`https://www.benevol.app${p}`)
    }
  })

  it("keeps the organisation's own pages on its host: root, events, personal links, admin, API, robots and sitemap", () => {
    for (const p of ["/", "/?preview=1", "/fete-du-village", "/fete-du-village/infos-pratiques", "/fete-du-village/success", "/my/abc", "/leader/abc", "/waitlist/abc/confirm", "/admin", "/admin/login?callbackUrl=%2Fadmin", "/api/public/fete-du-village", "/robots.txt", "/sitemap.xml", "/og-image.png", "/documentation", "/videos-2026", "/legales", "/inscriptions-ouvertes"]) {
      expect(orgHostApexRedirectUrl(ORG, p, SITE), p).toBeNull()
    }
  })

  it("leaves the site's own hosts, system subdomains and foreign hosts alone", () => {
    for (const host of ["www.benevol.app", "benevol.app", "medias.benevol.app", "staging.benevol.app", "app.benevol.app", "a.b.benevol.app", "localhost:3000", "rugbysplash.example.org", "evil-benevol.app"]) {
      expect(orgHostApexRedirectUrl(host, "/doc/admin", SITE), host).toBeNull()
    }
  })

  it("never loops on an instance whose own address has three labels and no www", () => {
    expect(orgHostApexRedirectUrl("benevoles.example.org", "/doc", "https://benevoles.example.org")).toBeNull()
    expect(orgHostApexRedirectUrl("asso.example.org", "/doc", "https://www.example.org")).toBe("https://www.example.org/doc")
    expect(orgHostApexRedirectUrl("localhost:3000", "/doc?org=default", "http://localhost:3000")).toBeNull()
    expect(orgHostApexRedirectUrl(ORG, "/doc", "not a url")).toBeNull()
  })
})

describe("APEX_ONLY_PATHS (#933)", () => {
  it("covers every public page of src/lib/doc-pages.ts", () => {
    for (const page of PUBLIC_PAGES) expect(isApexOnlyPath(page.path), page.path).toBe(true)
  })

  it("names only routes of the app, outside the organisation's event segment", () => {
    for (const p of APEX_ONLY_PATHS) {
      expect(fs.existsSync(path.join(process.cwd(), "src/app", p)), p).toBe(true)
    }
    for (const orgRoute of ["[eventSlug]", "my", "leader", "waitlist", "admin", "api"]) {
      expect(isApexOnlyPath(`/${orgRoute}`), orgRoute).toBe(false)
    }
  })
})
