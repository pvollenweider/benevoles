import { describe, it, expect } from "vitest"
import fs from "node:fs"
import path from "node:path"

// A route file may export only its HTTP handlers and Next.js route settings: the type check of
// `next build` refuses any other export (« Property '…' is incompatible with index signature »).
// The video build hit it on `buildDocIndexJson`, exported from the doc-index route (batch 41).
const ALLOWED = new Set([
  "GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS",
  "dynamic", "dynamicParams", "revalidate", "fetchCache", "runtime", "preferredRegion", "maxDuration",
  "generateStaticParams",
])

function routeFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) return routeFiles(full)
    return /^route\.tsx?$/.test(entry.name) ? [full] : []
  })
}

function exportedNames(source: string): string[] {
  const names: string[] = []
  for (const m of source.matchAll(/^export\s+(?:async\s+)?(?:function\*?|const|let|var|class)\s+([A-Za-z_$][\w$]*)/gm)) names.push(m[1])
  for (const m of source.matchAll(/^export\s*\{([^}]*)\}/gm)) {
    for (const part of m[1].split(",")) {
      const name = part.trim().split(/\s+as\s+/).pop()?.trim()
      if (name) names.push(name)
    }
  }
  if (/^export\s+default\b/m.test(source)) names.push("default")
  return names
}

describe("route files", () => {
  const files = routeFiles(path.join(process.cwd(), "src/app"))

  it("are found", () => {
    expect(files.length).toBeGreaterThan(50)
  })

  it("export only handlers and route settings", () => {
    const offenders = files.flatMap((file) =>
      exportedNames(fs.readFileSync(file, "utf8"))
        .filter((name) => !ALLOWED.has(name))
        .map((name) => `${path.relative(process.cwd(), file)}: ${name}`),
    )
    expect(offenders).toEqual([])
  })

  it("reads the export forms a route file can use", () => {
    expect(exportedNames("export function helper() {}\nexport const x = 1\nexport { a as GET, b }\nexport default 1")).toEqual(["helper", "x", "GET", "b", "default"])
  })
})
