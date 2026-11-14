import { describe, it, expect } from "vitest"
import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { installAbortSignalTimeout } from "../browser-polyfills"

/**
 * Browsers the public pages must start on (#1343). Safari before 16.4 refuses two things at parse
 * time, and one refusal stops the whole script: a class « static { } » block, which the build
 * rewrites when package.json's browserslist names an older Safari, and a regular expression with a
 * lookbehind, which no build can rewrite.
 */
const pkg = JSON.parse(readFileSync("package.json", "utf8")) as { browserslist?: string[] }

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return entry.name === "__tests__" || entry.name === "generated" ? [] : sourceFiles(path)
    return /\.(ts|tsx)$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [path] : []
  })
}

describe("browser targets (#1343)", () => {
  it("builds for Safari 15.4 on Mac and iPhone, and keeps the other defaults", () => {
    expect(pkg.browserslist).toEqual(["chrome 111", "edge 111", "firefox 111", "safari 15.4", "ios_saf 15.4"])
  })

  it("states the same Safari version in the documentation page", () => {
    const guide = readFileSync("content/guide/navigateurs-compatibles.md", "utf8")
    expect(guide).toContain("| Safari, sur iPhone, iPad et Mac | 15.4 |")
    for (const name of ["Chrome", "Edge", "Firefox"]) expect(guide).toContain(`| ${name} | 111 |`)
  })

  it("gives AbortSignal.timeout to a browser that lacks it, and leaves a native one alone", async () => {
    const target: { timeout?: (ms: number) => AbortSignal } = {}
    installAbortSignalTimeout(target)
    const signal = target.timeout!(5)
    expect(signal.aborted).toBe(false)
    await new Promise((resolve) => signal.addEventListener("abort", resolve))
    expect(signal.aborted).toBe(true)
    expect((signal.reason as DOMException).name).toBe("TimeoutError")
    const native = { timeout: () => new AbortController().signal }
    const before = native.timeout
    installAbortSignalTimeout(native)
    expect(native.timeout).toBe(before)
  })

  it("has no lookbehind in a regular expression of the application code", () => {
    const lookbehind = ["(?<", "="].join("")
    const negative = ["(?<", "!"].join("")
    const offenders = sourceFiles("src").filter((file) => {
      const text = readFileSync(file, "utf8")
      return text.includes(lookbehind) || text.includes(negative)
    })
    expect(offenders).toEqual([])
  })
})
