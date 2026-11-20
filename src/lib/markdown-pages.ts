// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { blogPostPath } from "@/lib/blog"
import { PUBLIC_PAGES, pageAvailable } from "@/lib/doc-pages"
import {
  blogPostSection,
  docUnitSection,
  homeSection,
  markdownPageText,
  newsSection,
  publicPageSection,
  releasesMarkdown,
  ressourceSection,
  type LlmsSection,
  type LlmsSources,
} from "@/lib/llms-txt"
import { cleanSitePath } from "@/lib/markdown-paths"

/**
 * Every public HTML page's Markdown variant, at its address followed by `.md` (llmstxt.org): the
 * same text as that page's section of /llms-full.txt, built by the same builders
 * (src/lib/llms-txt.ts), plus one line under the title saying which HTML page it mirrors.
 *
 * Only what /llms-full.txt already exposes has a variant: a page with a Markdown source (the home's
 * FAQ included), each documentation unit, each blog post, each practical guide and /nouveautes
 * (the released CHANGELOG sections). A draft, unlisted or otherwise non-public page, and any path
 * the site doesn't serve as HTML today, has none: the proxy answers 404.
 */

export { htmlPathForMarkdown, markdownPathFor } from "@/lib/markdown-paths"

/** The path of an HTML page, normalised: `/x/` → `/x`, `/` → `/`, a query or a fragment dropped. */
function htmlPagePath(pathname: string): string | null {
  return cleanSitePath(pathname)
}

/**
 * The one-page section of a covered path, built by the /llms-full.txt builders; null for a page
 * without a Markdown source or a path the site doesn't serve.
 */
function sectionForPath(path: string, s: LlmsSources): LlmsSection | null {
  if (path === "/") return homeSection(s.faq ?? "", s.base)
  const post = (s.posts ?? []).find((candidate) => blogPostPath(candidate) === path)
  if (post) return blogPostSection(post, s.base)
  const guide = (s.ressources ?? []).find((candidate) => `/ressources/${candidate.slug}` === path)
  if (guide) return ressourceSection(guide, s.base)
  const unit = (s.units ?? []).find((candidate) => `/doc/${candidate.slug}` === path)
  if (unit) return docUnitSection(unit, s.base)
  const page = PUBLIC_PAGES.find((candidate) => candidate.path === path)
  if (!page || !pageAvailable(page)) return null
  // /nouveautes is rendered from the released sections of CHANGELOG.md, not from one source file.
  if (page.path === "/nouveautes") return newsSection(page, releasesMarkdown(s.releases ?? [], s.base, s.repositoryUrl))
  // The features page's source is passed separately by /llms-full.txt (s.features).
  if (page.path === "/fonctionnalites") return publicPageSection(page, s.features, s.base)
  const source = (s.pages ?? []).find((candidate) => candidate.path === path)?.markdown
  return source === undefined ? null : publicPageSection(page, source, s.base)
}

/**
 * The Markdown variant of a page, or null when the site doesn't serve one. The argument is the
 * HTML path (`/fonctionnalites`, not `/fonctionnalites.md`); a query, a fragment and a trailing
 * slash are ignored.
 */
export function markdownForPath(pathname: string, sources: LlmsSources): string | null {
  const path = htmlPagePath(pathname)
  if (path === null) return null
  const section = sectionForPath(path, sources)
  return section === null ? null : markdownPageText(section, sources.base)
}
