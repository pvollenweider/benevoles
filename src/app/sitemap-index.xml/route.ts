// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { PUBLIC_ORG_WHERE } from "@/lib/org-approval"
import { headers } from "next/headers"
import { prisma } from "@/lib/prisma"
import { PUBLIC_LIST_WHERE } from "@/lib/event-visibility"
import { latestDate, sitemapIndexEntries, sitemapIndexXml, type OrgForIndex } from "@/lib/sitemap-index"
import { apexBaseUrl, isKnownHost, orgSitemapUrl } from "@/lib/urls"
import { reportError } from "@/lib/report-error"
import { VIDEO_SITEMAP_PATH } from "@/lib/video-seo"

// The apex sitemap index (src/lib/sitemap-index.ts), referenced by the apex robots.txt: the
// www sitemap and the video sitemap, then every active organisation's. Only on the apex host: an organisation's host has
// its own sitemap, staging, previews and unknown hosts have none. A path ending in .xml is never an
// event slug, so the route can't shadow an event.
export const dynamic = "force-dynamic"

export async function GET() {
  const h = await headers()
  const hostname = (h.get("host") ?? "").split(":")[0]
  if (h.get("x-org-slug") || !isKnownHost(hostname) || hostname.startsWith("staging.")) {
    return new Response("Not found", { status: 404 })
  }

  let orgs: OrgForIndex[] = []
  try {
    // Active organisations only: an inactive one has no public page (src/lib/resolve-org.ts).
    const rows = await prisma.organization.findMany({
      where: PUBLIC_ORG_WHERE,
      select: {
        slug: true,
        updatedAt: true,
        events: { where: PUBLIC_LIST_WHERE, select: { updatedAt: true }, orderBy: { updatedAt: "desc" }, take: 1 },
      },
    })
    orgs = rows.map((o) => ({ slug: o.slug, lastmod: latestDate([o.updatedAt, o.events[0]?.updatedAt]) }))
  } catch (error) {
    // Without the database, the index still gives the apex sitemap rather than an error.
    reportError("sitemap-index")(error)
  }

  const xml = sitemapIndexXml(sitemapIndexEntries([`${apexBaseUrl()}/sitemap.xml`, `${apexBaseUrl()}${VIDEO_SITEMAP_PATH}`], orgs, orgSitemapUrl))
  return new Response(xml, { headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "public, max-age=3600" } })
}
