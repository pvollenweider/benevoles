import { test, type Page } from "@playwright/test"
import fs from "node:fs"
import path from "node:path"

/**
 * axe-core in the page (#487): serious and critical violations of WCAG 2.x A/AA rules. Automated
 * checks see only part of the problems; they guard against regressions on the critical paths.
 */
// Resolved from the project root (the tests run there), whatever the module format of this file.
const axeSource = fs.readFileSync(path.join(process.cwd(), "node_modules", "axe-core", "axe.min.js"), "utf-8")

export type AxeViolation = { id: string; impact: string | null; help: string; nodes: { target: string[] }[] }

/** Serious and critical violations (the gate); moderate / minor ones and « incomplete » are attached to the report. */
export async function seriousViolations(page: Page): Promise<string[]> {
  await page.addScriptTag({ content: axeSource })
  const violations = await page.evaluate(async () => {
    const axe = (window as unknown as { axe: { run: (ctx: Document, opts: unknown) => Promise<unknown> } }).axe
    const result = await axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"] } }) as unknown as { violations: AxeViolation[]; incomplete: AxeViolation[] }
    return result.violations.concat(result.incomplete.map((v) => ({ ...v, impact: "incomplete" })))
  })
  const others = violations.filter((v) => v.impact !== "serious" && v.impact !== "critical")
  if (others.length > 0) {
    test.info().annotations.push({ type: "axe-other", description: `${page.url()}: ${others.map((v) => `${v.id} (${v.impact})`).join(", ")}` })
  }
  return violations
    .filter((v) => v.impact === "serious" || v.impact === "critical")
    .map((v) => `${v.id} (${v.impact}): ${v.help} — ${v.nodes.slice(0, 3).map((n) => n.target.join(" ")).join(", ")}`)
}
