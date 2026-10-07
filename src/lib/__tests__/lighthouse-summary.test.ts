import { describe, it, expect } from "vitest"
import { formatScore, pageLabel, summaryTable } from "../../../scripts/lighthouse-summary.mjs"

// Score table of the Lighthouse CI job (#773), built from `lhci upload --target=filesystem`.
describe("lighthouse summary", () => {
  it("formats a 0..1 score as a 0..100 integer, n/a when missing", () => {
    expect(formatScore(1)).toBe("100")
    expect(formatScore(0.876)).toBe("88")
    expect(formatScore(0)).toBe("0")
    expect(formatScore(null)).toBe("n/a")
    expect(formatScore(undefined)).toBe("n/a")
  })

  it("labels a page by its path and query, so organisation pages stay distinct", () => {
    expect(pageLabel("http://localhost:3100/")).toBe("/")
    expect(pageLabel("http://localhost:3100/?org=default")).toBe("/?org=default")
    expect(pageLabel("http://localhost:3100/doc/admin")).toBe("/doc/admin")
  })

  it("keeps only representative runs, sorted by page then form factor", () => {
    const summary = { performance: 0.9, accessibility: 1, "best-practices": 0.96, seo: 0.92 }
    const table = summaryTable({
      mobile: [
        { url: "http://localhost:3100/doc", isRepresentativeRun: true, summary },
        { url: "http://localhost:3100/doc", isRepresentativeRun: false, summary: { performance: 0.1 } },
        { url: "http://localhost:3100/", isRepresentativeRun: true, summary },
      ],
      desktop: [{ url: "http://localhost:3100/", isRepresentativeRun: true, summary: { performance: 1 } }],
    })
    const rows = table.split("\n").filter((l) => l.startsWith("| `"))
    expect(rows).toEqual([
      "| `/` | desktop | 100 | n/a | n/a | n/a |",
      "| `/` | mobile | 90 | 100 | 96 | 92 |",
      "| `/doc` | mobile | 90 | 100 | 96 | 92 |",
    ])
  })

  it("says so when there is no report", () => {
    expect(summaryTable({})).toContain("(no report)")
  })
})
