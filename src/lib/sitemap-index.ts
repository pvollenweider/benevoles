// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import type { MetadataRoute } from "next"
import { NON_ORG_SUBDOMAINS } from "@/lib/org-subdomain"
import { PUBLIC_LIST_WHERE } from "@/lib/event-visibility"

/**
 * The apex sitemap index (/sitemap-index.xml, src/app/sitemap-index.xml/route.ts): the apex's own
 * sitemaps (sitemap.xml: home, features, documentation, legal pages, videos; video-sitemap.xml:
 * the same video pages with Google's video extension), then the sitemap of every active
 * organisation whose public page shows an event (<slug>.benevol.app/sitemap.xml: its public page and
 * its listed events; an organisation without one, a test space for instance, is left out). Each
 * organisation's robots.txt already names its own sitemap, but nobody submits twenty of them by
 * hand: submitting this index once in Search Console (a domain property covers the subdomains)
 * reaches them all. Next has no file convention for an index, hence a route; this part is pure.
 */

export type SitemapRef = { loc: string; lastmod?: Date | null }

/**
 * The events an organisation's own sitemap lists (src/app/sitemap.ts): published and listed (#414),
 * over or not. Whether the index lists that sitemap depends on the ones not over yet. The
 * organisations themselves are the public ones on both sides (PUBLIC_ORG_WHERE: active, approved
 * for publication; src/lib/resolve-org.ts for the organisation's host).
 */
export const ORG_SITEMAP_EVENTS_WHERE = PUBLIC_LIST_WHERE

/**
 * An organisation as the index sees it: its slug, its last change, and how many events its public
 * page shows (orgHomeEventsWhere, src/lib/event-visibility.ts: published, listed, not over).
 */
export type OrgForIndex = { slug: string; lastmod: Date | null; shownEvents: number }

/**
 * Whether the index lists an organisation's sitemap: a real organisation's (never a system
 * subdomain), and only while its public page shows at least one event. Without one that page reads
 * « Aucun événement en cours. » and is kept out of search engines (orgHomeRobots): a space being
 * prepared, a test space or a season over, nothing worth sending crawlers to.
 */
export function orgSitemapListed(org: OrgForIndex): boolean {
  return Boolean(org.slug) && !NON_ORG_SUBDOMAINS.has(org.slug) && org.shownEvents > 0
}

/**
 * The entries of an organisation's own sitemap (src/app/sitemap.ts): its public page while that page
 * shows an event (a page kept out of search engines is never listed), then each listed event and
 * its custom pages (#188).
 */
export function orgSitemapEntries(
  base: string,
  shownEvents: number,
  events: readonly { slug: string; updatedAt: Date; pages: readonly { slug: string; updatedAt: Date }[] }[],
): MetadataRoute.Sitemap {
  const entries: MetadataRoute.Sitemap = shownEvents > 0 ? [{ url: base, changeFrequency: "daily" }] : []
  for (const event of events) {
    entries.push({ url: `${base}/${event.slug}`, lastModified: event.updatedAt, changeFrequency: "daily" })
    for (const page of event.pages) {
      entries.push({ url: `${base}/${event.slug}/${page.slug}`, lastModified: page.updatedAt, changeFrequency: "monthly" })
    }
  }
  return entries
}

/** The apex sitemaps first, in the order given, then one per organisation that `orgSitemapListed` keeps, by slug. */
export function sitemapIndexEntries(apexSitemapUrls: readonly string[], orgs: readonly OrgForIndex[], orgSitemapUrl: (slug: string) => string): SitemapRef[] {
  const listed = orgs
    .filter(orgSitemapListed)
    .toSorted((a, b) => a.slug.localeCompare(b.slug))
    .map((o) => ({ loc: orgSitemapUrl(o.slug), lastmod: o.lastmod }))
  return [...apexSitemapUrls.map((loc) => ({ loc })), ...listed]
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
