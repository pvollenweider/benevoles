// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import path from "node:path"
import { execFileSync } from "node:child_process"

const read = (f: string) => readFileSync(path.join(process.cwd(), f), "utf8")

// A three-way merge of an old working copy (#676) once silently dropped the isolated e2e stacks
// from the Makefile and the ignore rule for their env files. Both are infrastructure several
// workflows rely on (#581), so their absence must fail loudly.
describe("repository configuration guard", () => {
  it("keeps the isolated e2e stacks in the Makefile (#581)", () => {
    const makefile = read("Makefile")
    expect(makefile).toMatch(/^E2E_SLOT \?= 0$/m)
    expect(makefile).toMatch(/E2E_ENV_FILE := /)
    expect(makefile).toMatch(/^e2e-setup: /m)
  })

  it("keeps every target defined once", () => {
    const targets = [...read("Makefile").matchAll(/^([a-z][a-z0-9-]*):(?!=)/gm)].map((m) => m[1])
    const duplicates = targets.filter((t, i) => targets.indexOf(t) !== i)
    expect(duplicates).toEqual([])
  })

  it("ignores the per-slot e2e env files, which hold generated secrets", () => {
    expect(read(".gitignore")).toMatch(/^\.env\.e2e\.\*$/m)
  })

  it("ignores every env file Next.js loads by itself, never the committed templates", () => {
    const ignored = (f: string) => {
      try {
        execFileSync("git", ["check-ignore", "-q", "--no-index", f], { stdio: "ignore" })
        return true
      } catch {
        return false
      }
    }
    for (const f of [".env", ".env.local", ".env.development", ".env.production", ".env.test", ".env.development.local", ".env.production.local"]) {
      expect(ignored(f), f).toBe(true)
    }
    for (const f of [".env.example", ".env.development.example"]) expect(ignored(f), f).toBe(false)
    // The image never receives any of them either.
    expect(read(".dockerignore")).toMatch(/^\.env\.\*$/m)
  })

  it("excludes assistant worktrees and the Next build output from test discovery", () => {
    const config = read("vitest.config.mts")
    expect(config).toContain('"**/.claude/**"')
    expect(config).toContain('"**/.next/**"')
  })

  it("checks the Node version before every development, test, type-check, build and lint script", () => {
    const pkg = JSON.parse(read("package.json")) as { scripts: Record<string, string> }
    for (const name of ["predev", "pretest", "pretest:coverage", "pretypecheck", "prebuild", "prelint", "pretest:e2e"]) {
      expect(pkg.scripts[name], name).toContain("scripts/check-node-version.mjs")
    }
  })

  it("pins next-auth exactly while it is a prerelease", () => {
    const pkg = JSON.parse(read("package.json")) as { dependencies: Record<string, string> }
    const spec = pkg.dependencies["next-auth"]
    expect(spec, "next-auth dependency").toBeDefined()
    // A beta accepts the next betas with ^ or ~; they have no compatibility promise.
    if (spec.includes("-")) expect(spec, "a prerelease next-auth must be pinned").toMatch(/^\d+\.\d+\.\d+-/)
    const lock = JSON.parse(read("package-lock.json")) as { packages: Record<string, { version?: string }> }
    expect(lock.packages["node_modules/next-auth"]?.version).toBe(spec.replace(/^[~^]/, ""))
  })

  it("audits production dependencies in the required check job, after installing them", () => {
    const ci = read(".github/workflows/ci.yml")
    const checkJob = ci.match(/^  check:\n([\s\S]*?)(?=^  [a-z][a-z0-9-]*:\s*$)/m)?.[1] ?? ""
    expect(checkJob, "the check job is missing from ci.yml").not.toBe("")
    expect(checkJob).toContain("- name: Production dependencies have no high or critical advisory")
    expect(checkJob).toContain("run: npm audit --omit=dev --audit-level=high")
    const install = checkJob.indexOf("- name: Install dependencies")
    const audit = checkJob.indexOf("- name: Production dependencies have no high or critical advisory")
    expect(install, "Install dependencies is missing from the check job").toBeGreaterThanOrEqual(0)
    expect(audit, "the audit step must come after Install dependencies").toBeGreaterThan(install)
  })
})
