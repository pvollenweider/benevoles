import type { MetadataRoute } from "next"
import { headers } from "next/headers"
import { NON_ORG_SUBDOMAINS } from "@/lib/org-subdomain"
import { apexBaseUrl, orgBaseUrl, isKnownHost } from "@/lib/urls"

// Token-bearing and admin/API surfaces: never worth indexing, and some carry secrets in the URL
// (/my/[token], /waitlist/[token]/confirm, /leader/[token] (#186), /admin/accept-invite?token=...).
// /videos (#644): unlisted video library, not linked from anywhere; each page also sets its own
// `robots: noindex,nofollow` metadata, but a crawler still shouldn't walk the gallery at all.
const DISALLOW = ["/admin", "/api/", "/my/", "/waitlist/", "/leader/", "/videos"]

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

  return {
    rules: { userAgent: "*", allow: "/", disallow: DISALLOW },
    // An org host lists its events; the apex host lists the home and the documentation.
    sitemap: orgSlug ? `${orgBaseUrl(orgSlug)}/sitemap.xml` : `${apexBaseUrl()}/sitemap.xml`,
  }
}
