import { describe, it, expect } from "vitest"
import { readFileSync, readdirSync } from "node:fs"
import path from "node:path"

// Guard for WCAG 2.4.7 / 1.4.11 in forced colours (Windows Contrast themes), #579 (follow-up of #574).
// There, box-shadow is dropped, so a `ring-*` or `shadow-*` focus indicator shows nothing. In
// Tailwind 4, `outline-none` is only `outline-style: none`, while `outline-hidden` adds a
// transparent outline under `@media (forced-colors: active)` that the system repaints in its own
// colour. Nothing changes in normal display.
//
// Rule (an allowlist, same wording as DESIGN.md §4 and docs/accessibilite.md): `outline-none`, with
// any variant prefix (`focus:`, `focus-visible:`, none…), is allowed only on a code-focus target,
// an element with `tabIndex={-1}` within 3 lines of the class. Every other element uses
// `outline-hidden` (or keeps its native outline).
// Why tabIndex={-1} is the only exception: such elements (page heading, <main>, a result or status
// paragraph) never take keyboard focus, only programmatic focus after an action. They are not
// controls for 2.4.7, and drawing a box around a heading after every route change would be noise.
// Exception to the exception: a code-focus target that shows a `focus-visible:ring-*` in normal
// display (the import result and summary paragraphs of ImportModal) also takes
// `focus-visible:outline-hidden`, so that it keeps an indicator in forced colours.
//
// This is a fast first filter on the source. The rendered check is the Chromium e2e spec
// `e2e/forced-colors-focus.spec.ts`. Test files are skipped: they quote the classes as fixtures.

const SRC = path.resolve(import.meta.dirname, "../..")
const OUTLINE_NONE = /(?<![\w-])outline-none\b/
const CODE_FOCUS = "tabIndex={-1}"
const WINDOW = 3

/** Lines (1-based) using `outline-none` with no `tabIndex={-1}` within ±3 lines. */
function outlineNoneOutsideCodeFocus(source: string): number[] {
  const lines = source.split("\n")
  return lines.flatMap((line, i) =>
    OUTLINE_NONE.test(line) &&
    !lines.slice(Math.max(0, i - WINDOW), i + WINDOW + 1).some((w) => w.includes(CODE_FOCUS))
      ? [i + 1]
      : [],
  )
}

/** Selectors of the CSS blocks that set `outline: none` (comments stripped, innermost blocks only). */
function cssOutlineNoneSelectors(css: string): string[] {
  const clean = css.replace(/\/\*[\s\S]*?\*\//g, "")
  return [...clean.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .filter(([, , body]) => /(?:^|[;\s{])outline\s*:\s*none\b/.test(body))
    .map(([, selector]) => selector.trim())
}

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      return ["generated", "node_modules", "__tests__"].includes(entry.name) ? [] : sourceFiles(full)
    }
    return /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [full] : []
  })
}

describe("outlineNoneOutsideCodeFocus", () => {
  it("flags outline-none with a focus ring on a keyboard control", () => {
    expect(outlineNoneOutsideCodeFocus(`a\n<input className="focus:outline-none focus:ring-2 focus:ring-blue-500" />`)).toEqual([2])
  })

  it("flags every variant prefix, and a bare outline-none", () => {
    expect(outlineNoneOutsideCodeFocus(`<div tabIndex={0} className="focus-visible:outline-none focus-visible:ring-2" />`)).toEqual([1])
    expect(outlineNoneOutsideCodeFocus(`<button className="outline-none focus:shadow-md" />`)).toEqual([1])
    expect(outlineNoneOutsideCodeFocus(`const cls = "hover:focus:outline-none"`)).toEqual([1])
  })

  it("flags outline-none whose ring lives on another line (clsx, template literal, constant)", () => {
    const src = [
      `const base = clsx(`,
      `  "rounded-xl border",`,
      `  "focus:outline-none",`,
      `  "focus:ring-2 focus:ring-blue-500",`,
      `)`,
    ].join("\n")
    expect(outlineNoneOutsideCodeFocus(src)).toEqual([3])
  })

  it("accepts outline-hidden, and does not mistake other utilities for outline-none", () => {
    expect(outlineNoneOutsideCodeFocus(`<input className="focus:outline-hidden focus:ring-2" />`)).toEqual([])
    expect(outlineNoneOutsideCodeFocus(`<a className="focus-visible:outline-2 my-outline-none-x" />`)).toEqual([])
  })

  it("accepts outline-none on a code-focus target, tabIndex={-1} within 3 lines", () => {
    expect(outlineNoneOutsideCodeFocus(`<h1 tabIndex={-1} className="focus:outline-none" />`)).toEqual([])
    expect(outlineNoneOutsideCodeFocus(`<h2\n  ref={ref}\n  tabIndex={-1}\n  className="focus:outline-none"\n/>`)).toEqual([])
    expect(
      outlineNoneOutsideCodeFocus(`<p tabIndex={-1} className="focus:outline-none focus-visible:outline-hidden focus-visible:ring-2" />`),
    ).toEqual([])
  })

  it("rejects tabIndex={-1} further than 3 lines away", () => {
    expect(outlineNoneOutsideCodeFocus(`<h2 tabIndex={-1}\n\n\n\n className="focus:outline-none" />`)).toEqual([5])
  })
})

describe("cssOutlineNoneSelectors", () => {
  it("lists the selectors of blocks that set outline: none, ignoring comments", () => {
    expect(cssOutlineNoneSelectors(`/* a { outline: none } */\n.input { outline: none; }\n.x:focus{outline:none}`)).toEqual([".input", ".x:focus"])
    expect(cssOutlineNoneSelectors(`.input { outline-offset: 2px; outline: 2px solid transparent }`)).toEqual([])
  })
})

describe("focus indicator survives forced colours", () => {
  it("no source file uses outline-none outside a tabIndex={-1} code-focus target", () => {
    const offenders = sourceFiles(SRC).flatMap((file) =>
      outlineNoneOutsideCodeFocus(readFileSync(file, "utf8")).map((line) => `src/${path.relative(SRC, file)}:${line}`),
    )
    expect(offenders, `use outline-hidden instead of outline-none (or tabIndex={-1} on a code-focus target):\n${offenders.join("\n")}`).toEqual([])
  })

  it("globals.css sets outline: none only on .input, compensated in forced colours", () => {
    const css = readFileSync(path.join(SRC, "app/globals.css"), "utf8")
    expect(cssOutlineNoneSelectors(css)).toEqual([".input"])
    expect(css.replace(/\/\*[\s\S]*?\*\//g, "")).toMatch(
      /@media\s*\(forced-colors:\s*active\)\s*\{\s*\.input:focus\s*\{[^}]*outline:\s*2px solid transparent;[^}]*outline-offset:\s*2px;/,
    )
  })
})
