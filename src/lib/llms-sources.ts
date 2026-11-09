// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import fs from "node:fs"
import path from "node:path"
import { headers } from "next/headers"
import { loadBlogPosts } from "@/lib/blog"
import { parseChangelog } from "@/lib/changelog"
import { PUBLIC_PAGES } from "@/lib/doc-pages"
import { loadDocUnits } from "@/lib/doc-units"
import { LANDING_DESCRIPTION, LANDING_FAQ_SOURCE, REPOSITORY_URL } from "@/lib/landing-seo"
import type { LlmsPageSource, LlmsSources } from "@/lib/llms-txt"
import { loadRessources } from "@/lib/ressources"
import { apexBaseUrl, isKnownHost } from "@/lib/urls"

/**
 * The sources of /llms.txt and /llms-full.txt (src/lib/llms-txt.ts), read from the files shipped in
 * the image (the Dockerfile copies them), with the deployment's base URL. Null on an organisation's
 * host, staging and unknown hosts: these files describe the apex site only.
 */
export async function llmsSources(full = false): Promise<LlmsSources | null> {
  const h = await headers()
  const hostname = (h.get("host") ?? "").split(":")[0]
  if (h.get("x-org-slug") || !isKnownHost(hostname) || hostname.startsWith("staging.")) return null
  const read = (file: string) => fs.readFileSync(path.join(/*turbopackIgnore: true*/ process.cwd(), file), "utf-8")
  // /llms.txt needs the presentation only; /llms-full.txt loads every page's text.
  const pages: LlmsPageSource[] = full
    ? PUBLIC_PAGES.flatMap((page) => (page.source && page.path !== "/nouveautes" ? [{ path: page.path, markdown: read(page.source) }] : []))
    : []
  return {
    base: apexBaseUrl(),
    summary: LANDING_DESCRIPTION,
    features: read("content/pages/FEATURES.md"),
    units: loadDocUnits(),
    repositoryUrl: REPOSITORY_URL,
    pages,
    faq: full ? read(LANDING_FAQ_SOURCE) : "",
    releases: full ? parseChangelog(read("CHANGELOG.md")) : [],
    posts: full ? loadBlogPosts() : [],
    ressources: full ? loadRessources() : [],
  }
}

export function markdownResponse(text: string): Response {
  return new Response(text, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=3600" } })
}
