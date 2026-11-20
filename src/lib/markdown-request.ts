// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { markdownForPath } from "@/lib/markdown-pages"
import { htmlPathForMarkdown } from "@/lib/markdown-paths"
import type { LlmsSources } from "@/lib/llms-txt"
import { absoluteUrl } from "@/lib/seo-metadata"
import { isKnownHost } from "@/lib/urls"

/**
 * How the proxy answers a `.md` request (src/proxy.ts): it serves the page's Markdown itself. No
 * rewrite to an internal route: the standalone server runs the proxy again on a rewritten request,
 * with its own host, so a rewrite would be refused on that second pass, and an internal route would
 * be a second address for each page. Pure but for `load`, so the rules are tested without the
 * proxy's auth and database imports.
 */

/**
 * Whether a host serves the Markdown variants: the apex site only, as /llms.txt (the same rule as
 * src/lib/llms-sources.ts). An organisation's host, staging and an unknown host get a 404.
 */
export function servesMarkdown(host: string, hasOrg: boolean): boolean {
  const hostname = host.split(":")[0]
  return !hasOrg && isKnownHost(hostname) && !hostname.startsWith("staging.")
}

/** The response to a request for a page's Markdown variant. */
export type MarkdownAnswer = { status: 200; body: string; headers: Record<string, string> } | { status: 404 }

/**
 * The answer to `pathname` when it names a Markdown variant (`/x.md`, `/index.html.md`), null for
 * any other path (the proxy goes on as before). A 404 on an organisation's host, staging, an
 * unknown host, for a method other than GET or HEAD, and for a page without a variant. `load` reads
 * the page sources (src/lib/llms-sources.ts); it is called only when the variant may exist.
 */
export function markdownAnswer(
  request: { pathname: string; method: string; host: string; hasOrg: boolean },
  load: () => LlmsSources,
): MarkdownAnswer | null {
  if (!request.pathname.endsWith(".md")) return null
  if (!servesMarkdown(request.host, request.hasOrg) || (request.method !== "GET" && request.method !== "HEAD")) return { status: 404 }
  const htmlPath = htmlPathForMarkdown(request.pathname)
  if (htmlPath === null) return { status: 404 }
  const sources = load()
  const body = markdownForPath(htmlPath, sources)
  if (body === null) return { status: 404 }
  return {
    status: 200,
    body,
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
      Link: `<${absoluteUrl(sources.base, htmlPath)}>; rel="canonical"`,
      "X-Content-Type-Options": "nosniff",
    },
  }
}
