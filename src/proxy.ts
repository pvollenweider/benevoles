// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import NextAuth from "next-auth"
import { authConfig } from "./auth.config"
import { NextResponse, type NextFetchEvent, type NextRequest } from "next/server"
import type { NextAuthRequest } from "next-auth"
import { ORG_HEADER, withOrgHeader } from "@/lib/org-subdomain"
import { apexRedirectUrl, orgHostApexRedirectUrl } from "@/lib/apex-redirect"
import { apexBaseUrl, configuredAppUrl, isKnownHost } from "@/lib/urls"
import { checkAdminMutation } from "@/lib/request-origin"
import { createNonce, pageSecurityHeaders } from "@/lib/security-headers"
import { isServerNotFound, NOT_FOUND_ROUTE } from "@/lib/server-not-found"
import { loadDocUnits, resolveDocSlug } from "@/lib/doc-units"
import { loadVideoCatalog } from "@/lib/video-catalog-load"
import { findBlogPost, loadBlogPosts } from "@/lib/blog"
import { findRessource, loadRessources } from "@/lib/ressources"
import { reportError } from "@/lib/report-error"
import { REQUEST_PATH_HEADER } from "@/lib/admin-next"
import { isAuthEndpoint } from "@/lib/auth-endpoints"
import { SECOND_FACTOR_PATH, secondFactorUrl } from "@/lib/second-factor-session"
import { isFrontDeskRole } from "@/lib/permissions"
import { frontDeskRedirect } from "@/lib/front-desk-pages"
import { markdownAnswer } from "@/lib/markdown-request"
import { loadLlmsSources } from "@/lib/llms-sources"
import { markdownPathForPage } from "@/lib/doc-pages"
import { absoluteUrl } from "@/lib/seo-metadata"

const { auth } = NextAuth(authConfig)

// The lookups of the server-rendered 404 (#935), read from the files shipped in the image. A
// source that can't be read answers « exists »: the page then decides, as before.
function docSlugExists(slug: string): boolean {
  try {
    return resolveDocSlug(slug, loadDocUnits()) !== null
  } catch (error) {
    reportError("proxy-not-found-doc")(error)
    return true
  }
}

// A former slug of a unit redirects to it; only a current slug has a Markdown variant (the
// response's Link header, below), so this lookup is stricter than the 404 one.
function docUnitExists(slug: string): boolean {
  try {
    const found = resolveDocSlug(slug, loadDocUnits())
    return found !== null && "unit" in found
  } catch (error) {
    reportError("proxy-markdown-doc")(error)
    return false
  }
}

function videoExists(param: string): boolean {
  try {
    return loadVideoCatalog().some((v) => v.id === param || v.slug === param)
  } catch (error) {
    reportError("proxy-not-found-video")(error)
    return true
  }
}

function blogPostExists(slug: string): boolean {
  try {
    return findBlogPost(slug, loadBlogPosts()) !== null
  } catch (error) {
    reportError("proxy-not-found-blog")(error)
    return true
  }
}

function ressourceExists(slug: string): boolean {
  try {
    return findRessource(slug, loadRessources()) !== null
  } catch (error) {
    reportError("proxy-not-found-ressource")(error)
    return true
  }
}

