#!/usr/bin/env node

// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

// Writes doc-lastmod.json at the repo root: each source file of the apex sitemap (the `source` of
// PUBLIC_PAGES in src/lib/doc-pages.ts, the documentation units guide/*.md and the video pages'
// own code, VIDEO_PAGE_SOURCES) mapped to the ISO date of its last commit. The sitemap (src/app/sitemap.ts) reads it as each page's lastmod: the
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
 * The files a video page is rendered from, besides its catalogue entry: a change to them changes
 * every video page (#972 moved the player under the title), so the video sitemaps date a page by
 * the later of its video's `updatedAt` and these files' last commit. Same list as
 * VIDEO_PAGE_SOURCES in src/lib/video-seo.ts; a test checks the two match.
 */
export const VIDEO_PAGE_SOURCES = {
  library: ["src/app/videos/layout.tsx", "src/app/videos/page.tsx"],
  video: ["src/app/videos/layout.tsx", "src/app/videos/[id]/page.tsx"],
}

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
  return [...new Set([...sources, ...units, ...VIDEO_PAGE_SOURCES.library, ...VIDEO_PAGE_SOURCES.video])]
}

/**
 * The trailer of a commit that changes no rendered page, only where its sources live (a move of
 * the Markdown files, the relative links between them): the sitemap keeps the date of the change
 * before it, so a page whose text didn't change doesn't look updated to search engines.
 */
export const LASTMOD_SKIP_TRAILER = "Doc-Lastmod: skip"
const [TRAILER_KEY, TRAILER_VALUE] = LASTMOD_SKIP_TRAILER.split(": ")

/**
 * Committer date (ISO 8601) of the last commit touching each file, following it across renames
 * and passing over the commits that carry LASTMOD_SKIP_TRAILER (unless every commit carries it, as
 * in a shallow clone); files without history are skipped.
 * @param {string[]} sources
 * @param {string} [root]
 * @returns {Record<string, string>}
 */
export function docLastmod(sources, root = ROOT) {
  /** @type {Record<string, string>} */
  const map = {}
  for (const source of sources) {
    // Not `--grep`: a rename commit left out by it would also stop `--follow` at the new path.
    const log = execFileSync("git", ["log", "--follow", `--format=%cI%x09%(trailers:key=${TRAILER_KEY},valueonly,separator=%x2c)`, "--", source], { cwd: root, encoding: "utf-8" })
    const commits = log
      .split("\n")
      .map((line) => line.split("\t"))
      .filter(([d]) => d)
    // Every commit skipped (a shallow clone that only has the move): the last commit, as before.
    const date = (commits.find(([, trailer]) => trailer?.trim() !== TRAILER_VALUE) ?? commits[0])?.[0]
    if (date) map[source] = date
  }
  return map
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const map = docLastmod(docLastmodSources())
  writeFileSync(path.join(ROOT, "doc-lastmod.json"), `${JSON.stringify(map, null, 2)}\n`)
  console.log(`doc-lastmod.json: ${Object.keys(map).length} files dated`)
}
