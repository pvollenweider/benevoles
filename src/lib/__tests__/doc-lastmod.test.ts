import { describe, it, expect } from "vitest"
import { docLastmodLookup } from "../doc-lastmod"
import { apexSitemap, PUBLIC_PAGES } from "../doc-pages"
import { readDocUnits } from "../doc-units"
import { docLastmod, docLastmodSources } from "../../../scripts/doc-lastmod.mjs"

// The apex sitemap's lastmod comes from doc-lastmod.json (each source's last commit, written at
// deploy), not from the files' mtime in the image, which is the build time for every page.
describe("docLastmodLookup", () => {
  it("gives each source's date from a valid map", () => {
    const lookup = docLastmodLookup({ "FEATURES.md": "2026-09-30T10:00:00+02:00", "guide/a.md": "2026-10-01T08:00:00Z" })
    expect(lookup("FEATURES.md")).toEqual(new Date("2026-09-30T08:00:00Z"))
    expect(lookup("guide/a.md")).toEqual(new Date("2026-10-01T08:00:00Z"))
  })

  it("gives null for a source missing from the map, including inherited keys", () => {
    const lookup = docLastmodLookup({ "FEATURES.md": "2026-09-30T10:00:00Z" })
    expect(lookup("GUIDE_ADMIN.md")).toBeNull()
    expect(lookup("toString")).toBeNull()
  })

  it.each([null, undefined, "2026-09-30", 42, ["FEATURES.md"]])("gives null for every source when the JSON isn't an object (%j)", (json) => {
    expect(docLastmodLookup(json)("FEATURES.md")).toBeNull()
  })

  it("ignores an invalid date string or a non-string value, keeping the valid ones", () => {
    const lookup = docLastmodLookup({ "FEATURES.md": "not a date", "GUIDE_ADMIN.md": 1759000000, "GUIDE_BENEVOLE.md": "2026-10-02T12:00:00Z" })
    expect(lookup("FEATURES.md")).toBeNull()
    expect(lookup("GUIDE_ADMIN.md")).toBeNull()
    expect(lookup("GUIDE_BENEVOLE.md")).toEqual(new Date("2026-10-02T12:00:00Z"))
  })

  it("leaves lastModified out of the sitemap when there is no map (local build, tests)", () => {
    const entries = apexSitemap("https://www.benevol.app", docLastmodLookup(null), [{ slug: "a", source: "guide/a.md" }])
    expect(entries.every((e) => !("lastModified" in e))).toBe(true)
  })
})

describe("scripts/doc-lastmod.mjs", () => {
  const sources = docLastmodSources()

  // The script reads the list from src/lib/doc-pages.ts and guide/ rather than importing the
  // TypeScript: this guard fails if the two ever drift (a renamed field, a new kind of source).
  it("dates every source of PUBLIC_PAGES and every documentation unit, and nothing else", () => {
    const pages = PUBLIC_PAGES.map((p) => p.source).filter((s): s is string => !!s)
    const units = readDocUnits().map((u) => u.source)
    expect(units.length).toBeGreaterThan(1)
    expect([...sources].sort()).toEqual([...new Set([...pages, ...units])].sort())
    expect(sources).not.toContain("guide/README.md")
  })

  it("dates a file by its last commit and skips a file without history", () => {
    const map = docLastmod(["FEATURES.md", "no-such-file.md"])
    expect(Object.keys(map)).toEqual(["FEATURES.md"])
    expect(docLastmodLookup(map)("FEATURES.md")).toBeInstanceOf(Date)
  })
})
