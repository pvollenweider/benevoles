#!/usr/bin/env node

// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

// Migration safety check (#346), run by CI on every PR (ci.yml). Rules and rationale are in
// src/lib/migration-safety.ts. Compares the PR with its base:
//   node scripts/check-migrations.mjs            # CI: HEAD is the PR merge commit, HEAD^1 its base
//   node scripts/check-migrations.mjs origin/main  # locally, against a branch
import { execFileSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { checkMigrations, parseNameStatus } from "../src/lib/migration-safety.ts"

const base = process.argv[2]
const range = base ? [`${base}...HEAD`] : ["HEAD^1", "HEAD"]
const output = execFileSync("git", ["diff", "--name-status", "-M", ...range, "--", "prisma/migrations"], { encoding: "utf-8" })

const { errors, acknowledged } = checkMigrations(parseNameStatus(output), (path) => readFileSync(path, "utf-8"))

for (const line of acknowledged) console.log(`⚠ acknowledged (-- migration-safety): ${line}`)
if (errors.length > 0) {
  for (const line of errors) console.error(`✖ ${line}`)
  process.exit(1)
}
console.log("✓ migrations: no applied migration edited, no unacknowledged risky statement")
