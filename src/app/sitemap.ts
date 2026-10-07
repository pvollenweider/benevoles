import type { MetadataRoute } from "next"
import fs from "fs"
import path from "path"
import { headers } from "next/headers"
import { prisma } from "@/lib/prisma"
import { resolveOrgSlug } from "@/lib/resolve-org"
import { apexBaseUrl, isKnownHost, orgBaseUrl } from "@/lib/urls"
import { PUBLIC_LIST_WHERE } from "@/lib/event-visibility"
import { apexSitemap } from "@/lib/doc-pages"
import { loadDocUnits } from "@/lib/doc-units"
import { docLastmodLookup } from "@/lib/doc-lastmod"
import { loadVideoCatalog } from "@/lib/video-catalog-load"
import { videoSitemapEntries } from "@/lib/video-seo"
import { videoSeoContext } from "@/lib/video-seo-context"
import { reportError } from "@/lib/report-error"

// A doc page's last change is its source file's last commit, written at deploy into
// doc-lastmod.json (scripts/doc-lastmod.mjs): in the image every file's mtime is the build time.
// Read once; without the file (development, tests) or with a malformed one, no lastmod at all.
let docLastmod: ((source: string) => Date | null) | null = null
function docLastmodFromFile(): (source: string) => Date | null {
  if (docLastmod) return docLastmod
  let json: unknown = null
  try {
    json = JSON.parse(fs.readFileSync(path.join(/*turbopackIgnore: true*/ process.cwd(), "doc-lastmod.json"), "utf-8"))
  } catch {
    json = null
  }
  docLastmod = docLastmodLookup(json)
  return docLastmod
}

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
    return [...apexSitemap(apexBaseUrl(), docLastmodFromFile(), loadDocUnits()), ...apexVideoEntries()]
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
