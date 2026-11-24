// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { readdirSync, readFileSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"
import { boundaryViolations, forbiddenTokens } from "../core-boundary"
import type { BoundaryFile, BoundaryOptions, BoundaryViolation } from "../core-boundary"

const CORE_ROOT = "videos/core"

/** Runs the guard on a single file of the core, with no dependency and no forbidden token unless asked. */
function check(source: string, options: Partial<BoundaryOptions> = {}): BoundaryViolation[] {
  const files: BoundaryFile[] = [{ path: `${CORE_ROOT}/b.ts`, source }]
  return boundaryViolations(files, { coreRoot: CORE_ROOT, allowedPackages: [], forbiddenTokens: [], ...options })
}

/** Refuses a source that must produce exactly one import violation, on its first line. */
function singleImport(source: string, options: Partial<BoundaryOptions> = {}): BoundaryViolation {
  const violations = check(source, options)
  expect(violations).toHaveLength(1)
  expect(violations[0]).toMatchObject({ path: `${CORE_ROOT}/b.ts`, line: 1, kind: "import" })
  return violations[0]
}

describe("imports of a core file", () => {
  it("allows a relative import that stays in the core", () => {
    expect(check('import x from "./a"')).toEqual([])
  })

  it("allows a Node built-in", () => {
    expect(check('import fs from "node:fs"')).toEqual([])
  })

  it("refuses a relative import that leaves the core", () => {
    expect(singleImport('import x from "../lib/manifest"').detail).toContain("../lib/manifest")
  })

  it("refuses a relative import that leaves the core and comes back", () => {
    singleImport('import x from "../core/../lib/manifest"')
  })

  it("refuses an application alias", () => {
    singleImport('import x from "@/lib/video-catalog"')
  })

  it("refuses a dynamic import of a file outside the core", () => {
    singleImport('const m = await import("../tools/focus-mailpit")')
  })

  it("refuses a require of a file outside the core", () => {
    singleImport('const m = require("../lib/captions")')
  })

  it("refuses a re-export from outside the core", () => {
    singleImport('export { a } from "../lib/captions"')
  })

  it("refuses a side-effect import of a file outside the core", () => {
    singleImport('import "../lib/captions"')
  })

  it("allows a side-effect import inside the core", () => {
    expect(check('import "./setup"')).toEqual([])
  })

  it("refuses a type-only import of a file outside the core", () => {
    singleImport('import type { A } from "../lib/manifest"')
  })

  it("refuses an import type of a file outside the core", () => {
    singleImport('type T = import("../lib/manifest").VideoManifest')
  })

  it("refuses an import equals require of a file outside the core", () => {
    singleImport('import fs = require("../lib/captions")')
  })

  it("refuses a computed dynamic import", () => {
    expect(singleImport("const m = await import(name)").detail).toBe("computed specifier")
  })

  it("refuses a computed require", () => {
    expect(singleImport('const m = require(base + "/x")').detail).toBe("computed specifier")
  })

  it("allows a dynamic import of a template without substitution", () => {
    expect(check("const m = await import(`./a`)")).toEqual([])
  })

  it("refuses a dynamic import of a template with a substitution", () => {
    expect(singleImport("const m = await import(`./${name}`)").detail).toBe("computed specifier")
  })

  it("refuses a package that is not declared", () => {
    singleImport('import { chromium } from "playwright"', { allowedPackages: [] })
  })

  it("allows a declared package", () => {
    expect(check('import { chromium } from "playwright"', { allowedPackages: ["playwright"] })).toEqual([])
  })

  it("allows a subpath of a declared scoped package", () => {
    expect(check('import x from "@scope/pkg/sub"', { allowedPackages: ["@scope/pkg"] })).toEqual([])
  })
})

