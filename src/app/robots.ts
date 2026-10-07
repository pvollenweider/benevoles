import type { MetadataRoute } from "next"
import { headers } from "next/headers"
import { NON_ORG_SUBDOMAINS } from "@/lib/org-subdomain"
import { apexBaseUrl, orgBaseUrl, isKnownHost } from "@/lib/urls"
import { apexRobotsRules } from "@/lib/crawlers"
import { VIDEO_SITEMAP_PATH } from "@/lib/video-seo"

// Token-bearing and admin/API surfaces: never worth indexing, and some carry secrets in the URL
// (/my/[token], /waitlist/[token]/confirm, /leader/[token] (#186), /admin/accept-invite?token=...).
// /videos is public and indexed since 2026-10-07 (src/lib/video-seo.ts): no longer listed here.
const DISALLOW = ["/admin", "/api/", "/my/", "/waitlist/", "/leader/"]

export default async function robots(): Promise<MetadataRoute.Robots> {
  const host = (await headers()).get("host") ?? ""
  const hostname = host.split(":")[0]
  const parts = hostname.split(".")
  const subdomain = parts.length === 3 ? parts[0] : null

  // Anything outside our own production domain (staging, preview deployments, localhost)
  // disallows everything, so it's never indexed as duplicate content alongside production.
  if (!isKnownHost(hostname) || subdomain === "staging") {
    return { rules: { userAgent: "*", disallow: "/" } }
  }

  const orgSlug = subdomain && !NON_ORG_SUBDOMAINS.has(subdomain) ? subdomain : null

  // An org host lists its events in its own sitemap.
  if (orgSlug) return { rules: { userAgent: "*", allow: "/", disallow: DISALLOW }, sitemap: `${orgBaseUrl(orgSlug)}/sitemap.xml` }

  // The apex host names the search and AI crawlers it welcomes (src/lib/crawlers.ts), its
  // sitemap index (its own sitemap and every organisation's, src/app/sitemap-index.xml) and its
  // video sitemap (src/lib/video-seo.ts).
  return { rules: apexRobotsRules(DISALLOW), sitemap: [`${apexBaseUrl()}/sitemap-index.xml`, `${apexBaseUrl()}${VIDEO_SITEMAP_PATH}`] }
}
