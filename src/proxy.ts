// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import NextAuth from "next-auth"
import { authConfig } from "./auth.config"
import { NextResponse } from "next/server"
import { ORG_HEADER, withOrgHeader } from "@/lib/org-subdomain"
import { apexRedirectUrl, orgHostApexRedirectUrl } from "@/lib/apex-redirect"
import { apexBaseUrl } from "@/lib/urls"
import { frameHeaders } from "@/lib/security-headers"
import { isServerNotFound, NOT_FOUND_ROUTE } from "@/lib/server-not-found"
import { loadDocUnits, resolveDocSlug } from "@/lib/doc-units"
import { loadVideoCatalog } from "@/lib/video-catalog-load"
import { findBlogPost, loadBlogPosts } from "@/lib/blog"
import { reportError } from "@/lib/report-error"
import { REQUEST_PATH_HEADER } from "@/lib/admin-next"

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

// Proxy file convention (Next.js 16, formerly `middleware`): a first filter on pages from the JWT
// alone and the organization header; the authoritative checks stay server-side (auth-guard.ts).
export default auth((req) => {
  const { pathname } = req.nextUrl

  // --- Bare domain to the www site (#759): one address per page for search engines. 308 keeps
  // the method and body of a POST. ---
  const host = req.headers.get("host") ?? ""
  const apexTarget = apexRedirectUrl(host, `${pathname}${req.nextUrl.search}`, apexBaseUrl())
  if (apexTarget) return NextResponse.redirect(apexTarget, 308)

  // --- The apex site's own pages on an organization's host to the www site (#933): the docs,
  // videos, legal and features pages answered on every organization's host too. ---
  const orgHostTarget = orgHostApexRedirectUrl(host, `${pathname}${req.nextUrl.search}`, apexBaseUrl())
  if (orgHostTarget) return NextResponse.redirect(orgHostTarget, 308)

  // --- Auth guards ---
  const isSuperAdminPath = pathname.startsWith("/super-admin")
  const isAdminPath = pathname.startsWith("/admin")
  const isLoginPage = pathname === "/admin/login"
  const isPublicAdminPage = pathname === "/admin/accept-invite" || pathname === "/admin/reset-password" || pathname === "/admin/forgot-password"
    || pathname === "/admin/reactivate" || pathname === "/admin/reactivate/confirm" || pathname === "/admin/keep"

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

  // --- Organization header ---
  // [orgSlug].benevol.app (or ?org= without an org subdomain) → x-org-slug for pages and API
  // routes; a value sent by the client is always dropped first (#541).
  const requestHeaders = withOrgHeader(req.headers, host, req.nextUrl.searchParams.get("org"))
  // The admin page's own address, for the super admin's switch to an event's organization
  // (auth-guard.ts, superAdminEventOrgSwitch); never the client's value.
  requestHeaders.delete(REQUEST_PATH_HEADER)
  if (isAdminPath) requestHeaders.set(REQUEST_PATH_HEADER, `${pathname}${req.nextUrl.search}`)

  // --- A 404 rendered on the server (#935): what is known missing here is answered by the
  // not-found page itself, whose HTML carries the page; `notFound()` during a page's render only
  // sends an empty document that the browser fills in. See src/lib/server-not-found.ts. ---
  const notFound = isServerNotFound(pathname, { hasOrg: requestHeaders.has(ORG_HEADER), docSlugExists, videoExists, blogPostExists })
  const response = notFound
    ? NextResponse.rewrite(new URL(NOT_FOUND_ROUTE, req.url), { request: { headers: requestHeaders } })
    : NextResponse.next({ request: { headers: requestHeaders } })
  // Framing (#948): refused everywhere but the embeddable sign-up (src/lib/security-headers.ts).
  for (const { key, value } of frameHeaders(pathname, req.nextUrl.searchParams)) response.headers.set(key, value)
  return response
})

export const config = {
  matcher: ["/((?!monitoring|_next/static|_next/image|favicon.ico).*)"],
}
