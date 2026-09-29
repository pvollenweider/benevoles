#!/usr/bin/env node

// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

// Runs in CI (see ci.yml) so SECURITY.md's "supported versions" table can't silently fall out of
// date the way it did before: it stayed pinned at 1.12.x through three later releases (1.13.0,
// 1.14.0, ...) with nobody noticing, because nothing forced it to be touched at release time.
//
// This only checks that the *newest* row's version prefix matches package.json's own
// major.minor — not the ✅/❌ markers or older rows, which are free-form. A release bump to
// package.json's version will fail this check until SECURITY.md's table is updated to match,
// which is the point: the version bump and the SECURITY.md update happen in the same commit,
// the same way CHANGELOG.md's [Unreleased] section is expected to be backfilled before a release.
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import path from "node:path"

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const pkg = JSON.parse(readFileSync(path.join(root, "package.json"), "utf-8"))
const [major, minor] = pkg.version.split(".")
const expectedPrefix = `${major}.${minor}`

const securityMd = readFileSync(path.join(root, "SECURITY.md"), "utf-8")
const rows = [...securityMd.matchAll(/^\|\s*([\d.]+)\.x\s*\|/gm)]

if (rows.length === 0) {
  console.error(`✖ SECURITY.md: couldn't find a "| X.Y.x |" row in the supported-versions table.`)
  process.exit(1)
}

const newestRowVersion = rows[0][1]
if (newestRowVersion !== expectedPrefix) {
  console.error(`
✖ SECURITY.md is out of date: its supported-versions table lists ${newestRowVersion}.x, but
  package.json is at ${pkg.version} (${expectedPrefix}.x).

  Update SECURITY.md's table as part of this release, same as CHANGELOG.md.
`)
  process.exit(1)
}
