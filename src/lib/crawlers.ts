// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import type { MetadataRoute } from "next"

/**
 * Who may read the apex site (www.benevol.app): everyone, search engines and AI assistants alike.
 * benevol.app is a free, open source community tool; its features page, its documentation and its
 * legal pages are written to be found and quoted, so the crawlers of the main search engines and
 * of the AI assistants that answer with sources are named and allowed explicitly. The private
 * areas (administration, API, personal and token links) stay closed to every one of them: a
 * crawler that finds its own group in robots.txt ignores the `*` group, so each group repeats
 * the same Disallow list.
 */
export const PUBLIC_CRAWLERS: readonly string[] = [
  // Search engines.
  "Googlebot",
  "Bingbot",
  "Applebot",
  "DuckDuckBot",
  // AI assistants: search and answers with sources, and the opt-ins of the same vendors.
  "OAI-SearchBot",
  "ChatGPT-User",
  "GPTBot",
  "Claude-SearchBot",
  "Claude-User",
  "ClaudeBot",
  "PerplexityBot",
  "Perplexity-User",
  "Google-Extended",
  "Applebot-Extended",
  // Common Crawl: the open web archive many open models and research projects start from.
  "CCBot",
]

/** The apex rules: every crawler, the named ones in their own group, all kept out of `disallow`. */
export function apexRobotsRules(disallow: readonly string[]): MetadataRoute.Robots["rules"] {
  return [
    { userAgent: "*", allow: "/", disallow: [...disallow] },
    { userAgent: [...PUBLIC_CRAWLERS], allow: "/", disallow: [...disallow] },
  ]
}
