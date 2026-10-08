// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { orgSlugFromHost } from "@/lib/org-subdomain"

/**
 * Anonymous visits to the public content pages (#773, #759 F3): no Auth.js cookie, and a response
 * the browser (back/forward cache) and a shared cache may keep. Pure, so the proxy only wires it.
 *
 * Without this, the proxy ran Auth.js on every request: Auth.js answers each one with a fresh CSRF
 * cookie and a callback-URL cookie when the visitor has none, and Next.js sends every page rendered
 * per request as `private, no-cache, no-store`. A marketing or documentation page could then never
 * be cached and never restored from the back/forward cache.
 *
 * A request qualifies only when everything below holds; otherwise it goes through Auth.js and keeps
 * Next.js's default `no-store`, exactly as before:
 * - GET or HEAD: a form or server action still runs Auth.js;
 * - one of the public content pages (PUBLIC_CONTENT_PATHS): the same HTML for every visitor, no
 *   session read, absolute URLs from NEXT_PUBLIC_APP_URL (one value per deployment, never the host);
 *   never the admin, the super-admin, an API route, a personal-link page or an event page;
 * - no organisation: neither an organisation's subdomain nor `?org=` (the home page `/` is then the
 *   organisation's own page, from the database);
 * - no `token` or `t` in the query (invitations and personal links travel that way);
 * - no Auth.js session cookie: a signed-in visitor keeps going through Auth.js (its session is
 *   refreshed there) and never gets a cacheable response;
 * - not a file (a dot in the last segment: /videos/og-image.png keeps its own cache rules).
 */
export const PUBLIC_CONTENT_PATHS: readonly string[] = ["/", "/fonctionnalites", "/nouveautes", "/accessibilite", "/doc", "/videos", "/legal"]

/** Paths whose subpages are public content too: /doc/<unit>, /videos/<id>, /legal/<page>. */
const PUBLIC_CONTENT_PREFIXES: readonly string[] = ["/doc/", "/videos/", "/legal/"]

/**
 * A qualifying page: the browser revalidates on each visit (max-age=0), so a deploy shows at once,
 * and may keep the page in its back/forward cache (no `no-store`); a shared cache (none in front of
 * benevol.app today) may serve it for a minute, then five more while it fetches the new one.
 *
 * The same value goes to the page's RSC payload (client navigation and prefetch): the proxy cannot
 * tell it from the HTML, since Next.js removes the `RSC` request headers and the `_rsc` parameter
 * before the proxy runs. Next.js sends `Vary: rsc, next-router-state-tree, next-router-prefetch…`
 * with both, and `_rsc` stays in the URL, so a cache keeps them apart, as it does for the pages
 * Next.js prerenders itself (`s-maxage` on both too).
 */
export const PUBLIC_PAGE_CACHE = "public, max-age=0, s-maxage=60, stale-while-revalidate=300"

/** Auth.js's session cookie, chunked (`.0`, `.1`…) when large, `__Secure-` prefixed over HTTPS. */
const SESSION_COOKIE = /^(__Secure-)?authjs\.session-token(\.\d+)?$/

export type PublicCacheRequest = {
  method: string
  pathname: string
  host: string
  searchParams: URLSearchParams
  cookieNames: readonly string[]
}

export function isPublicContentPath(pathname: string): boolean {
  const last = pathname.slice(pathname.lastIndexOf("/") + 1)
  if (last.includes(".")) return false
  return PUBLIC_CONTENT_PATHS.includes(pathname) || PUBLIC_CONTENT_PREFIXES.some((p) => pathname.startsWith(p) && pathname.length > p.length)
}

/**
 * The Cache-Control of an anonymous public content request, or null when the request must go
 * through Auth.js with Next.js's default headers (see the module comment for every condition).
 */
export function anonymousPublicCacheControl(req: PublicCacheRequest): string | null {
  if (req.method !== "GET" && req.method !== "HEAD") return null
  if (!isPublicContentPath(req.pathname)) return null
  if (orgSlugFromHost(req.host) !== null) return null
  if (req.searchParams.get("org") || req.searchParams.has("token") || req.searchParams.has("t")) return null
  if (req.cookieNames.some((name) => SESSION_COOKIE.test(name))) return null
  return PUBLIC_PAGE_CACHE
}
