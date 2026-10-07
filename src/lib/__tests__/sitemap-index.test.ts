import { describe, it, expect } from "vitest"
import { latestDate, sitemapIndexEntries, sitemapIndexXml } from "../sitemap-index"

const orgUrl = (slug: string) => `https://${slug}.benevol.app/sitemap.xml`

describe("sitemapIndexEntries (#746)", () => {
  it("lists the apex sitemaps first, then each organisation's by slug, with its last change", () => {
    const d = new Date("2026-10-01T00:00:00Z")
    expect(sitemapIndexEntries(["https://www.benevol.app/sitemap.xml", "https://www.benevol.app/video-sitemap.xml"], [{ slug: "zurich", lastmod: null }, { slug: "lausanne-rocks", lastmod: d }], orgUrl)).toEqual([
      { loc: "https://www.benevol.app/sitemap.xml" },
      { loc: "https://www.benevol.app/video-sitemap.xml" },
      { loc: "https://lausanne-rocks.benevol.app/sitemap.xml", lastmod: d },
      { loc: "https://zurich.benevol.app/sitemap.xml", lastmod: null },
    ])
  })

  it("never lists a system subdomain as an organisation", () => {
    const entries = sitemapIndexEntries(["https://www.benevol.app/sitemap.xml"], [{ slug: "www", lastmod: null }, { slug: "medias", lastmod: null }, { slug: "", lastmod: null }], orgUrl)
    expect(entries).toEqual([{ loc: "https://www.benevol.app/sitemap.xml" }])
  })
})

describe("sitemapIndexXml", () => {
  it("writes the sitemaps.org index, a lastmod only when known, every URL escaped", () => {
    const xml = sitemapIndexXml([{ loc: "https://www.benevol.app/sitemap.xml" }, { loc: "http://localhost:3000/sitemap.xml?org=a&b", lastmod: new Date("2026-10-01T00:00:00Z") }])
    expect(xml).toBe(
      '<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
        "<sitemap><loc>https://www.benevol.app/sitemap.xml</loc></sitemap>\n" +
        "<sitemap><loc>http://localhost:3000/sitemap.xml?org=a&amp;b</loc><lastmod>2026-10-01T00:00:00.000Z</lastmod></sitemap>\n" +
        "</sitemapindex>\n",
    )
  })
})

describe("latestDate", () => {
  it("keeps the latest valid date, or null", () => {
    expect(latestDate([new Date("2026-01-01"), null, new Date("2026-03-01"), undefined])).toEqual(new Date("2026-03-01"))
    expect(latestDate([null, new Date("nope")])).toBeNull()
  })
})
