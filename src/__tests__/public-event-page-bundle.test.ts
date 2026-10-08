import { describe, it, expect } from "vitest"
import { existsSync, readFileSync, statSync } from "fs"
import path from "path"

// The public event page's JavaScript (#773): what EventPageClient imports ships to every visitor's
// phone. zod (about 90 KB compressed) came in through the validation schemas of two shared
// modules, and package.json (dependencies and scripts included) through the footer's version.
// They now live in server-only modules (event-questions-schema.ts, volunteer-withdraw-schema.ts)
// and in the build's inlined APP_VERSION (src/lib/app-version.ts).

const root = process.cwd()

function resolveLocal(from: string, spec: string): string | null {
  const base = spec.startsWith("@/") ? path.join(root, "src", spec.slice(2)) : path.resolve(path.dirname(from), spec)
  for (const ext of ["", ".ts", ".tsx", "/index.ts", "/index.tsx"]) {
    const file = base + ext
    if (existsSync(file) && statSync(file).isFile()) return file
  }
  return null
}

/** Every runtime import reachable from `entry` (type-only imports are erased by the build). */
function runtimeImports(entry: string): { files: string[]; packages: Map<string, string> } {
  const files = new Set<string>()
  const packages = new Map<string, string>()
  const visit = (file: string) => {
    if (files.has(file)) return
    files.add(file)
    const source = readFileSync(file, "utf8")
    for (const [, spec] of source.matchAll(/^(?:import|export)\s+(?!type\b)[^'"]*?from\s+["']([^"']+)["']/gm)) {
      const local = spec.startsWith(".") || spec.startsWith("@/")
      if (!local || spec.endsWith(".json")) {
        packages.set(spec, path.relative(root, file))
        continue
      }
      const next = resolveLocal(file, spec)
      if (next) visit(next)
    }
  }
  visit(path.join(root, entry))
  return { files: [...files].map((f) => path.relative(root, f)), packages }
}

describe("the public event page's client modules", () => {
  const graph = runtimeImports("src/app/[eventSlug]/EventPageClient.tsx")

  it("reaches the modules it renders (the walk works)", () => {
    expect(graph.files).toContain("src/components/DayTimeline.tsx")
    expect(graph.files).toContain("src/components/PublicFooter.tsx")
    expect(graph.files).toContain("src/lib/event-questions.ts")
  })

  it("never imports zod", () => {
    const zod = [...graph.packages].filter(([spec]) => spec === "zod" || spec.startsWith("zod/"))
    expect(zod).toEqual([])
  })

  it("never imports a JSON file such as package.json", () => {
    expect([...graph.packages].filter(([spec]) => spec.endsWith(".json"))).toEqual([])
  })

  it("never imports Prisma", () => {
    const prisma = [...graph.packages].filter(([spec]) => spec.includes("prisma") || spec.includes("@/generated"))
    expect(prisma).toEqual([])
    expect(graph.files.filter((f) => f.includes("generated"))).toEqual([])
  })
})
