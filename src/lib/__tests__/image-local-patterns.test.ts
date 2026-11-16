import { describe, it, expect } from "vitest"
import { readdirSync, readFileSync, statSync } from "fs"
import { join } from "path"
import { hasLocalMatch } from "next/dist/shared/lib/match-local-pattern"
import { IMAGE_LOCAL_PATTERNS } from "../image-local-patterns"

const patterns = IMAGE_LOCAL_PATTERNS.map((p) => ({ ...p }))

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return name === "__tests__" ? [] : sourceFiles(path)
    return /\.tsx?$/.test(name) ? [path] : []
  })
}

describe("image optimiser local patterns", () => {
  it("allows the doc screenshots the home page loads", () => {
    for (const src of ["/doc-img/public-timeline-mobile.png", "/doc-img/admin-staffing.png"]) expect(hasLocalMatch(patterns, src), src).toBe(true)
  })

  it("refuses API routes, pages and query strings", () => {
    for (const src of [
      "/api/health",
      "/api/public/organizations/default/logo",
      "/admin",
      "/doc-img/admin-staffing.png?x=1",
      "/doc-img/../api/health",
      "/favicon.ico",
    ]) expect(hasLocalMatch(patterns, src), src).toBe(false)
  })

  it("covers every literal source given to next/image", () => {
    const files = sourceFiles(join(process.cwd(), "src")).filter((f) => readFileSync(f, "utf8").includes('from "next/image"'))
    expect(files.length).toBeGreaterThan(0)
    for (const file of files) {
      const text = readFileSync(file, "utf8")
      for (const [, src] of text.matchAll(/(?:src=|image: )"(\/[^"]+\.(?:png|jpe?g|webp|avif|gif))"/g)) {
        expect(hasLocalMatch(patterns, src), `${file}: ${src}`).toBe(true)
      }
    }
  })

  it("is what next.config.ts sets", () => {
    expect(readFileSync(join(process.cwd(), "next.config.ts"), "utf8")).toContain("localPatterns: IMAGE_LOCAL_PATTERNS")
  })
})
