import { describe, it, expect } from "vitest"
import fs from "fs"
import path from "path"
import { apexSitemap, CONTENT_NAV, DOC_GUIDES, DOC_PAGES, linkSourcesToRoutes, PUBLIC_PAGES, publicPageMetadata, splitTitle } from "../doc-pages"

const read = (f: string) => fs.readFileSync(path.join(process.cwd(), f), "utf-8")

// The public content pages (features and documentation), their metadata and the apex sitemap.
describe("PUBLIC_PAGES", () => {
  it("has a route file and a source file for every entry, so the sitemap never lists a 404", () => {
    for (const p of PUBLIC_PAGES) {
      expect(fs.existsSync(path.join(process.cwd(), "src/app", p.path, "page.tsx")), `route for ${p.path}`).toBe(true)
      if (p.source) expect(fs.existsSync(path.join(process.cwd(), p.source)), `source for ${p.path}`).toBe(true)
    }
  })

  it("lists every doc route that exists, and the features page, so a new page cannot be forgotten", () => {
    const docDir = path.join(process.cwd(), "src/app/doc")
    const routes = ["/doc", ...fs.readdirSync(docDir, { withFileTypes: true }).filter((d) => d.isDirectory() && fs.existsSync(path.join(docDir, d.name, "page.tsx"))).map((d) => `/doc/${d.name}`)]
    expect(DOC_PAGES.map((p) => p.path).sort()).toEqual(routes.sort())
    expect(PUBLIC_PAGES.map((p) => p.path)).toContain("/fonctionnalites")
    expect(DOC_GUIDES.map((p) => p.path)).toEqual(["/doc/admin", "/doc/benevole"])
    expect(CONTENT_NAV.map((p) => p.path)).toEqual(["/fonctionnalites", "/doc/admin", "/doc/benevole"])
  })

  it("gives every page its own title and a description of about 140 to 160 characters", () => {
    const titles = PUBLIC_PAGES.map((p) => p.metaTitle)
    expect(new Set(titles).size).toBe(titles.length)
    for (const p of PUBLIC_PAGES) {
      expect(p.metaDescription.length, p.path).toBeGreaterThanOrEqual(130)
      expect(p.metaDescription.length, p.path).toBeLessThanOrEqual(165)
      expect(p.metaDescription).not.toBe(p.metaTitle)
    }
  })

  it("builds metadata with an absolute canonical on the apex host, Open Graph and indexing", () => {
    const m = publicPageMetadata("/fonctionnalites", "https://www.benevol.app/")
    expect(m.title).toBe("Fonctionnalités pour organiser vos bénévoles — benevol.app")
    expect(m.alternates?.canonical).toBe("https://www.benevol.app/fonctionnalites")
    expect(m.openGraph).toMatchObject({ url: "https://www.benevol.app/fonctionnalites", siteName: "benevol.app", type: "website" })
    expect(m.robots).toEqual({ index: true, follow: true })
    expect(publicPageMetadata("/doc/admin", "https://www.benevol.app").alternates?.canonical).toBe("https://www.benevol.app/doc/admin")
    expect(() => publicPageMetadata("/nope", "https://x")).toThrow()
  })
})

describe("FEATURES.md, the source of /fonctionnalites", () => {
  const md = read("FEATURES.md")

  it("has one title and the main categories", () => {
    expect(md.match(/^# /gm)).toHaveLength(1)
    expect(splitTitle(md).title).toBe("Fonctionnalités de benevol.app")
    for (const h of ["Préparer l'événement et son planning", "Faciliter l'inscription des bénévoles", "Garder les bénévoles informés", "Suivre l'organisation au quotidien", "Préparer le jour J", "Adapter la page à votre association"]) {
      expect(md).toContain(`## ${h}`)
    }
  })

  it("links the guides by file (readable on GitHub), rendered as site links", () => {
    expect(md).toContain("](GUIDE_ADMIN.md)")
    const site = linkSourcesToRoutes(md)
    expect(site).toContain("](/doc/admin)")
    expect(site).toContain("](/doc/benevole)")
    expect(site).not.toContain("](GUIDE_ADMIN.md)")
  })

  it("announces nothing that isn't built yet (audit of the open tickets)", () => {
    for (const future of [/logo/i, /recherche d'adresse/i, /QR/i, /photo/i, /ouverture programm/i, /aperçu avant import/i, /rôle organisateur/i]) {
      expect(md, String(future)).not.toMatch(future)
    }
  })

  it("is copied into the runtime image, like the guides", () => {
    expect(read("Dockerfile")).toContain("/app/FEATURES.md ./FEATURES.md")
  })
})

describe("apexSitemap", () => {
  it("lists the home, the features page and the documentation on the apex host, with the source file's date", () => {
    const d = new Date("2026-09-30T10:00:00Z")
    const entries = apexSitemap("https://www.benevol.app/", (src) => (src === "FEATURES.md" ? d : null))
    expect(entries[0]).toEqual({ url: "https://www.benevol.app/", changeFrequency: "weekly", priority: 1 })
    expect(entries.map((e) => e.url)).toEqual(["https://www.benevol.app/", "https://www.benevol.app/fonctionnalites", "https://www.benevol.app/doc", "https://www.benevol.app/doc/admin", "https://www.benevol.app/doc/benevole"])
    expect(entries.find((e) => e.url.endsWith("/fonctionnalites"))).toMatchObject({ lastModified: d, priority: 0.9 })
    expect(entries.find((e) => e.url.endsWith("/doc/benevole"))).not.toHaveProperty("lastModified")
  })
})
