#!/usr/bin/env node

// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

// « Draft content » check, run by CI as its own job (ci.yml): fails while a public content source
// still carries the draft marker « <!-- BROUILLON », put at the top of agent-written copy until the
// owner has rewritten it (#872, #950, #951). The unit tests stay green on a draft branch; only this
// check is red, so the merge loop, which merges only when every check is green, waits for the owner.
//
// The sources are the Markdown files the Dockerfile copies into the runtime image (every public
// page's source, src/lib/doc-pages.ts, checked by docker-public-sources.test.ts) and the folders it
// copies whole (guide/, blog/).
//   node scripts/check-no-draft-content.mjs
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

export const DRAFT_MARKER = "<!-- BROUILLON"

/** The public Markdown sources, from the Dockerfile's COPY lines: files, then the .md files of copied folders. */
export function publicContentSources(root) {
  const dockerfile = readFileSync(path.join(root, "Dockerfile"), "utf-8")
  const copied = [...dockerfile.matchAll(/^COPY --from=builder \S+ \/app\/(\S+) \.\/\S+$/gm)].map((m) => m[1])
  const files = []
  for (const entry of copied) {
    const full = path.join(root, entry)
    if (entry.endsWith(".md")) files.push(entry)
    else if (["guide", "blog"].includes(entry) && existsSync(full) && statSync(full).isDirectory()) {
      for (const f of readdirSync(full).sort()) if (f.endsWith(".md")) files.push(`${entry}/${f}`)
    }
  }
  return files
}

/** The sources that still carry the draft marker. */
export function draftSources(root) {
  return publicContentSources(root).filter((f) => readFileSync(path.join(root, f), "utf-8").includes(DRAFT_MARKER))
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..")
  const drafts = draftSources(root)
  if (drafts.length === 0) {
    console.log(`✓ no public content source carries « ${DRAFT_MARKER} »`)
    process.exit(0)
  }
  for (const f of drafts) console.error(`✖ ${f} is still a draft (« ${DRAFT_MARKER} »): the owner rewrites it, then removes the marker`)
  process.exit(1)
}
