#!/usr/bin/env node

// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

// Production dependencies check, run by CI on every PR (ci.yml): `npm audit --omit=dev`, failing on
// any advisory rated high or critical. The only advisories let through are the dated exceptions of
// src/lib/audit-exceptions.ts (one advisory, one package, a reason, an end date); past its date an
// exception fails the check again.
//   node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON scripts/check-prod-audit.mjs
import { spawnSync } from "node:child_process"
import { AUDIT_EXCEPTIONS, auditExceptionProblems, auditVerdict } from "../src/lib/audit-exceptions.ts"

const listProblems = auditExceptionProblems(AUDIT_EXCEPTIONS)
if (listProblems.length > 0) {
  for (const p of listProblems) console.error(`✖ src/lib/audit-exceptions.ts: ${p}`)
  process.exit(1)
}

// npm exits 1 when it finds anything: the report is on its standard output either way.
const run = spawnSync("npm", ["audit", "--omit=dev", "--json"], { encoding: "utf-8", maxBuffer: 64 * 1024 * 1024 })
let report
try {
  report = JSON.parse(run.stdout)
} catch {
  console.error("✖ npm audit gave no report:")
  console.error((run.stderr || run.stdout || String(run.error ?? "")).slice(0, 2000))
  process.exit(1)
}
// A registry or network failure comes back as { error }, with no vulnerabilities to judge: never a pass.
if (report.error || typeof report.vulnerabilities !== "object" || report.vulnerabilities === null) {
  console.error(`✖ npm audit failed: ${report.error?.summary ?? report.error?.code ?? "no vulnerabilities section in its report"}`)
  process.exit(1)
}

const today = new Date().toISOString().slice(0, 10)
const { blocking, expired, excused, unused } = auditVerdict(report, AUDIT_EXCEPTIONS, today)

for (const { advisory, exception } of excused) {
  console.log(`⚠ accepted until ${exception.until}: ${advisory.id} ${advisory.package} (${advisory.severity}), ${advisory.title}`)
  console.log(`  ${exception.reason}`)
}
for (const e of unused) console.log(`⚠ src/lib/audit-exceptions.ts: ${e.id} (${e.package}) is no longer reported, remove this exception`)

for (const a of blocking) console.error(`✖ ${a.id} ${a.package} (${a.severity}): ${a.title}\n  ${a.url}`)
for (const { advisory, exception } of expired) {
  console.error(`✖ ${advisory.id} ${advisory.package} (${advisory.severity}): its exception ended on ${exception.until}\n  ${advisory.url}`)
}
if (blocking.length + expired.length > 0) {
  console.error("\nUpdate the dependency. If no fixed version exists and the application is not exposed,")
  console.error("the decision to accept it for a while is recorded in src/lib/audit-exceptions.ts, with a reason and an end date.")
  process.exit(1)
}
console.log(`✓ production dependencies: no high or critical advisory${excused.length > 0 ? ` besides ${excused.length} dated exception(s)` : ""}`)
