// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { NON_ORG_SUBDOMAINS } from "@/lib/org-subdomain"

/**
 * The apex sitemap index (/sitemap-index.xml, src/app/sitemap-index.xml/route.ts): the apex's own
 * sitemap (home, features, documentation, legal pages), then the sitemap of every active
 * organisation (<slug>.benevol.app/sitemap.xml: its public page and its listed events). Each
 * organisation's robots.txt already names its own sitemap, but nobody submits twenty of them by
 * hand: submitting this index once in Search Console (a domain property covers the subdomains)
 * reaches them all. Next has no file convention for an index, hence a route; this part is pure.
 */

export type SitemapRef = { loc: string; lastmod?: Date | null }

export type OrgForIndex = { slug: string; lastmod: Date | null }

/** The apex sitemap first, then one per organisation (by slug, never a system subdomain). */
export function sitemapIndexEntries(apexSitemapUrl: string, orgs: readonly OrgForIndex[], orgSitemapUrl: (slug: string) => string): SitemapRef[] {
  const listed = orgs
    .filter((o) => o.slug && !NON_ORG_SUBDOMAINS.has(o.slug))
    .toSorted((a, b) => a.slug.localeCompare(b.slug))
    .map((o) => ({ loc: orgSitemapUrl(o.slug), lastmod: o.lastmod }))
  return [{ loc: apexSitemapUrl }, ...listed]
}

const XML_ESCAPES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" }
const xmlEscape = (text: string) => text.replace(/[&<>"']/g, (c) => XML_ESCAPES[c])

/** The index as the sitemaps.org protocol writes it, a `<lastmod>` only when known. */
export function sitemapIndexXml(entries: readonly SitemapRef[]): string {
  const items = entries.map((e) => {
    const lastmod = e.lastmod ? `<lastmod>${e.lastmod.toISOString()}</lastmod>` : ""
    return `<sitemap><loc>${xmlEscape(e.loc)}</loc>${lastmod}</sitemap>`
  })
  return `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${items.join("\n")}\n</sitemapindex>\n`
}

/** The latest of the dates known (an organisation's own change, its listed events'), or null. */
export function latestDate(dates: readonly (Date | null | undefined)[]): Date | null {
  const times = dates.filter((d): d is Date => d instanceof Date && !Number.isNaN(d.getTime())).map((d) => d.getTime())
  return times.length > 0 ? new Date(Math.max(...times)) : null
}
