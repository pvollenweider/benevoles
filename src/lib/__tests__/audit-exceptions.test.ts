// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { readFileSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"
import { AUDIT_EXCEPTIONS, MAX_EXCEPTION_DAYS, advisoryId, auditAdvisories, auditExceptionProblems, auditVerdict, type AuditException } from "../audit-exceptions"

// The shape `npm audit --omit=dev --json` gave on 17 November 2026: the advisory is on picomatch,
// the three packages above it only name what they depend on.
const picomatch = {
  source: 1114951,
  name: "picomatch",
  dependency: "picomatch",
  title: "picomatch vulnerable to ReDoS through single-branch repeated extglobs",
  url: "https://github.com/advisories/GHSA-fc5q-39xc-vjpf",
  severity: "high",
  range: "<=4.0.7",
}
const report = {
  vulnerabilities: {
    "@rollup/plugin-commonjs": { severity: "high", via: ["@rollup/pluginutils", "picomatch"] },
    "@rollup/pluginutils": { severity: "high", via: ["picomatch"] },
    "@sentry/nextjs": { severity: "high", via: ["@rollup/plugin-commonjs"] },
    picomatch: { severity: "high", via: [picomatch] },
  },
}
const exception: AuditException = {
  id: "GHSA-fc5q-39xc-vjpf",
  package: "picomatch",
  reason: "No fixed version; only build tooling matches file names with it, on patterns from configuration.",
  added: "2026-11-17",
  until: "2026-12-17",
}
const other = { name: "left-pad", title: "Something else", url: "https://github.com/advisories/GHSA-aaaa-bbbb-cccc", severity: "critical" }

describe("auditAdvisories", () => {
  it("lists each advisory once, whatever the number of packages that depend on it", () => {
    expect(auditAdvisories(report)).toEqual([
      { id: "GHSA-fc5q-39xc-vjpf", package: "picomatch", severity: "high", title: picomatch.title, url: picomatch.url },
    ])
  })

  it("reads the advisory id from its address, and keeps an address of another form whole", () => {
    expect(advisoryId("https://github.com/advisories/GHSA-fc5q-39xc-vjpf")).toBe("GHSA-fc5q-39xc-vjpf")
    expect(advisoryId("https://example.org/advisory/42")).toBe("https://example.org/advisory/42")
  })

  it("is empty for a clean report", () => {
    expect(auditAdvisories({ vulnerabilities: {} })).toEqual([])
    expect(auditAdvisories({})).toEqual([])
  })
})

describe("auditVerdict", () => {
  it("blocks a high advisory without exception", () => {
    const v = auditVerdict(report, [], "2026-11-17")
    expect(v.blocking.map((a) => a.id)).toEqual(["GHSA-fc5q-39xc-vjpf"])
    expect(v.excused).toEqual([])
  })

  it("lets a listed advisory through until its last day included, and names it", () => {
    for (const today of ["2026-11-17", "2026-12-17"]) {
      const v = auditVerdict(report, [exception], today)
      expect(v.blocking).toEqual([])
      expect(v.expired).toEqual([])
      expect(v.excused.map((x) => x.advisory.id)).toEqual(["GHSA-fc5q-39xc-vjpf"])
    }
  })

  it("fails again the day after the exception ends", () => {
    const v = auditVerdict(report, [exception], "2026-12-18")
    expect(v.excused).toEqual([])
    expect(v.expired.map((x) => x.advisory.id)).toEqual(["GHSA-fc5q-39xc-vjpf"])
  })

  it("an exception covers its own advisory and package, nothing else", () => {
    const both = { vulnerabilities: { ...report.vulnerabilities, "left-pad": { via: [other] } } }
    const v = auditVerdict(both, [exception], "2026-11-17")
    expect(v.blocking.map((a) => a.id)).toEqual(["GHSA-aaaa-bbbb-cccc"])
    expect(v.excused).toHaveLength(1)

    // Another advisory on the same package is not covered.
    const second = { vulnerabilities: { picomatch: { via: [picomatch, { ...picomatch, url: "https://github.com/advisories/GHSA-dddd-eeee-ffff", title: "Another" }] } } }
    expect(auditVerdict(second, [exception], "2026-11-17").blocking.map((a) => a.id)).toEqual(["GHSA-dddd-eeee-ffff"])

    // The same advisory reported on another package is not covered either.
    const elsewhere = { vulnerabilities: { micromatch: { via: [{ ...picomatch, name: "micromatch" }] } } }
    expect(auditVerdict(elsewhere, [exception], "2026-11-17").blocking.map((a) => a.package)).toEqual(["micromatch"])
  })

  it("ignores moderate and low advisories, as the check always did", () => {
    const moderate = { vulnerabilities: { picomatch: { via: [{ ...picomatch, severity: "moderate" }] } } }
    const v = auditVerdict(moderate, [], "2026-11-17")
    expect(v.blocking).toEqual([])
  })

  it("says when an exception is no longer needed", () => {
    expect(auditVerdict({ vulnerabilities: {} }, [exception], "2026-11-17").unused).toEqual([exception])
    expect(auditVerdict(report, [exception], "2026-11-17").unused).toEqual([])
  })
})

describe("auditExceptionProblems", () => {
  it("accepts a dated, bounded, explained exception", () => {
    expect(auditExceptionProblems([exception])).toEqual([])
  })

  it("refuses an exception without an end, too long, unexplained, or not about one advisory", () => {
    expect(auditExceptionProblems([{ ...exception, until: "" }])).toHaveLength(1)
    expect(auditExceptionProblems([{ ...exception, until: "2027-01-31" }])[0]).toContain(`${MAX_EXCEPTION_DAYS} days at most`)
    expect(auditExceptionProblems([{ ...exception, until: "2026-11-01" }])[0]).toContain("before added")
    expect(auditExceptionProblems([{ ...exception, reason: "build only" }])[0]).toContain("reason")
    expect(auditExceptionProblems([{ ...exception, id: "picomatch" }])[0]).toContain("advisory id")
    expect(auditExceptionProblems([{ ...exception, package: " " }])[0]).toContain("no package")
    expect(auditExceptionProblems([exception, { ...exception }])[0]).toContain("listed twice")
  })
})

describe("the list in force", () => {
  it("has only dated, bounded, explained exceptions", () => {
    expect(auditExceptionProblems(AUDIT_EXCEPTIONS)).toEqual([])
  })

  it("is the only way around the check: CI runs the script, not a bare npm audit", () => {
    const ci = readFileSync(path.join(__dirname, "..", "..", "..", ".github", "workflows", "ci.yml"), "utf-8")
    expect(ci).toContain("scripts/check-prod-audit.mjs")
    expect(ci).not.toMatch(/run:\s*npm audit/)
  })
})
