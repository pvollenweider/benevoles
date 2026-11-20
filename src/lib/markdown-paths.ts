// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import type { Metadata } from "next"
import { absoluteUrl } from "@/lib/seo-metadata"

/**
 * The address of a page's Markdown variant (llmstxt.org): the HTML page's path followed by `.md`,
 * the home under `/index.html.md`. Pure, and the only place that knows the mapping: metadata
 * (alternates.types), the proxy that serves the variant and /llms.txt all read it.
 *
 * `htmlPathForMarkdown` is the inverse; anything that is not a `.md` path is null, so the proxy
 * answers 404 for it. Both ignore a query or a fragment and a trailing slash, and refuse `.`/`..`
 * segments, so a caller never builds a path outside the site.
 */

/** The path part of a URL, without query, fragment or trailing slashes; null when it isn't a site path. */
export function cleanSitePath(pathname: string): string | null {
  const path = pathname.split(/[?#]/, 1)[0]
  if (!path.startsWith("/")) return null
  const withoutTrailing = path.replace(/\/+$/, "")
  if (withoutTrailing === "") return "/"
  if (withoutTrailing.slice(1).split("/").some((segment) => segment === "" || segment === "." || segment === "..")) return null
  return withoutTrailing
}

/** `/` → `/index.html.md`, `/x/y` → `/x/y.md`; null when `htmlPath` is not a site path. */
export function markdownPathFor(htmlPath: string): string | null {
  const path = cleanSitePath(htmlPath)
  if (path === null) return null
  return path === "/" ? "/index.html.md" : `${path}.md`
}

/** The HTML path a Markdown variant serves (`/x/y.md` → `/x/y`, `/index.html.md` → `/`); null otherwise. */
export function htmlPathForMarkdown(mdPath: string): string | null {
  const path = cleanSitePath(mdPath)
  if (path === null || !path.endsWith(".md")) return null
  if (path === "/index.html.md") return "/"
  const htmlPath = path.slice(0, -".md".length)
  return htmlPath === "" || htmlPath.endsWith("/") ? null : htmlPath
}

/** The MIME type of the alternate, as `alternates.types` and the Link header write it. */
export const MARKDOWN_ALTERNATE_TYPE = "text/markdown"

/**
 * `metadata` with its Markdown variant announced (`<link rel="alternate" type="text/markdown">`),
 * keeping its canonical and its other alternate types (the blog's Atom feed, for one).
 */
export function withMarkdownAlternate(metadata: Metadata, base: string, htmlPath: string): Metadata {
  const markdownPath = markdownPathFor(htmlPath)
  if (!markdownPath) return metadata
  return {
    ...metadata,
    alternates: {
      ...metadata.alternates,
      types: { ...metadata.alternates?.types, [MARKDOWN_ALTERNATE_TYPE]: absoluteUrl(base, markdownPath) },
    },
  }
}
