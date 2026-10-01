import { describe, it, expect } from "vitest"
import { readFileSync, readdirSync } from "node:fs"
import path from "node:path"

// Guard for WCAG 2.4.7 / 1.4.11 in forced colours (Windows Contrast themes). There, box-shadow is
// dropped, so a `focus:ring-*` alone shows nothing. In Tailwind 4, `outline-none` is only
// `outline-style: none`, while `outline-hidden` adds a transparent outline under
// `@media (forced-colors: active)` that the system repaints in its focus colour. A control whose
// focus indicator is a ring must therefore use `focus:outline-hidden`.
// Exception: elements with tabIndex={-1} only take focus from code (headings, <main>, status
// paragraphs). They are not UI components for 2.4.7 and keep `focus:outline-none`, otherwise every
// route change would draw a box around the heading in forced colours.

const SRC = path.resolve(import.meta.dirname, "../..")
const RING = /\b(?:focus|focus-visible):ring-/

/** Lines (1-based) that hide the outline on focus while relying on a ring, outside code-focus targets. */
function forcedColorsFocusViolations(source: string): number[] {
  const hits: number[] = []
  source.split("\n").forEach((line, i) => {
    if (line.includes("focus:outline-none") && RING.test(line) && !line.includes("tabIndex={-1}")) hits.push(i + 1)
  })
  return hits
}

function tsxFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) return entry.name === "generated" || entry.name === "node_modules" ? [] : tsxFiles(full)
    return entry.name.endsWith(".tsx") ? [full] : []
  })
}

describe("forcedColorsFocusViolations", () => {
  it("flags a control combining focus:outline-none with a focus ring", () => {
    expect(forcedColorsFocusViolations(`a\n<input className="focus:outline-none focus:ring-2 focus:ring-blue-500" />`)).toEqual([2])
  })

  it("flags a focus-visible ring too", () => {
    expect(forcedColorsFocusViolations(`<div tabIndex={0} className="focus:outline-none focus-visible:ring-2" />`)).toEqual([1])
  })

  it("accepts focus:outline-hidden with a ring", () => {
    expect(forcedColorsFocusViolations(`<input className="focus:outline-hidden focus:ring-2 focus:ring-blue-500" />`)).toEqual([])
  })

  it("accepts focus:outline-none on a code-focus target (tabIndex={-1})", () => {
    expect(forcedColorsFocusViolations(`<p tabIndex={-1} className="focus:outline-none focus-visible:ring-2" />`)).toEqual([])
    expect(forcedColorsFocusViolations(`<h1 tabIndex={-1} className="focus:outline-none" />`)).toEqual([])
  })
})

describe("focus indicator survives forced colours", () => {
  it("no .tsx file hides the outline of a ring-focused control with focus:outline-none", () => {
    const offenders = tsxFiles(SRC).flatMap((file) =>
      forcedColorsFocusViolations(readFileSync(file, "utf8")).map((line) => `${path.relative(SRC, file)}:${line}`),
    )
    expect(offenders, `use focus:outline-hidden instead of focus:outline-none on:\n${offenders.join("\n")}`).toEqual([])
  })

  it("globals.css gives .input:focus a transparent outline in forced colours", () => {
    const css = readFileSync(path.join(SRC, "app/globals.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "")
    expect(css).toMatch(
      /@media\s*\(forced-colors:\s*active\)\s*\{\s*\.input:focus\s*\{[^}]*outline:\s*2px solid transparent;[^}]*outline-offset:\s*2px;/,
    )
  })
})
