import { describe, it, expect } from "vitest"
import { readFileSync, readdirSync } from "node:fs"
import path from "node:path"
import ts from "typescript"

// Guard for WCAG 2.2 SC 1.4.11 Non-text Contrast on form controls (#1123). The border is what
// identifies an input, a select, a textarea or the shift combobox at rest: it needs 3:1 against
// the surface around it. `border-gray-300` (#d1d5db) is 1.47:1 on white, `gray-200` 1.24:1,
// `gray-400` 2.60:1. DESIGN.md « Bordure Input » is `gray-500` (#6b7280: 4.83:1 on white, 4.63:1 on
// gray-50), `dark:border-gray-400` in the dark theme of the content pages (5.6:1 on gray-800).
//
// The scan follows each control's className through string literals, template parts, local
// constants and helper functions of the same file, so a class built in `inputClass(...)` is
// checked too. Controls: <input>, <select>, <textarea> and any element whose role is combobox,
// switch, checkbox, radio, slider, spinbutton or textbox. A control drawn invisible
// (`appearance-none`, `opacity-0`, `sr-only`) shows the border of its parent element (a pill
// label), so that parent is checked instead. Interaction and disabled variants (`hover:`, `focus:`,
// `disabled:`…) are ignored: a disabled control is exempt from 1.4.11 and a focus state has its own
// indicator; every other variant (`sm:`, `aria-checked:`…) applies at rest and is checked.
// Decorative borders (cards, dividers, popover panels) are not form controls and are not scanned.
// Test files are skipped.

const CONTROL_TAGS = new Set(["input", "select", "textarea"])
const CONTROL_ROLES = new Set(["combobox", "switch", "checkbox", "radio", "slider", "spinbutton", "textbox"])
const IGNORED_VARIANTS = /^(?:hover|focus|focus-visible|focus-within|active|disabled|aria-disabled|group-hover|peer-hover|group-focus|peer-focus|has-focus-visible|forced-colors|placeholder)$/
const BORDER = /^!?border(?:-[trblxyse])?-([a-z]+)-(\d+)(?:\/\d+)?!?$/
const NEUTRALS = new Set(["gray", "slate", "zinc", "neutral", "stone"])

/** Whether one class token is a border too light for a control boundary at rest. */
function isLightBorder(token: string): boolean {
  const parts = token.split(":")
  const m = parts.pop()!.match(BORDER)
  if (!m || parts.some((v) => IGNORED_VARIANTS.test(v))) return false
  const [, hue, shadeText] = m
  const shade = Number(shadeText)
  if (parts.includes("dark")) return NEUTRALS.has(hue) && shade >= 500 // on gray-800 / gray-900: gray-400 or lighter
  if (NEUTRALS.has(hue)) return shade <= 400
  return ["amber", "blue", "red", "green", "yellow", "orange", "purple"].includes(hue) && shade <= 300
}

