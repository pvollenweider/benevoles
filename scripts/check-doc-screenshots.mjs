#!/usr/bin/env node

// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

// Documentation captures check, run by CI on every PR (ci.yml). Mapping and rules are in
// src/lib/doc-screenshots.ts. A PR that changes a screen shown in public/doc-img regenerates the
// capture (`ONLY=<name> npm run screenshots`, see scripts/screenshots.mjs), or writes
// `doc-img: unchanged` in its description (PR_BODY, set by CI) or a commit message.
//   node scripts/check-doc-screenshots.mjs              # CI: HEAD is the PR merge commit, HEAD^1 its base
//   node scripts/check-doc-screenshots.mjs origin/main  # locally, against a branch
import { execFileSync } from "node:child_process"
import { existsSync, readFileSync } from "node:fs"
import { DOC_SCREENSHOTS, OPT_OUT, hasOptOut, screenshotSources, staleScreenshots } from "../src/lib/doc-screenshots.ts"

const base = process.argv[2]
const range = base ? [`${base}...HEAD`] : ["HEAD^1", "HEAD"]
const git = (...args) => execFileSync("git", args, { encoding: "utf-8" })

const changed = new Set(git("diff", "--name-only", "-M", ...range).split("\n").filter(Boolean))
const read = (path) => readFileSync(path, "utf-8")
const sourcesByShot = Object.fromEntries(Object.entries(DOC_SCREENSHOTS).map(([name, entries]) => [name, screenshotSources(entries, read, existsSync)]))
const stale = staleScreenshots(changed, sourcesByShot)

if (stale.length === 0) {
  console.log("✓ doc-img: no capture shows a screen this change modifies, or every such capture was regenerated")
  process.exit(0)
}

const messages = git("log", "--format=%B", base ? `${base}..HEAD` : "HEAD^1..HEAD")
if (hasOptOut([process.env.PR_BODY ?? "", messages])) {
  for (const s of stale) console.log(`⚠ acknowledged (${OPT_OUT}): ${s.name}.png — ${s.changedSources.join(", ")}`)
  process.exit(0)
}

for (const s of stale) console.error(`✖ public/doc-img/${s.name}.png shows a changed screen: ${s.changedSources.join(", ")}`)
console.error(`\nRegenerate them (ONLY=${stale.map((s) => s.name).join(",")} npm run screenshots, procedure in scripts/screenshots.mjs)`)
console.error(`or, if nothing visible changed, write « ${OPT_OUT} » in the PR description.`)
process.exit(1)
