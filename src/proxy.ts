// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import NextAuth from "next-auth"
import { authConfig } from "./auth.config"
import { NextResponse, type NextFetchEvent, type NextRequest } from "next/server"
import { withOrgHeader } from "@/lib/org-subdomain"
import { apexRedirectUrl } from "@/lib/apex-redirect"
import { apexBaseUrl } from "@/lib/urls"
import { anonymousPublicCacheControl } from "@/lib/public-cache"

const { auth } = NextAuth(authConfig)

// Proxy file convention (Next.js 16, formerly `middleware`): a first filter on pages from the JWT
// alone and the organization header; the authoritative checks stay server-side (auth-guard.ts).
//
// An anonymous visit to a public content page (src/lib/public-cache.ts, #773) skips Auth.js: no
// session to read, and Auth.js would answer it with CSRF and callback-URL cookies. It gets the same
// apex redirect and organization header, and a cacheable Cache-Control. Every other request goes
// through Auth.js as before.
export default function proxy(req: NextRequest, event: NextFetchEvent) {
  const cacheControl = anonymousPublicCacheControl({
    method: req.method,
    pathname: req.nextUrl.pathname,
    host: req.headers.get("host") ?? "",
    searchParams: req.nextUrl.searchParams,
    cookieNames: req.cookies.getAll().map((c) => c.name),
  })
  if (cacheControl) {
    const response = route(req, null)
    if (!response.headers.has("location")) response.headers.set("Cache-Control", cacheControl)
    return response
  }
  return withAuth(req, event as unknown as Parameters<typeof withAuth>[1])
}

const withAuth = auth((req) => route(req, req.auth))

function route(req: NextRequest, session: { user?: { role?: string } } | null): NextResponse | Response {
  const { pathname } = req.nextUrl

  // --- Bare domain to the www site (#759): one address per page for search engines. 308 keeps
  // the method and body of a POST. ---
  const apexTarget = apexRedirectUrl(req.headers.get("host") ?? "", `${pathname}${req.nextUrl.search}`, apexBaseUrl())
  if (apexTarget) return NextResponse.redirect(apexTarget, 308)

  // --- Auth guards ---
  const isSuperAdminPath = pathname.startsWith("/super-admin")
  const isAdminPath = pathname.startsWith("/admin")
  const isLoginPage = pathname === "/admin/login"
  const isPublicAdminPage = pathname === "/admin/accept-invite" || pathname === "/admin/reset-password" || pathname === "/admin/forgot-password"

  if (isSuperAdminPath) {
    if (!session) {
      const loginUrl = new URL("/admin/login", req.url)
      loginUrl.searchParams.set("callbackUrl", req.url)
      return Response.redirect(loginUrl)
    }
    if (session.user?.role !== "super_admin") {
      return Response.redirect(new URL("/admin", req.url))
    }
  }

  if (isAdminPath && !isLoginPage && !isPublicAdminPage && !session) {
    const loginUrl = new URL("/admin/login", req.url)
    loginUrl.searchParams.set("callbackUrl", req.url)
    return Response.redirect(loginUrl)
  }

  // --- Organization header ---
  // [orgSlug].benevol.app (or ?org= without an org subdomain) → x-org-slug for pages and API
  // routes; a value sent by the client is always dropped first (#541).
  const requestHeaders = withOrgHeader(req.headers, req.headers.get("host") ?? "", req.nextUrl.searchParams.get("org"))

  return NextResponse.next({ request: { headers: requestHeaders } })
}

export const config = {
  matcher: ["/((?!monitoring|_next/static|_next/image|favicon.ico).*)"],
}
