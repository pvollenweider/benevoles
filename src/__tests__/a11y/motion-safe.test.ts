import { describe, it, expect } from "vitest"
import { readFileSync, readdirSync } from "node:fs"
import path from "node:path"

// Guard for WCAG 2.3.3 / DESIGN.md §6: any movement (scale effect, animation, rotation transition,
// smooth scrolling) goes through `motion-safe:`, so that « Réduire les animations » in the system
// settings stops it. Colour and opacity transitions are not movement and are not checked.
//
// Fails on, in `src/**/*.tsx`:
// - `active:scale-*` or `hover:scale-*` (any variant chain) without `motion-safe:` in that chain;
// - `animate-*` (except `animate-none`) without `motion-safe:`;
// - `transition-transform` without `motion-safe:`, unless `motion-reduce:transition-none` is on the
//   same line (the same class string);
// - a `"smooth"` scroll behaviour in a file that never reads `prefers-reduced-motion`.
//
// A fast filter on the source; test files are skipped (they quote the classes as fixtures).

const SRC = path.resolve(import.meta.dirname, "../..")

/**
 * Known exceptions, by file and class, each with its reason. Empty since the admin menu chevrons
 * were gated (#590); a fixed one must be removed from here (the test checks).
 */
const ALLOWED: { file: string; token: string; note: string }[] = []

/** Class-like tokens of a line: split on spaces, quotes, backticks and template braces. */
function tokens(line: string): string[] {
  return line.split(/[\s"'`{}()$,]+/).filter(Boolean)
}

/** The movement classes of one line that are not gated by `motion-safe:`. */
function ungatedMotion(line: string): string[] {
  const reduceOff = /(?<![\w-])motion-reduce:transition-none\b/.test(line)
  return tokens(line).filter((token) => {
    const parts = token.split(":")
    const utility = parts[parts.length - 1]
    const variants = parts.slice(0, -1)
    if (variants.includes("motion-safe")) return false
    if (/^-?scale-/.test(utility)) return variants.some((v) => v === "active" || v === "hover" || v.endsWith("-hover"))
    if (/^animate-/.test(utility)) return utility !== "animate-none" && !variants.includes("motion-reduce")
    if (utility === "transition-transform") return !reduceOff && !variants.includes("motion-reduce")
    return false
  })
}

/** A smooth scroll in a file that does not check the reduced-motion preference. */
function ungatedSmoothScroll(source: string): boolean {
  return /behavior\s*:[^,}\n]*["']smooth["']/.test(source) && !source.includes("prefers-reduced-motion")
}

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      return ["generated", "node_modules", "__tests__"].includes(entry.name) ? [] : sourceFiles(full)
    }
    return entry.name.endsWith(".tsx") && !/\.test\.tsx$/.test(entry.name) ? [full] : []
  })
}

describe("ungatedMotion", () => {
  it("flags a scale on press or hover, an animation and a transform transition", () => {
    expect(ungatedMotion('className="bg-blue-600 active:scale-[0.98] transition-all"')).toEqual(["active:scale-[0.98]"])
    expect(ungatedMotion('className="hover:scale-105 group-hover:scale-110"')).toEqual(["hover:scale-105", "group-hover:scale-110"])
    expect(ungatedMotion('className="animate-spin"')).toEqual(["animate-spin"])
    expect(ungatedMotion("className={`transition-transform ${open ? \"rotate-180\" : \"\"}`}")).toEqual(["transition-transform"])
  })

  it("accepts the same classes behind motion-safe, or a transform transition turned off by motion-reduce", () => {
    expect(ungatedMotion('className="motion-safe:active:scale-[0.98] transition-all"')).toEqual([])
    expect(ungatedMotion('className="h-5 w-5 motion-safe:animate-spin animate-none"')).toEqual([])
    expect(ungatedMotion('className="motion-safe:transition-transform"')).toEqual([])
    expect(ungatedMotion('className="transition-transform group-open:rotate-45 motion-reduce:transition-none"')).toEqual([])
  })

  it("ignores scales that do not move on interaction and colour transitions", () => {
    expect(ungatedMotion('className="scale-95 transition-colors focus:ring-2"')).toEqual([])
  })
})

describe("ungatedSmoothScroll", () => {
  it("flags a smooth scroll unless the file reads prefers-reduced-motion", () => {
    expect(ungatedSmoothScroll('el.scrollIntoView({ behavior: "smooth" })')).toBe(true)
    expect(ungatedSmoothScroll(
      'const smooth = matchMedia("(prefers-reduced-motion: no-preference)").matches\nel.scrollIntoView({ behavior: smooth ? "smooth" : "auto" })',
    )).toBe(false)
    expect(ungatedSmoothScroll('el.scrollIntoView({ behavior: "auto" })')).toBe(false)
  })
})

describe("movement is gated by motion-safe in src/**/*.tsx", () => {
  const files = sourceFiles(SRC)
  const rel = (f: string) => path.relative(SRC, f).split(path.sep).join("/")

  it("scans the source", () => {
    expect(files.length).toBeGreaterThan(50)
  })

  it("has no ungated movement class outside the allowlist", () => {
    const offenders = files.flatMap((file) =>
      readFileSync(file, "utf8").split("\n").flatMap((line, i) =>
        ungatedMotion(line)
          .filter((token) => !ALLOWED.some((a) => a.file === rel(file) && a.token === token))
          .map((token) => `${rel(file)}:${i + 1} ${token}`),
      ),
    )
    expect(offenders).toEqual([])
  })

  it("has no smooth scroll without a reduced-motion check", () => {
    expect(files.filter((f) => ungatedSmoothScroll(readFileSync(f, "utf8"))).map(rel)).toEqual([])
  })

  it("every allowlist entry still matches, so the list cannot go stale", () => {
    for (const a of ALLOWED) {
      const source = readFileSync(path.join(SRC, a.file), "utf8")
      expect(source.split("\n").some((line) => ungatedMotion(line).includes(a.token)), `${a.file}: ${a.note}`).toBe(true)
    }
  })
})
