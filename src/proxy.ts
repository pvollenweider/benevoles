// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import NextAuth from "next-auth"
import { authConfig } from "./auth.config"
import { NextResponse } from "next/server"
import { orgSlugFromHost } from "@/lib/org-subdomain"
import { cleanPath } from "@/lib/clean-path"

const { auth } = NextAuth(authConfig)

// Proxy file convention (Next.js 16, formerly `middleware`): a first filter on pages from the JWT
// alone and the organization header; the authoritative checks stay server-side (auth-guard.ts).
export default auth((req) => {
  const { pathname } = req.nextUrl

  // `//events` would crash the client router (it reads it as the host « events »): redirect to
  // the clean path, same host, query kept.
  const clean = cleanPath(pathname)
  if (clean) {
    const url = req.nextUrl.clone()
    url.pathname = clean
    return NextResponse.redirect(url, 308)
  }

  // --- Auth guards ---
  const isSuperAdminPath = pathname.startsWith("/super-admin")
  const isAdminPath = pathname.startsWith("/admin")
  const isLoginPage = pathname === "/admin/login"
  const isPublicAdminPage = pathname === "/admin/accept-invite" || pathname === "/admin/reset-password" || pathname === "/admin/forgot-password"

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

  // --- Org subdomain injection ---
  // [orgSlug].benevol.app → inject x-org-slug header for server components and API routes
  const requestHeaders = new Headers(req.headers)
  const orgSlug = orgSlugFromHost(req.headers.get("host") ?? "")
  if (orgSlug) {
    requestHeaders.set("x-org-slug", orgSlug)
  } else {
    // Dev fallback: ?org=slug query param when no subdomain available
    const orgFromQuery = req.nextUrl.searchParams.get("org")
    if (orgFromQuery) requestHeaders.set("x-org-slug", orgFromQuery)
  }

  return NextResponse.next({ request: { headers: requestHeaders } })
})

export const config = {
  matcher: ["/((?!monitoring|_next/static|_next/image|favicon.ico).*)"],
}