// Proxy file convention (Next.js 16, formerly `middleware`): a first filter on pages from the JWT
// alone and the organization header; the authoritative checks stay server-side (auth-guard.ts).
function handle(req: NextAuthRequest): Response {
  const { pathname } = req.nextUrl

  // --- Bare domain to the www site (#759): one address per page for search engines. 308 keeps
  // the method and body of a POST. ---
  const host = req.headers.get("host") ?? ""
  const hostname = host.split(":")[0]
  const apexTarget = apexRedirectUrl(host, `${pathname}${req.nextUrl.search}`, apexBaseUrl())
  if (apexTarget) return NextResponse.redirect(apexTarget, 308)

  // --- The apex site's own pages on an organization's host to the www site (#933): the docs,
  // videos, legal and features pages answered on every organization's host too. ---
  // A `.md` request is handled below instead: on an organization's host, staging or an unknown
  // host it answers 404 like /llms.txt, and the apex has its own route.
  const orgHostTarget = pathname.endsWith(".md") ? null : orgHostApexRedirectUrl(host, `${pathname}${req.nextUrl.search}`, apexBaseUrl())
  if (orgHostTarget) return NextResponse.redirect(orgHostTarget, 308)

  // --- Organization header ---
  // [orgSlug].benevol.app (or ?org= without an org subdomain) → x-org-slug for pages and API
  // routes; a value sent by the client is always dropped first (#541).
  const requestHeaders = withOrgHeader(req.headers, host, req.nextUrl.searchParams.get("org"))
  // The admin page's own address, for the super admin's switch to an event's organization
  // (auth-guard.ts, superAdminEventOrgSwitch); never the client's value.
  requestHeaders.delete(REQUEST_PATH_HEADER)

  // --- Script and framing policy (src/lib/security-headers.ts): a fresh nonce per request, on the
  // forwarded request too, where Next.js reads it for its own scripts (any client value replaced). ---
  const pageHeaders = pageSecurityHeaders(pathname, req.nextUrl.searchParams, { nonce: createNonce(), dev: process.env.NODE_ENV === "development" })
  for (const { key, value } of pageHeaders) if (key === "Content-Security-Policy") requestHeaders.set(key, value)

  // --- Cross-site request forgery (#1048): a state-changing call to the admin APIs must come from
  // one of this site's own pages and carry JSON (policy in src/lib/request-origin.ts). ---
  const refused = checkAdminMutation({ method: req.method, pathname, headers: req.headers, configuredAppUrl: configuredAppUrl(), nodeEnv: process.env.NODE_ENV })
  if (refused) return NextResponse.json({ error: refused.error }, { status: refused.status })

  // --- The Markdown variant of a public page (llmstxt.org): the proxy answers `/x.md` itself on
  // the apex site, and with the site's 404 on an organization's host, staging, an unknown host or
  // a page without one (src/lib/markdown-request.ts). After the origin check and before the auth
  // guards and the 404 lookups: a path with a dot is never an event slug nor an admin page. ---
  const markdown = markdownAnswer({ pathname, method: req.method, host, hasOrg: requestHeaders.has(ORG_HEADER) }, () => loadLlmsSources(true))
  if (markdown) {
    const response = markdown.status === 200
      ? new NextResponse(req.method === "HEAD" ? null : markdown.body, { status: 200, headers: markdown.headers })
      : NextResponse.rewrite(new URL(NOT_FOUND_ROUTE, req.url), { request: { headers: requestHeaders } })
    for (const { key, value } of pageHeaders) response.headers.set(key, value)
    return response
  }

  // --- Auth guards ---
  const isSuperAdminPath = pathname.startsWith("/super-admin")
  const isAdminPath = pathname.startsWith("/admin")
  const isLoginPage = pathname === "/admin/login"
  const isPublicAdminPage = pathname === "/admin/accept-invite" || pathname === "/admin/reset-password" || pathname === "/admin/forgot-password"
    || pathname === "/admin/reactivate" || pathname === "/admin/reactivate/confirm" || pathname === "/admin/keep"
  if (isAdminPath) requestHeaders.set(REQUEST_PATH_HEADER, `${pathname}${req.nextUrl.search}`)

  // --- Second factor (pentest F6): a super admin signed in with the password only reaches the
  // two-factor page and nothing else of the admin, before any role check (the role is masked in
  // such a session). The pages and API routes check it again on the server (auth-guard.ts). ---
  if (req.auth?.secondFactor?.pending && (isSuperAdminPath || isAdminPath) && !isLoginPage && !isPublicAdminPage && pathname !== SECOND_FACTOR_PATH) {
    return Response.redirect(new URL(secondFactorUrl(`${pathname}${req.nextUrl.search}`), req.url))
  }

  // --- Front desk (#1142): an account limited to one event opens its own landing page and the
  // pages that need no session, nothing else of the admin or super-admin spaces
  // (src/lib/front-desk-pages.ts). From the token as issued. The only place of the proxy with
  // this rule (not the `authorized` callback of src/auth.config.ts, whose Response would skip
  // this function): it comes after the canonical-host redirects and the origin check above, and
  // answers like the role redirects just below. The pages check the role again on the server
  // (auth-guard.ts, admin layout). ---
  if (isFrontDeskRole(req.auth?.user?.role)) {
    const frontDeskTarget = frontDeskRedirect(pathname)
    if (frontDeskTarget) return Response.redirect(new URL(frontDeskTarget, req.url))
  }

  if (isSuperAdminPath) {
    if (!req.auth) {
      const loginUrl = new URL("/admin/login", req.url)
      loginUrl.searchParams.set("callbackUrl", req.url)
      return Response.redirect(loginUrl)
    }
    if (req.auth.user?.role !== "super_admin") {
      return Response.redirect(new URL("/admin", req.url))
    }
  }

  if (isAdminPath && !isLoginPage && !isPublicAdminPage && !req.auth) {
    const loginUrl = new URL("/admin/login", req.url)
    loginUrl.searchParams.set("callbackUrl", req.url)
    return Response.redirect(loginUrl)
  }

  // --- A 404 rendered on the server (#935): what is known missing here is answered by the
  // not-found page itself, whose HTML carries the page; `notFound()` during a page's render only
  // sends an empty document that the browser fills in. See src/lib/server-not-found.ts. ---
  const notFound = isServerNotFound(pathname, { hasOrg: requestHeaders.has(ORG_HEADER), docSlugExists, videoExists, blogPostExists, ressourceExists })
  const response = notFound
    ? NextResponse.rewrite(new URL(NOT_FOUND_ROUTE, req.url), { request: { headers: requestHeaders } })
    : NextResponse.next({ request: { headers: requestHeaders } })
  // Framing (#948) refused everywhere but the embeddable sign-up; scripts by nonce and hash only.
  for (const { key, value } of pageHeaders) response.headers.set(key, value)
  // The Markdown variant of a covered HTML page, announced in the response as in its metadata.
  // A page without one, a 404, an organization's host, staging and an unknown host send no header.
  if (!notFound && (req.method === "GET" || req.method === "HEAD") && !requestHeaders.has(ORG_HEADER) && isKnownHost(hostname) && !hostname.startsWith("staging.")) {
    const markdownPath = markdownPathForPage(pathname, { docUnitExists, blogPostExists, ressourceExists })
    if (markdownPath) response.headers.append("Link", `<${absoluteUrl(apexBaseUrl(), markdownPath)}>; rel="alternate"; type="text/markdown"`)
  }
  return response
}

// Typed with the event so the middleware overload of auth() is the one picked.
const withSession = auth((req: NextAuthRequest, event: NextFetchEvent) => {
  void event
  return handle(req)
})

/**
 * next-auth's own endpoints (/api/auth/…) go through without the session wrapper: they read and
 * write the session cookie themselves, and the wrapper renewed that cookie on the sign-out
 * response too, right before next-auth's deletion (the browser kept only the last one, but the
 * response carried a fresh session cookie). Nothing here needs the session on those paths.
 */
export default function proxy(req: NextRequest, event: NextFetchEvent) {
  if (isAuthEndpoint(req.nextUrl.pathname)) return handle(Object.assign(req, { auth: null }))
  return withSession(req, event)
}

// Every path but the Sentry tunnel, Next.js's own files and the favicon. Each exclusion is anchored
// (whole segment or end of path): an event slug such as `monitoring-…` still goes through the proxy.
// Kept a literal (Next.js reads it from the source); tested in src/lib/__tests__/proxy-matcher.test.ts.
export const config = {
  matcher: ["/((?!monitoring(?:/|$)|_next/static/|_next/image$|favicon\\.ico$).*)"],
}
