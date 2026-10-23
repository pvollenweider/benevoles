import { describe, it, expect } from "vitest"
import { execFileSync } from "node:child_process"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { docLastmodLookup } from "../doc-lastmod"
import { apexSitemap, PUBLIC_PAGES } from "../doc-pages"
import { readDocUnits } from "../doc-units"
import { docLastmod, docLastmodSources, LASTMOD_SKIP_TRAILER, VIDEO_PAGE_SOURCES } from "../../../scripts/doc-lastmod.mjs"

// The apex sitemap's lastmod comes from doc-lastmod.json (each source's last commit, written at
// deploy), not from the files' mtime in the image, which is the build time for every page.
describe("docLastmodLookup", () => {
  it("gives each source's date from a valid map", () => {
    const lookup = docLastmodLookup({ "content/pages/FEATURES.md": "2026-09-30T10:00:00+02:00", "guide/a.md": "2026-10-01T08:00:00Z" })
    expect(lookup("content/pages/FEATURES.md")).toEqual(new Date("2026-09-30T08:00:00Z"))
    expect(lookup("guide/a.md")).toEqual(new Date("2026-10-01T08:00:00Z"))
  })

  it("gives null for a source missing from the map, including inherited keys", () => {
    const lookup = docLastmodLookup({ "content/pages/FEATURES.md": "2026-09-30T10:00:00Z" })
    expect(lookup("content/guide/GUIDE_ADMIN.md")).toBeNull()
    expect(lookup("toString")).toBeNull()
  })

  it.each([null, undefined, "2026-09-30", 42, ["content/pages/FEATURES.md"]])("gives null for every source when the JSON isn't an object (%j)", (json) => {
    expect(docLastmodLookup(json)("content/pages/FEATURES.md")).toBeNull()
  })

  it("ignores an invalid date string or a non-string value, keeping the valid ones", () => {
    const lookup = docLastmodLookup({ "content/pages/FEATURES.md": "not a date", "content/guide/GUIDE_ADMIN.md": 1759000000, "content/guide/GUIDE_BENEVOLE.md": "2026-10-02T12:00:00Z" })
    expect(lookup("content/pages/FEATURES.md")).toBeNull()
    expect(lookup("content/guide/GUIDE_ADMIN.md")).toBeNull()
    expect(lookup("content/guide/GUIDE_BENEVOLE.md")).toEqual(new Date("2026-10-02T12:00:00Z"))
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
  it("dates every source of PUBLIC_PAGES, every documentation unit and the video pages' code, and nothing else", () => {
    const pages = PUBLIC_PAGES.map((p) => p.source).filter((s): s is string => !!s)
    const units = readDocUnits().map((u) => u.source)
    const videoPages = [...VIDEO_PAGE_SOURCES.library, ...VIDEO_PAGE_SOURCES.video]
    expect(units.length).toBeGreaterThan(1)
    expect([...sources].sort()).toEqual([...new Set([...pages, ...units, ...videoPages])].sort())
    expect(sources).not.toContain("guide/README.md")
  })

  it("dates a file by its last commit and skips a file without history", () => {
    const map = docLastmod(["content/pages/FEATURES.md", "no-such-file.md"])
    expect(Object.keys(map)).toEqual(["content/pages/FEATURES.md"])
    expect(docLastmodLookup(map)("content/pages/FEATURES.md")).toBeInstanceOf(Date)
  })

  // Moving the sources into content/ changed no page: the sitemap keeps the date of the last real
  // change, across the rename, and passes over the commits marked with the trailer.
  it("follows a file across a rename and passes over the commits that carry the skip trailer", () => {
    const repo = fs.mkdtempSync(path.join(os.tmpdir(), "doc-lastmod-"))
    try {
      const git = (date: string, ...args: string[]) =>
        execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", "-c", "commit.gpgsign=false", ...args], { cwd: repo, env: { ...process.env, GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date } })
      git("2026-01-01T00:00:00Z", "init", "-q")
      fs.writeFileSync(path.join(repo, "PAGE.md"), "# Page\n\nOne line.\nTwo lines.\nThree lines.\n")
      git("2026-01-01T00:00:00Z", "add", ".")
      git("2026-01-01T00:00:00Z", "commit", "-q", "-m", "add the page")
      fs.mkdirSync(path.join(repo, "content"))
      git("2026-02-01T00:00:00Z", "mv", "PAGE.md", "content/PAGE.md")
      git("2026-02-01T00:00:00Z", "commit", "-q", "-m", "move it", "-m", LASTMOD_SKIP_TRAILER)
      expect(docLastmod(["content/PAGE.md"], repo)).toEqual({ "content/PAGE.md": "2026-01-01T00:00:00Z" })
      // A shallow clone that only holds the move (CI checks out one commit): dated by it rather than left out.
      const shallow = fs.mkdtempSync(path.join(os.tmpdir(), "doc-lastmod-shallow-"))
      try {
        execFileSync("git", ["clone", "-q", "--depth", "1", `file://${repo}`, shallow])
        expect(docLastmod(["content/PAGE.md"], shallow)).toEqual({ "content/PAGE.md": "2026-02-01T00:00:00Z" })
      } finally {
        fs.rmSync(shallow, { recursive: true, force: true })
      }
      fs.appendFileSync(path.join(repo, "content/PAGE.md"), "Four lines.\n")
      git("2026-03-01T00:00:00Z", "commit", "-q", "-am", "change it")
      expect(docLastmod(["content/PAGE.md"], repo)).toEqual({ "content/PAGE.md": "2026-03-01T00:00:00Z" })
    } finally {
      fs.rmSync(repo, { recursive: true, force: true })
    }
  })
})
