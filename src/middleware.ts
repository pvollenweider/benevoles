import NextAuth from "next-auth"
import { authConfig } from "./auth.config"
import { NextResponse } from "next/server"

const { auth } = NextAuth(authConfig)

const NON_ORG_SUBDOMAINS = new Set(["www", "app", "admin", "api", "staging"])

export default auth((req) => {
  const { pathname } = req.nextUrl

  // --- Auth guards ---
  const isSuperAdminPath = pathname.startsWith("/super-admin")
  const isAdminPath = pathname.startsWith("/admin")
  const isLoginPage = pathname === "/admin/login"

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

  if (isAdminPath && !isLoginPage && !req.auth) {
    const loginUrl = new URL("/admin/login", req.url)
    loginUrl.searchParams.set("callbackUrl", req.url)
    return Response.redirect(loginUrl)
  }

  // --- Org subdomain injection ---
  // [orgSlug].benevol.app → inject x-org-slug header for server components and API routes
  const host = (req.headers.get("host") ?? "").split(":")[0]
  const parts = host.split(".")
  const requestHeaders = new Headers(req.headers)
  if (parts.length === 3 && !NON_ORG_SUBDOMAINS.has(parts[0])) {
    requestHeaders.set("x-org-slug", parts[0])
  }

  return NextResponse.next({ request: { headers: requestHeaders } })
})

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
}
