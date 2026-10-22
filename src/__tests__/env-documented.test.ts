// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { readFileSync, readdirSync, statSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

// #761: a self-hosted instance is configured from docs/configuration.md. Every environment variable
// the application's code reads by name must be documented there, so that a new one cannot ship
// without its line.
const ROOT = join(__dirname, "../..")

/** Read by the platform or the build, never set by an operator. */
const NOT_OPERATOR_SETTINGS = new Set(["NODE_ENV", "NEXT_RUNTIME", "CI", "PORT", "APP_VERSION"])

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return ["__tests__", "__integration__", "generated"].includes(name) ? [] : files(path)
    return /\.(ts|tsx|mjs|sh)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : []
  })
}

/**
 * `process.env.NAME`, `env.NAME` and `env["NAME"]` in code; `${NAME}` and `${NAME:-default}` in
 * shell scripts only (in TypeScript the same syntax is a template literal).
 */
function envNamesRead(sources: { text: string; shell: boolean }[]): Set<string> {
  const names = new Set<string>()
  for (const { text, shell } of sources) {
    for (const m of text.matchAll(/\benv(?:\.([A-Z][A-Z0-9_]+)|\["([A-Z][A-Z0-9_]+)"\])/g)) names.add(m[1] ?? m[2])
    if (shell) for (const m of text.matchAll(/\$\{([A-Z][A-Z0-9_]+)(?::-[^}]*)?\}/g)) names.add(m[1])
  }
  return names
}

describe("environment variables (#761)", () => {
  const doc = readFileSync(join(ROOT, "docs/configuration.md"), "utf8")
  const documented = new Set([...doc.matchAll(/`([A-Z][A-Z0-9_]+)`/g)].map((m) => m[1]))

  it("finds the names the code reads", () => {
    const code = (text: string) => ({ text, shell: false })
    expect([...envNamesRead([code("process.env.FOO_BAR"), code("env.BAZ"), code('env["QUX"]'), { text: '"${READY:-/tmp}"', shell: true }])].sort()).toEqual(["BAZ", "FOO_BAR", "QUX", "READY"])
    expect([...envNamesRead([code("env.lowercase"), code("myenv.X"), code("`${TEMPLATE_CONSTANT}`")])]).toEqual([])
  })

  it("documents in docs/configuration.md every variable the application reads", () => {
    const sources = [
      ...files(join(ROOT, "src")),
      ...["next.config.ts", "sentry.server.config.ts", "sentry.edge.config.ts", "instrumentation-client.ts", "docker-entrypoint.sh", "scripts/warmup.mjs"].map((f) => join(ROOT, f)),
    ].map((f) => ({ text: readFileSync(f, "utf8"), shell: f.endsWith(".sh") }))
    const read = envNamesRead(sources)
    // Sanity: the scan does see the application's settings.
    expect(read).toContain("DATABASE_URL")
    expect(read).toContain("MIGRATE_ON_START")
    const missing = [...read].filter((name) => !NOT_OPERATOR_SETTINGS.has(name) && !name.startsWith("NEXT_PUBLIC_") && !documented.has(name)).sort()
    expect(missing).toEqual([])
  })
})