describe("core files of every extension", () => {
  const options: BoundaryOptions = { coreRoot: CORE_ROOT, allowedPackages: [], forbiddenTokens: [] }

  it("checks imports in an .mjs file", () => {
    const violations = boundaryViolations([{ path: `${CORE_ROOT}/b.mjs`, source: 'import x from "../lib/manifest"' }], options)
    expect(violations).toHaveLength(1)
    expect(violations[0]).toMatchObject({
      path: `${CORE_ROOT}/b.mjs`,
      line: 1,
      kind: "import",
      detail: "../lib/manifest",
    })
  })

  it("reads forbidden tokens in a .json file and finds no import", () => {
    const violations = boundaryViolations(
      [{ path: `${CORE_ROOT}/b.json`, source: '{"port": 43100}' }],
      { ...options, forbiddenTokens: forbiddenTokens([]) },
    )
    expect(violations).toHaveLength(1)
    expect(violations[0]).toMatchObject({ path: `${CORE_ROOT}/b.json`, line: 1, kind: "token" })
  })

  it("does not read an import written as text in a .json file", () => {
    expect(boundaryViolations([{ path: `${CORE_ROOT}/b.json`, source: 'import x from "../lib/a"' }], options)).toEqual([])
  })
})

describe("a source the guard cannot parse", () => {
  it("refuses the file and still reports the imports it recovered", () => {
    const violations = check('import { from "../lib/manifest"')
    expect(violations).toContainEqual({ path: `${CORE_ROOT}/b.ts`, line: 1, kind: "import", detail: "unparseable" })
    expect(violations).toContainEqual({ path: `${CORE_ROOT}/b.ts`, line: 1, kind: "import", detail: "../lib/manifest" })
  })
})

describe("forbidden tokens of a core file", () => {
  it("refuses a product port number in a comment, on its own line", () => {
    const violations = check("const a = 1\nconst b = 2\n// served on port 43100", { forbiddenTokens: forbiddenTokens([]) })
    expect(violations).toHaveLength(1)
    expect(violations[0]).toMatchObject({ path: `${CORE_ROOT}/b.ts`, line: 3, kind: "token" })
  })

  it("refuses a known video id", () => {
    const violations = check('const id = "GLOBAL_SEARCH"', { forbiddenTokens: forbiddenTokens(["GLOBAL_SEARCH"]) })
    expect(violations).toHaveLength(1)
    expect(violations[0]).toMatchObject({ path: `${CORE_ROOT}/b.ts`, line: 1, kind: "token" })
  })

  it("allows a longer identifier that only starts with a known video id", () => {
    expect(check('const s = "GLOBAL_SEARCHER"', { forbiddenTokens: forbiddenTokens(["GLOBAL_SEARCH"]) })).toEqual([])
  })
})

describe("the real core tree", () => {
  const root = path.resolve(__dirname, "../../..")
  const coreDirectory = path.join(root, CORE_ROOT)

  it("reads every file of the core except the README", () => {
    const files = readdirSync(coreDirectory, { recursive: true, withFileTypes: true })
      .filter(entry => entry.isFile())
      .map(entry => path.relative(coreDirectory, path.join(entry.parentPath, entry.name)).split(path.sep).join("/"))
      .filter(relative => relative !== "README.md")
      .map(relative => ({
        path: `${CORE_ROOT}/${relative}`,
        source: readFileSync(path.join(coreDirectory, relative), "utf8"),
      }))
    expect(files.map(file => file.path)).toContain(`${CORE_ROOT}/dependencies.json`)
    const catalog = JSON.parse(readFileSync(path.join(root, "videos/catalog.json"), "utf8")) as { videos: { id: string }[] }
    const allowedPackages = JSON.parse(readFileSync(path.join(coreDirectory, "dependencies.json"), "utf8")) as string[]
    expect(boundaryViolations(files, {
      coreRoot: CORE_ROOT,
      allowedPackages,
      forbiddenTokens: forbiddenTokens(catalog.videos.map(video => video.id)),
    })).toEqual([])
  })
})