/** Light border classes found in the className of the form controls of one TSX source. */
function lightControlBorders(source: string, fileName = "file.tsx"): { line: number; classes: string[] }[] {
  const sf = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const decls = new Map<string, ts.Node>()
  const collect = (n: ts.Node) => {
    if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.initializer) decls.set(n.name.text, n.initializer)
    if (ts.isFunctionDeclaration(n) && n.name && n.body) decls.set(n.name.text, n.body)
    ts.forEachChild(n, collect)
  }
  collect(sf)

  const literals = new Set<ts.Node>()
  const gather = (e: ts.Node, seen: Set<string>, into: Set<ts.Node> = literals) => {
    if (ts.isStringLiteral(e) || ts.isNoSubstitutionTemplateLiteral(e) || ts.isTemplateHead(e) || ts.isTemplateMiddle(e) || ts.isTemplateTail(e)) {
      into.add(e)
      return
    }
    if (ts.isIdentifier(e)) {
      const decl = decls.get(e.text)
      if (decl && !seen.has(e.text)) {
        seen.add(e.text)
        gather(decl, seen, into)
      }
      return
    }
    ts.forEachChild(e, (c) => gather(c, seen, into))
  }

  const attr = (attrs: ts.JsxAttribute[], name: string) => attrs.find((a) => a.name.getText(sf) === name)?.initializer
  const visit = (n: ts.Node) => {
    if (ts.isJsxOpeningElement(n) || ts.isJsxSelfClosingElement(n)) {
      const tag = n.tagName.getText(sf)
      const attrs = n.attributes.properties.filter(ts.isJsxAttribute)
      const role = attr(attrs, "role")?.getText(sf).replace(/[{}"'`\s]/g, "")
      const isControl = CONTROL_TAGS.has(tag) || (role !== undefined && CONTROL_ROLES.has(role))
      const hiddenInput = attr(attrs, "type")?.getText(sf) === '"hidden"'
      const className = attr(attrs, "className")
      if (isControl && !hiddenInput && className) {
        const own = new Set<ts.Node>()
        gather(className, new Set(), own)
        own.forEach((l) => literals.add(l))
        if ([...own].some((l) => /(?:^|[\s"'`])(?:appearance-none|opacity-0|sr-only)(?=[\s"'`]|$)/.test(l.getText(sf)))) {
          let up: ts.Node | undefined = ts.isJsxOpeningElement(n) ? n.parent.parent : n.parent
          while (up && !ts.isJsxElement(up)) up = up.parent
          const parentClass = up ? attr(up.openingElement.attributes.properties.filter(ts.isJsxAttribute), "className") : undefined
          if (parentClass) gather(parentClass, new Set())
        }
      }
    }
    ts.forEachChild(n, visit)
  }
  visit(sf)

  return [...literals]
    .map((lit) => {
      const text = lit.getText(sf)
      const classes = text.split(/[\s"'`{}$]+/).filter((t) => t && isLightBorder(t))
      return { line: sf.getLineAndCharacterOfPosition(lit.getStart(sf)).line + 1, classes }
    })
    .filter((r) => r.classes.length > 0)
    .sort((a, b) => a.line - b.line)
}

/** WCAG 2.x contrast ratio of two #rrggbb colours. */
function contrastRatio(a: string, b: string): number {
  const lum = (hex: string) => {
    const [r, g, bl] = [1, 3, 5].map((i) => {
      const c = parseInt(hex.slice(i, i + 2), 16) / 255
      return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
    })
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl
  }
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

describe("lightControlBorders", () => {
  it("flags a light border on an input, a select and a textarea", () => {
    const src = `export const A = () => <>
      <input type="email" className="w-full border border-gray-300 rounded-xl" />
      <select className="border border-gray-200"><option /></select>
      <textarea className="border border-gray-400" />
    </>`
    expect(lightControlBorders(src)).toEqual([
      { line: 2, classes: ["border-gray-300"] },
      { line: 3, classes: ["border-gray-200"] },
      { line: 4, classes: ["border-gray-400"] },
    ])
  })

  it("follows a class constant, a helper function and a template", () => {
    const src = `const inputClass = "w-full border border-gray-300"
      const fieldClass = (bad: boolean) => \`border \${bad ? "border-red-600" : "border-gray-200"}\`
      export const A = ({ bad }: { bad: boolean }) => <>
        <input className={inputClass} />
        <input className={fieldClass(bad)} />
      </>`
    expect(lightControlBorders(src).flatMap((r) => r.classes)).toEqual(["border-gray-300", "border-gray-200"])
  })

  it("flags the trigger of a custom combobox and a weak dark-theme border", () => {
    const src = `export const A = () => <>
      <div role="combobox" tabIndex={0} className="border border-gray-300" />
      <input className="border border-gray-500 dark:border-gray-600" />
    </>`
    expect(lightControlBorders(src).flatMap((r) => r.classes)).toEqual(["border-gray-300", "dark:border-gray-600"])
  })

  it("flags a switch, a role given as an expression, a side border and a resting variant", () => {
    const src = `export const A = () => <>
      <button role="switch" className="border-2 border-gray-300" />
      <div role={"checkbox"} className="border border-slate-200" />
      <input className="border-b border-b-gray-300 sm:border-gray-200 aria-checked:border-zinc-300/50" />
    </>`
    expect(lightControlBorders(src).flatMap((r) => r.classes)).toEqual([
      "border-gray-300", "border-slate-200", "border-b-gray-300", "sm:border-gray-200", "aria-checked:border-zinc-300/50",
    ])
  })

  it("checks the parent of an invisible radio (pill label)", () => {
    const src = `export const A = () => (
      <label className="rounded-full border border-gray-300">
        <input type="radio" className="absolute inset-0 appearance-none opacity-0" />
        Bleu
      </label>
    )`
    expect(lightControlBorders(src).flatMap((r) => r.classes)).toEqual(["border-gray-300"])
  })

  it("accepts the token, an error border, variants and decorative borders", () => {
    const src = `export const A = () => <div className="rounded-2xl border border-gray-200">
      <input className="border border-gray-500 dark:border-gray-400 disabled:border-gray-200 hover:border-gray-400" />
      <input className="border border-red-600" />
      <input className="input" />
      <input type="hidden" className="border-gray-300" />
      <hr className="border-gray-200" />
    </div>`
    expect(lightControlBorders(src)).toEqual([])
  })
})

describe("form-control borders reach 3:1 (WCAG 1.4.11, #1123)", () => {
  const root = path.resolve(import.meta.dirname, "../../..")
  const sourceFiles = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) return ["__tests__", "generated", "node_modules"].includes(entry.name) ? [] : sourceFiles(full)
      return entry.name.endsWith(".tsx") && !/\.test\.tsx$/.test(entry.name) ? [full] : []
    })
  const files = sourceFiles(path.join(root, "src"))
  const rel = (f: string) => path.relative(root, f).split(path.sep).join("/")

  it("scans the app source", () => {
    expect(files.length).toBeGreaterThan(100)
  })

  it("has no light border on an input, select, textarea or combobox", () => {
    const offenders = files.flatMap((file) =>
      lightControlBorders(readFileSync(file, "utf8"), file).map((r) => `${rel(file)}:${r.line} ${r.classes.join(" ")}`),
    )
    expect(offenders).toEqual([])
  })

  it("gives the global .input class a border of at least 3:1 on white and gray-50", () => {
    const css = readFileSync(path.join(root, "src/app/globals.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "")
    const block = css.match(/(?:^|\n)\.input\s*\{([^}]*)\}/)?.[1] ?? ""
    const colour = block.match(/border:\s*1px solid (#[0-9a-fA-F]{6})/)?.[1]
    expect(colour).toBeDefined()
    expect(contrastRatio(colour!, "#ffffff")).toBeGreaterThanOrEqual(3)
    expect(contrastRatio(colour!, "#f9fafb")).toBeGreaterThanOrEqual(3)
  })

  it("keeps an invalid field apart from the resting border by weight, not hue alone", () => {
    const css = readFileSync(path.join(root, "src/app/globals.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "")
    expect(css).toMatch(/\[aria-invalid="true"\]:not\(:focus\)\s*\{\s*box-shadow:\s*0 0 0 1px #dc2626;/)
    // Why: red-600 and the gray-500 border have the same lightness.
    expect(contrastRatio("#dc2626", "#6b7280")).toBeLessThan(1.1)
  })

  it("measures the ratios DESIGN.md quotes", () => {
    expect(contrastRatio("#d1d5db", "#ffffff")).toBeCloseTo(1.47, 2)
    expect(contrastRatio("#6b7280", "#ffffff")).toBeCloseTo(4.83, 2)
    expect(contrastRatio("#6b7280", "#f9fafb")).toBeCloseTo(4.63, 2)
  })
})
