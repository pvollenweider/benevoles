// Markdown score table for the Lighthouse CI job (#773), written to the GitHub step summary.
// Reads the manifest.json that `lhci upload --target=filesystem` writes in each form factor's
// folder (lighthouse-reports/mobile, lighthouse-reports/desktop).
//
//   node scripts/lighthouse-summary.mjs lighthouse-reports >> "$GITHUB_STEP_SUMMARY"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

export const CATEGORIES = [
  ["performance", "Performance"],
  ["accessibility", "Accessibility"],
  ["best-practices", "Best Practices"],
  ["seo", "SEO"],
]

/** A 0..1 Lighthouse score as 0..100, or "n/a" when the category did not run. */
export function formatScore(score) {
  return typeof score === "number" ? String(Math.round(score * 100)) : "n/a"
}

/** Path and query of a measured URL: the host is always the local server. */
export function pageLabel(url) {
  const u = new URL(url)
  return u.pathname + u.search
}

/**
 * One row per page and form factor, from the manifests' representative runs.
 * @param {Record<string, Array<{url: string, isRepresentativeRun: boolean, summary: Record<string, number>}>>} manifests
 *   form factor → manifest entries
 */
export function summaryTable(manifests) {
  const header = ["Page", "Form factor", ...CATEGORIES.map(([, label]) => label)]
  const lines = [`| ${header.join(" | ")} |`, `|${header.map(() => "---").join("|")}|`]
  const rows = []
  for (const [formFactor, entries] of Object.entries(manifests)) {
    for (const entry of entries.filter((e) => e.isRepresentativeRun)) {
      rows.push({ page: pageLabel(entry.url), formFactor, summary: entry.summary ?? {} })
    }
  }
  rows.sort((a, b) => a.page.localeCompare(b.page) || a.formFactor.localeCompare(b.formFactor))
  for (const row of rows) {
    const scores = CATEGORIES.map(([key]) => formatScore(row.summary[key]))
    lines.push(`| \`${row.page}\` | ${row.formFactor} | ${scores.join(" | ")} |`)
  }
  if (rows.length === 0) lines.push("| (no report) | | | | | |")
  return ["## Lighthouse", "", ...lines, ""].join("\n")
}

function readManifests(dir) {
  const manifests = {}
  if (!fs.existsSync(dir)) return manifests
  for (const formFactor of fs.readdirSync(dir).sort()) {
    const file = path.join(dir, formFactor, "manifest.json")
    if (fs.existsSync(file)) manifests[formFactor] = JSON.parse(fs.readFileSync(file, "utf8"))
  }
  return manifests
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.stdout.write(summaryTable(readManifests(process.argv[2] ?? "lighthouse-reports")))
}
