// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { orgSlugFromHost } from "@/lib/org-subdomain"

/**
 * The bare domain (benevol.app) served every page in 200 next to www.benevol.app, the canonical
 * site (#759): duplicates for search engines. When the site's address is a www host, a request to
 * the bare domain gets the same path and query on that address. Pure, so the proxy only wires it.
 *
 * Returns null when nothing should change: another host (www, an organization's subdomain,
 * localhost) or a site address without « www. ».
 */
export function apexRedirectUrl(host: string, pathAndQuery: string, appUrl: string): string | null {
  let canonical: URL
  try {
    canonical = new URL(appUrl)
  } catch {
    return null
  }
  if (!canonical.hostname.startsWith("www.")) return null
  const bare = canonical.hostname.slice("www.".length)
  if (host.split(":")[0].toLowerCase() !== bare) return null
  const path = pathAndQuery.startsWith("/") ? pathAndQuery : `/${pathAndQuery}`
  return `${canonical.origin}${path}`
}

/**
 * The apex site's own pages (#933): the features and editorial pages, the documentation, the video
 * library, the legal pages and the accessibility statement (src/lib/doc-pages.ts), the sign-up
 * page, the product-updates page and the llms.txt files. An organisation's host answered them in
 * 200 too, and their relative links made crawlers walk the whole public site again on every
 * organisation's host. Everything else stays on that host: its events and their pages, its root,
 * /my, /leader, /waitlist, /admin, /api, robots.txt and its own sitemap.
 */
export const APEX_ONLY_PATHS: readonly string[] = [
  "/fonctionnalites",
  "/logiciel-planning-benevoles",
  "/nouveautes",
  "/accessibilite",
  "/legal",
  "/doc",
  "/videos",
  "/inscription",
  "/product-updates",
  "/llms.txt",
  "/llms-full.txt",
]

/** Whether a path is one of the apex site's own pages: the path itself or below it, never a longer slug (`/documentation`). */
export function isApexOnlyPath(pathname: string): boolean {
  return APEX_ONLY_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))
}

/**
 * Where an organisation's host sends one of the apex site's own pages (#933): the same path and
 * query on the site's address, so each page has one URL. Null for any other path, for a host that
 * is not an organisation's (`<slug>.<domain>` of the site's address, its bare domain without
 * « www. »), and on the site's own host, so it can never loop.
 */
export function orgHostApexRedirectUrl(host: string, pathAndQuery: string, appUrl: string): string | null {
  let canonical: URL
  try {
    canonical = new URL(appUrl)
  } catch {
    return null
  }
  const hostname = host.split(":")[0].toLowerCase()
  const baseDomain = canonical.hostname.replace(/^www\./, "")
  if (hostname === canonical.hostname || !hostname.endsWith(`.${baseDomain}`)) return null
  if (hostname.slice(0, -(baseDomain.length + 1)).includes(".") || !orgSlugFromHost(hostname)) return null
  const path = pathAndQuery.startsWith("/") ? pathAndQuery : `/${pathAndQuery}`
  if (!isApexOnlyPath(path.split(/[?#]/)[0])) return null
  return `${canonical.origin}${path}`
}
