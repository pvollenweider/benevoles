#!/usr/bin/env node

// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

// Writes doc-lastmod.json at the repo root: each source file of the apex sitemap (the `source` of
// PUBLIC_PAGES in src/lib/doc-pages.ts and the documentation units guide/*.md) mapped to the ISO
// date of its last commit. The sitemap (src/app/sitemap.ts) reads it as each page's lastmod: the
// files' mtime in the image is the build time, identical for every page on every deploy.
//
// Run by deploy.yml before the image build, on a full clone (fetch-depth: 0): a shallow clone
// would date every file to the last commit. A file without history is left out, and so is its
// lastmod (a missing lastmod is valid, a wrong one is worse).
import { execFileSync } from "node:child_process"
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import path from "node:path"

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)))

/**
 * The sitemap's source files, read from the code itself so the list can't drift: every
 * `source: "…"` of src/lib/doc-pages.ts, then every guide/*.md except the index guide/README.md
 * (the same rule as readDocUnits in src/lib/doc-units.ts). A test checks it covers both.
 * @param {string} [root]
 * @returns {string[]}
 */
export function docLastmodSources(root = ROOT) {
  const pages = readFileSync(path.join(root, "src/lib/doc-pages.ts"), "utf-8")
  const sources = [...pages.matchAll(/^\s*source:\s*"([^"]+)"/gm)].map((m) => m[1])
  const guideDir = path.join(root, "guide")
  const units = existsSync(guideDir)
    ? readdirSync(guideDir).filter((f) => f.endsWith(".md") && f !== "README.md").sort().map((f) => `guide/${f}`)
    : []
  return [...new Set([...sources, ...units])]
}

/**
 * Committer date (ISO 8601) of the last commit touching each file; files without history are skipped.
 * @param {string[]} sources
 * @param {string} [root]
 * @returns {Record<string, string>}
 */
export function docLastmod(sources, root = ROOT) {
  /** @type {Record<string, string>} */
  const map = {}
  for (const source of sources) {
    const date = execFileSync("git", ["log", "-1", "--format=%cI", "--", source], { cwd: root, encoding: "utf-8" }).trim()
    if (date) map[source] = date
  }
  return map
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const map = docLastmod(docLastmodSources())
  writeFileSync(path.join(ROOT, "doc-lastmod.json"), `${JSON.stringify(map, null, 2)}\n`)
  console.log(`doc-lastmod.json: ${Object.keys(map).length} files dated`)
}
