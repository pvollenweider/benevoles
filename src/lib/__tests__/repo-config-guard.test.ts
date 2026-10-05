// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import path from "node:path"

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
})
