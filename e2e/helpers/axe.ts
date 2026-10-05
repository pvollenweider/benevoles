import { AxeBuilder } from "@axe-core/playwright"
import { test, type Page } from "@playwright/test"

/**
 * axe-core on the page (#487), run by `@axe-core/playwright` (#591): serious and critical
 * violations of WCAG 2.x A/AA rules. Automated checks see only part of the problems; they guard
 * against regressions on the critical paths.
 *
 * AxeBuilder injects axe-core with Playwright's evaluate into every frame of the page (iframes
 * included) instead of a `<script>` tag, so a Content Security Policy does not block it.
 */

/** WCAG 2.0, 2.1 and 2.2, levels A and AA. Changing them changes what ACCESSIBILITE.md may claim. */
export const AXE_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]

/**
 * Rules switched off for every scan, rule id → reason. Only for a rule that reports something
 * that is not a defect of the page (a false positive confirmed by hand); a real defect is fixed,
 * not listed here. Mirror any change in docs/accessibilite.md (« Tests automatiques »).
 */
export const DISABLED_RULES: Readonly<Record<string, string>> = {}

/**
 * Iframes sandboxed without `allow-scripts` (the email previews): no script runs in them, axe
 * included, and trying to inject it there stalls the whole scan. Their content (the email HTML) is
 * left out; the `<iframe>` element itself (its title) is still checked, in a second pass that does
 * not enter it.
 */
const SCRIPTLESS_FRAMES = "iframe[sandbox]:not([sandbox~='allow-scripts'])"

type AxeResultLike = { id: string; impact?: string | null; help: string; nodes: { target: unknown[] }[] }

/** Selectors limiting the scan (CSS, or an axe-core frame selector such as `["iframe", "main"]`). */
export type AxeScope = {
  /** Scan only these regions (default: the whole page, iframes included). */
  include?: string | string[] | string[][]
  /** Leave these regions out, e.g. third-party content outside the public statement. */
  exclude?: string | string[] | string[][]
}

/** A string or an array of strings is one or several CSS selectors; an array of arrays is a list of frame selectors. */
function selectors(v: AxeScope["include"]): (string | string[])[] {
  if (v === undefined) return []
  return Array.isArray(v) ? v : [v]
}

function axe(page: Page, enterIframes: boolean): AxeBuilder {
  const builder = new AxeBuilder({ page }).options({ iframes: enterIframes }).withTags(AXE_TAGS)
  const disabled = Object.keys(DISABLED_RULES)
  return disabled.length > 0 ? builder.disableRules(disabled) : builder
}

/** Serious and critical violations (the gate); moderate / minor ones and « incomplete » are attached to the report. */
export async function seriousViolations(page: Page, scope: AxeScope = {}): Promise<string[]> {
  const main = axe(page, true).exclude(SCRIPTLESS_FRAMES)
  for (const s of selectors(scope.include)) main.include(s)
  for (const s of selectors(scope.exclude)) main.exclude(s)
  const results = [await main.analyze()]

  // The script-less iframes as elements only, when the scan covers the whole page. Legacy mode
  // (one axe.run in the page, `iframes: false`): the default mode would still try to inject axe
  // into them and stall.
  if (scope.include === undefined && (await page.locator(SCRIPTLESS_FRAMES).count()) > 0) {
    const frames = axe(page, false).setLegacyMode().include(SCRIPTLESS_FRAMES)
    for (const s of selectors(scope.exclude)) frames.exclude(s)
    results.push(await frames.analyze())
  }

  const violations: AxeResultLike[] = results.flatMap((r) => [
    ...r.violations,
    ...r.incomplete.map((v) => ({ ...v, impact: "incomplete" })),
  ])
  const others = violations.filter((v) => v.impact !== "serious" && v.impact !== "critical")
  if (others.length > 0) {
    test.info().annotations.push({ type: "axe-other", description: `${page.url()}: ${others.map((v) => `${v.id} (${v.impact})`).join(", ")}` })
  }
  return violations
    .filter((v) => v.impact === "serious" || v.impact === "critical")
    .map((v) => `${v.id} (${v.impact}): ${v.help} — ${v.nodes.slice(0, 3).map((n) => n.target.map(String).join(" ")).join(", ")}`)
}
