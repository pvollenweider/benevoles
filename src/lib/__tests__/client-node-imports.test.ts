// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import fs from "fs"
import path from "path"
import { describe, it, expect } from "vitest"

// A client component that reaches a `node:` module, even for a constant, breaks the webpack build
// the video captures use (`next build --webpack`): BlocklistManager took REASON_MAX from
// signup-blocklist.ts, which imports node:crypto. Follows the value imports of every "use client"
// file through src/ and fails on the first `node:` import it meets.

const SRC = path.resolve(__dirname, "../..")
const IMPORT_RE = /^\s*(?:import|export)\s+(?!type\b)(?:[^"';]*?\sfrom\s+)?["']([^"']+)["']/gm

function resolve(from: string, spec: string): string | null {
  const base = spec.startsWith("@/") ? path.join(SRC, spec.slice(2)) : spec.startsWith(".") ? path.resolve(path.dirname(from), spec) : null
  if (!base) return null
  for (const candidate of [base, `${base}.ts`, `${base}.tsx`, path.join(base, "index.ts"), path.join(base, "index.tsx")]) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate
  }
  return null
}

function nodeImportChain(file: string, seen: Set<string>, chain: string[]): string[] | null {
  if (seen.has(file)) return null
  seen.add(file)
  const source = fs.readFileSync(file, "utf8")
  for (const [, spec] of source.matchAll(IMPORT_RE)) {
    if (spec.startsWith("node:")) return [...chain, path.relative(SRC, file), spec]
    const next = resolve(file, spec)
    if (!next || next.includes(`${path.sep}generated${path.sep}`)) continue
    const found = nodeImportChain(next, seen, [...chain, path.relative(SRC, file)])
    if (found) return found
  }
  return null
}

function clientFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) return entry.name === "__tests__" || entry.name === "generated" ? [] : clientFiles(full)
    return /\.tsx?$/.test(entry.name) && /^\s*["']use client["']/m.test(fs.readFileSync(full, "utf8")) ? [full] : []
  })
}

describe("client components", () => {
  it("never reach a node: module through their value imports", () => {
    const offenders = clientFiles(SRC).flatMap((file) => {
      const chain = nodeImportChain(file, new Set(), [])
      return chain ? [chain.join(" → ")] : []
    })
    expect(offenders.join("\n")).toBe("")
  })
})
