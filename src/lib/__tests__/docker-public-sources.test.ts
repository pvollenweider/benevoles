import { describe, it, expect } from "vitest"
import fs from "node:fs"
import path from "node:path"
import { PUBLIC_PAGES } from "../doc-pages"

// The production image must contain every Markdown source of the public pages: FEATURES.md was
// copied by the Dockerfile but excluded by .dockerignore, and every deploy failed (ENOENT at
// prerender of /fonctionnalites) until this check existed.
const root = path.join(__dirname, "..", "..", "..")
const read = (f: string) => fs.readFileSync(path.join(root, f), "utf-8")

describe("public page sources in the Docker image", () => {
  const sources = [...new Set(PUBLIC_PAGES.map((p) => p.source).filter((s): s is string => !!s))]

  it("has sources to check", () => {
    expect(sources).toContain("FEATURES.md")
  })

  it.each(sources)("%s is re-included by .dockerignore and copied into the runtime image", (source) => {
    const ignore = read(".dockerignore").split("\n").map((l) => l.trim())
    expect(ignore).toContain(`!${source}`)
    expect(read("Dockerfile")).toMatch(new RegExp(`COPY --from=builder .*/app/${source.replace(".", "\\.")} \\./${source.replace(".", "\\.")}`))
  })

  // The documentation units (#649): the whole folder, read by src/lib/doc-units.ts at runtime.
  it("guide/*.md is re-included by .dockerignore and the folder copied into the runtime image", () => {
    const ignore = read(".dockerignore").split("\n").map((l) => l.trim())
    expect(ignore).toContain("!guide/*.md")
    expect(read("Dockerfile")).toMatch(/COPY --from=builder .*\/app\/guide \.\/guide\n/)
    expect(fs.readdirSync(path.join(root, "guide")).filter((f) => f.endsWith(".md")).length).toBeGreaterThan(1)
  })
})
