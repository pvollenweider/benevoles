import type { MetadataRoute } from "next"
import { headers } from "next/headers"
import { prisma } from "@/lib/prisma"
import { resolveOrgSlug } from "@/lib/resolve-org"
import { orgBaseUrl } from "@/lib/urls"

// Multi-tenant by subdomain: each org's own [orgSlug].benevol.app/sitemap.xml lists only that
// org's published events (and their custom pages, #188) — the host already scopes it via
// x-org-slug, no need to iterate other orgs. No org context (apex/marketing host) → empty.
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const rawOrgSlug = (await headers()).get("x-org-slug")
  if (!rawOrgSlug) return []

  const resolved = await resolveOrgSlug(rawOrgSlug)
  if (!resolved || resolved.redirectUrl) return []

  const events = await prisma.event.findMany({
    where: { organizationId: resolved.org.id, publicStatus: "published" },
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
