import type { MetadataRoute } from "next"
import { headers } from "next/headers"
import { prisma } from "@/lib/prisma"
import { resolveOrgSlug } from "@/lib/resolve-org"
import { apexBaseUrl, isKnownHost, orgBaseUrl } from "@/lib/urls"
import { ORG_SITEMAP_EVENTS_WHERE, orgSitemapEntries } from "@/lib/sitemap-index"
import { orgHomeEventsWhere } from "@/lib/event-visibility"
import { apexSitemap } from "@/lib/doc-pages"
import { loadDocUnits } from "@/lib/doc-units"
import { loadBlogPosts } from "@/lib/blog"
import { loadRessources } from "@/lib/ressources"
import { isHostedService } from "@/lib/site"
import { loadDocLastmod } from "@/lib/doc-lastmod-load"
import { loadVideoCatalog } from "@/lib/video-catalog-load"
import { videoSitemapEntries } from "@/lib/video-seo"
import { videoSeoContext } from "@/lib/video-seo-context"
import { reportError } from "@/lib/report-error"

// The video library and every indexed video, the selection /video-sitemap.xml lists (one
// function, src/lib/video-seo.ts) without its video extension. A broken catalogue never takes the
// rest of the sitemap down.
function apexVideoEntries(): MetadataRoute.Sitemap {
  try {
    return videoSitemapEntries(loadVideoCatalog(), videoSeoContext())
  } catch (error) {
    reportError("sitemap-videos")(error)
    return []
  }
}

// Multi-tenant by subdomain: each org's own [orgSlug].benevol.app/sitemap.xml lists only that
// org's published events (and their custom pages, #188) — the host already scopes it via
// x-org-slug, no need to iterate other orgs. The apex host (www) lists the marketing home and the
// documentation pages, the video library and its indexed videos (SEO); staging, previews and unknown hosts get nothing.
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const h = await headers()
  const rawOrgSlug = h.get("x-org-slug")
  if (!rawOrgSlug) {
    const hostname = (h.get("host") ?? "").split(":")[0]
    if (!isKnownHost(hostname) || hostname.startsWith("staging.")) return []
    return [...apexSitemap(apexBaseUrl(), loadDocLastmod(), loadDocUnits(), isHostedService(), loadBlogPosts(), loadRessources()), ...apexVideoEntries()]
  }

  const resolved = await resolveOrgSlug(rawOrgSlug)
  if (!resolved || resolved.redirectUrl) return []

  const [events, shownEvents] = await Promise.all([
    prisma.event.findMany({
      // Listed events only (#414): an unlisted event and its pages stay out of the sitemap.
      where: { organizationId: resolved.org.id, ...ORG_SITEMAP_EVENTS_WHERE },
      select: {
        slug: true,
        updatedAt: true,
        pages: { select: { slug: true, updatedAt: true } },
      },
    }),
    // The public page is listed only while it shows an event, the rule of its robots metadata.
    prisma.event.count({ where: { organizationId: resolved.org.id, ...orgHomeEventsWhere() } }),
  ])

  return orgSitemapEntries(orgBaseUrl(resolved.org.slug), shownEvents, events)
}
