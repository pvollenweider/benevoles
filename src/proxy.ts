// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import NextAuth from "next-auth"
import { authConfig } from "./auth.config"
import { NextResponse } from "next/server"
import { withOrgHeader } from "@/lib/org-subdomain"
import { apexRedirectUrl, orgHostApexRedirectUrl } from "@/lib/apex-redirect"
import { apexBaseUrl } from "@/lib/urls"
import { frameHeaders } from "@/lib/security-headers"

const { auth } = NextAuth(authConfig)

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

  const response = NextResponse.next({ request: { headers: requestHeaders } })
  // Framing (#948): refused everywhere but the embeddable sign-up (src/lib/security-headers.ts).
  for (const { key, value } of frameHeaders(pathname, req.nextUrl.searchParams)) response.headers.set(key, value)
  return response
})

export const config = {
  matcher: ["/((?!monitoring|_next/static|_next/image|favicon.ico).*)"],
}
