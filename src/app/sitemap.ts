import type { MetadataRoute } from "next"
import fs from "fs"
import path from "path"
import { headers } from "next/headers"
import { prisma } from "@/lib/prisma"
import { resolveOrgSlug } from "@/lib/resolve-org"
import { apexBaseUrl, isKnownHost, orgBaseUrl } from "@/lib/urls"
import { PUBLIC_LIST_WHERE } from "@/lib/event-visibility"
import { apexSitemap } from "@/lib/doc-pages"

// Multi-tenant by subdomain: each org's own [orgSlug].benevol.app/sitemap.xml lists only that
// org's published events (and their custom pages, #188) — the host already scopes it via
// x-org-slug, no need to iterate other orgs. The apex host (www) lists the marketing home and the
// documentation pages (SEO); staging, previews and unknown hosts get nothing.
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const h = await headers()
  const rawOrgSlug = h.get("x-org-slug")
  if (!rawOrgSlug) {
    const hostname = (h.get("host") ?? "").split(":")[0]
    if (!isKnownHost(hostname) || hostname.startsWith("staging.")) return []
    // A doc page's last change is its source file's: GUIDE_*.md are shipped with the app.
    return apexSitemap(apexBaseUrl(), (source) => {
      try { return fs.statSync(path.join(process.cwd(), source)).mtime } catch { return null }
    })
  }

  const resolved = await resolveOrgSlug(rawOrgSlug)
  if (!resolved || resolved.redirectUrl) return []

  const events = await prisma.event.findMany({
    // Listed events only (#414): an unlisted event and its pages stay out of the sitemap.
    where: { organizationId: resolved.org.id, ...PUBLIC_LIST_WHERE },
    select: {
      slug: true,
      updatedAt: true,
      pages: { select: { slug: true, updatedAt: true } },
    },
  })

  const base = orgBaseUrl(resolved.org.slug)
  const entries: MetadataRoute.Sitemap = [{ url: base, changeFrequency: "daily" }]
  for (const event of events) {
    entries.push({ url: `${base}/${event.slug}`, lastModified: event.updatedAt, changeFrequency: "daily" })
    for (const page of event.pages) {
      entries.push({ url: `${base}/${event.slug}/${page.slug}`, lastModified: page.updatedAt, changeFrequency: "monthly" })
    }
  }
  return entries
}
