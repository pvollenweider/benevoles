import { describe, it, expect } from "vitest"
import { readFileSync, readdirSync } from "node:fs"
import path from "node:path"

// Guard for DESIGN.md §2 « Encre Fantôme »: `text-gray-400` on white is about 2.5:1, below the
// 4.5:1 floor for text that carries information (#616). DESIGN.md keeps it for decorative elements
// and disabled states only, so it is accepted behind a `dark:`, a `disabled:` / `aria-disabled:`
// variant, or on a line that is `aria-hidden` (decorative glyph).

const ROOTS = ["src/components/admin", "src/app/admin"]

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) return entry.name === "__tests__" ? [] : sourceFiles(full)
    return entry.name.endsWith(".tsx") && !/\.test\.tsx$/.test(entry.name) ? [full] : []
  })
}

/** `text-gray-400` used as plain text colour: not behind `dark:` / `disabled:` / `aria-disabled:`, not on an aria-hidden element. */
function hasUngatedGhostInk(line: string): boolean {
  if (/aria-hidden(=\{?["']?true|\b)/.test(line)) return false
  return /(?<!dark:|disabled:|aria-disabled:)\btext-gray-400\b/.test(line)
}

describe("hasUngatedGhostInk", () => {
  it("flags a plain text-gray-400", () => {
    expect(hasUngatedGhostInk('<p className="text-xs text-gray-400">')).toBe(true)
  })

  it("accepts text-gray-400 gated behind dark:", () => {
    expect(hasUngatedGhostInk('<p className="text-xs dark:text-gray-400">')).toBe(false)
  })

  it("accepts a disabled state and a decorative aria-hidden glyph (DESIGN.md)", () => {
    expect(hasUngatedGhostInk('<button className="text-gray-700 disabled:text-gray-400">')).toBe(false)
    expect(hasUngatedGhostInk('<button className="aria-disabled:text-gray-400">')).toBe(false)
    expect(hasUngatedGhostInk('<span aria-hidden="true" className="text-gray-400">›</span>')).toBe(false)
  })

  it("ignores other shades", () => {
    expect(hasUngatedGhostInk('<p className="text-xs text-gray-600">')).toBe(false)
  })
})

describe("no ungated text-gray-400 in the admin (DESIGN.md « Encre Fantôme », #616)", () => {
  const root = path.resolve(import.meta.dirname, "../../..")
  const files = ROOTS.flatMap((r) => sourceFiles(path.join(root, r)))
  const rel = (f: string) => path.relative(root, f).split(path.sep).join("/")

  it("scans the admin source", () => {
    expect(files.length).toBeGreaterThan(20)
  })

  it("has no text-gray-400 carrying information", () => {
    const offenders = files.flatMap((file) =>
      readFileSync(file, "utf8").split("\n").flatMap((line, i) =>
        (hasUngatedGhostInk(line) ? [`${rel(file)}:${i + 1}`] : []),
      ),
    )
    expect(offenders).toEqual([])
  })
})
