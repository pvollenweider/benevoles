// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import fs from "fs"
import path from "path"
import { docLastmodLookup } from "@/lib/doc-lastmod"

// A page's last change is its source file's last commit, written at deploy into
// doc-lastmod.json (scripts/doc-lastmod.mjs): in the image every file's mtime is the build time.
// Read once; without the file (development, tests) or with a malformed one, no lastmod at all.
// Server only (reads the disk): the apex sitemap and the video sitemaps' context use it.
let docLastmod: ((source: string) => Date | null) | null = null
export function loadDocLastmod(): (source: string) => Date | null {
  if (docLastmod) return docLastmod
  let json: unknown = null
  try {
    json = JSON.parse(fs.readFileSync(path.join(/*turbopackIgnore: true*/ process.cwd(), "doc-lastmod.json"), "utf-8"))
  } catch {
    json = null
  }
  docLastmod = docLastmodLookup(json)
  return docLastmod
}
