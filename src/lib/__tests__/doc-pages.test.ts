import { describe, it, expect } from "vitest"
import fs from "fs"
import path from "path"
import { apexSitemap, DOC_GUIDES, DOC_PAGES } from "../doc-pages"

// The public documentation pages and the apex sitemap that lists them (SEO).
describe("DOC_PAGES", () => {
  it("has a route file and a source file for every entry, so the sitemap never lists a 404", () => {
    for (const p of DOC_PAGES) {
      expect(fs.existsSync(path.join(process.cwd(), "src/app", p.path, "page.tsx")), `route for ${p.path}`).toBe(true)
      if (p.source) expect(fs.existsSync(path.join(process.cwd(), p.source)), `source for ${p.path}`).toBe(true)
    }
  })

  it("lists every doc route that exists, so a new page cannot be forgotten", () => {
    const docDir = path.join(process.cwd(), "src/app/doc")
    const routes = ["/doc", ...fs.readdirSync(docDir, { withFileTypes: true }).filter((d) => d.isDirectory() && fs.existsSync(path.join(docDir, d.name, "page.tsx"))).map((d) => `/doc/${d.name}`)]
    expect(DOC_PAGES.map((p) => p.path).sort()).toEqual(routes.sort())
    expect(DOC_GUIDES.map((p) => p.path)).not.toContain("/doc")
  })
})

describe("apexSitemap", () => {
  it("lists the home then every doc page on the apex host, with the source file's date", () => {
    const d = new Date("2026-09-30T10:00:00Z")
    const entries = apexSitemap("https://www.benevol.app/", (src) => (src === "GUIDE_ADMIN.md" ? d : null))
    expect(entries[0]).toEqual({ url: "https://www.benevol.app/", changeFrequency: "weekly", priority: 1 })
    expect(entries.map((e) => e.url)).toEqual(["https://www.benevol.app/", "https://www.benevol.app/doc", "https://www.benevol.app/doc/admin", "https://www.benevol.app/doc/benevole"])
    expect(entries.find((e) => e.url.endsWith("/doc/admin"))).toMatchObject({ lastModified: d, priority: 0.8 })
    expect(entries.find((e) => e.url.endsWith("/doc/benevole"))).not.toHaveProperty("lastModified")
  })
})
