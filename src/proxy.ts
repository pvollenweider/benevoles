// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import NextAuth from "next-auth"
import { authConfig } from "./auth.config"
import { NextResponse } from "next/server"
import { withOrgHeader } from "@/lib/org-subdomain"

const { auth } = NextAuth(authConfig)

// Proxy file convention (Next.js 16, formerly `middleware`): a first filter on pages from the JWT
// alone and the organization header; the authoritative checks stay server-side (auth-guard.ts).
export default auth((req) => {
  const { pathname } = req.nextUrl

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

  // --- Organization header ---
  // [orgSlug].benevol.app (or ?org= without an org subdomain) → x-org-slug for pages and API
  // routes; a value sent by the client is always dropped first (#541).
  const requestHeaders = withOrgHeader(req.headers, req.headers.get("host") ?? "", req.nextUrl.searchParams.get("org"))

  return NextResponse.next({ request: { headers: requestHeaders } })
})

export const config = {
  matcher: ["/((?!monitoring|_next/static|_next/image|favicon.ico).*)"],
}
