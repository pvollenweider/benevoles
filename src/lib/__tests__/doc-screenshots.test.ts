// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { describe, expect, it } from "vitest"
import { existsSync, readFileSync, readdirSync } from "node:fs"
import { DOC_SCREENSHOTS, hasOptOut, importSpecifiers, resolveLocalImport, screenshotSources, staleScreenshots } from "../doc-screenshots"

describe("importSpecifiers", () => {
  it("finds static, multi-line, type, re-export and dynamic imports", () => {
    const source = [
      'import Link from "next/link"',
      "import {",
      "  a,",
      "  b,",
      '} from "@/components/admin/Foo"',
      'import type { T } from "./types"',
      'export { x } from "../Bar"',
      'const Lazy = dynamic(() => import("@/components/Lazy"))',
    ].join("\n")
    expect(importSpecifiers(source)).toEqual(["next/link", "@/components/admin/Foo", "./types", "../Bar", "@/components/Lazy"])
  })
})

describe("resolveLocalImport", () => {
  const files = new Set(["src/components/admin/Foo.tsx", "src/app/[eventSlug]/EventPageClient.tsx", "src/components/shifts/index.ts"])
  const exists = (path: string) => files.has(path)

  it("resolves aliases and relative paths inside src/app and src/components", () => {
    expect(resolveLocalImport("src/app/x/page.tsx", "@/components/admin/Foo", exists)).toBe("src/components/admin/Foo.tsx")
    expect(resolveLocalImport("src/app/[eventSlug]/page.tsx", "./EventPageClient", exists)).toBe("src/app/[eventSlug]/EventPageClient.tsx")
    expect(resolveLocalImport("src/components/admin/Foo.tsx", "../shifts", exists)).toBe("src/components/shifts/index.ts")
  })

  it("ignores packages, src/lib and missing files", () => {
    expect(resolveLocalImport("src/app/x/page.tsx", "next/link", exists)).toBeNull()
    expect(resolveLocalImport("src/app/x/page.tsx", "@/lib/prisma", exists)).toBeNull()
    expect(resolveLocalImport("src/app/x/page.tsx", "@/components/Missing", exists)).toBeNull()
  })
})

describe("screenshotSources", () => {
  it("follows imports transitively and survives cycles", () => {
    const tree: Record<string, string> = {
      "src/app/p/page.tsx": 'import A from "@/components/A"\nimport { x } from "@/lib/x"',
      "src/components/A.tsx": 'import B from "./B"',
      "src/components/B.tsx": 'import A from "./A"',
    }
    const sources = screenshotSources(["src/app/p/page.tsx"], (p) => tree[p], (p) => p in tree)
    expect([...sources].sort()).toEqual(["src/app/p/page.tsx", "src/components/A.tsx", "src/components/B.tsx"])
  })
})

describe("staleScreenshots", () => {
  const sourcesByShot = {
    "admin-shifts": new Set(["src/app/admin/events/[id]/shifts/page.tsx", "src/components/admin/ShiftsManager.tsx"]),
    "public-timeline": new Set(["src/app/[eventSlug]/page.tsx"]),
  }

  it("flags a capture whose screen changed but whose PNG did not", () => {
    expect(staleScreenshots(new Set(["src/components/admin/ShiftsManager.tsx"]), sourcesByShot)).toEqual([
      { name: "admin-shifts", changedSources: ["src/components/admin/ShiftsManager.tsx"] },
    ])
  })

  it("accepts a regenerated capture and ignores unrelated changes", () => {
    expect(staleScreenshots(new Set(["src/components/admin/ShiftsManager.tsx", "public/doc-img/admin-shifts.png"]), sourcesByShot)).toEqual([])
    expect(staleScreenshots(new Set(["src/lib/prisma.ts", "README.md"]), sourcesByShot)).toEqual([])
  })
})

describe("hasOptOut", () => {
  it("finds the marker in a PR description or commit message, case-insensitively", () => {
    expect(hasOptOut(["refactor\n\nDoc-img: unchanged (no visible change)"])).toBe(true)
    expect(hasOptOut(["", "fix: label"])).toBe(false)
  })
})

describe("DOC_SCREENSHOTS", () => {
  const script = readFileSync("scripts/screenshots.mjs", "utf-8")

  it("covers every capture of public/doc-img and every shot of scripts/screenshots.mjs", () => {
    const pngs = readdirSync("public/doc-img").filter((f) => f.endsWith(".png")).map((f) => f.slice(0, -4)).sort()
    const shots = [...script.matchAll(/await shot\("([^"]+)"/g)].map((m) => m[1]).sort()
    expect(Object.keys(DOC_SCREENSHOTS).sort()).toEqual(pngs)
    expect(Object.keys(DOC_SCREENSHOTS).sort()).toEqual(shots)
  })

  it("points to route files that exist", () => {
    for (const entries of Object.values(DOC_SCREENSHOTS)) for (const entry of entries) expect(existsSync(entry), entry).toBe(true)
  })

  it("reaches the components a capture shows", () => {
    const sources = screenshotSources(DOC_SCREENSHOTS["admin-shifts"], (p) => readFileSync(p, "utf-8"), existsSync)
    expect(sources.has("src/components/admin/ShiftsManager.tsx")).toBe(true)
  })
})
