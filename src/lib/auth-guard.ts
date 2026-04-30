import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { getOrgClient } from "./prisma-org"
import { prisma } from "./prisma"

/**
 * Sentinel error returned by the route helpers below. Routes propagate
 * it directly when present.
 */
type GuardError = NextResponse

function unauthorized(): GuardError {
  return NextResponse.json({ error: "Non autorisé" }, { status: 401 })
}

function forbidden(): GuardError {
  return NextResponse.json({ error: "Accès refusé" }, { status: 403 })
}

/**
 * Ensures the caller is an authenticated admin attached to an organization.
 * Returns the session, the organization id and a Prisma client that
 * automatically scopes reads to the caller's organization.
 *
 * Use in any /api/admin/** route:
 *
 *   const guard = await requireOrgSession()
 *   if (guard instanceof NextResponse) return guard
 *   const { db, organizationId } = guard
 *
 * Super admins (no organizationId in their JWT) are silently routed to
 * the first organization, mirroring `getOrgContext` so the SSR pages
 * and the API routes they call agree on which org to use until a
 * proper super-admin UI with an org switcher exists (issue #35).
 */
export async function requireOrgSession() {
  const session = await auth()
  if (!session?.user) return unauthorized()

  let organizationId = session.user.organizationId
  if (!organizationId && session.user.role === "super_admin") {
    const fallback = await prisma.organization.findFirst({
      orderBy: { createdAt: "asc" },
      select: { id: true },
    })
    if (fallback) organizationId = fallback.id
  }
  if (!organizationId) return forbidden()

  return {
    session,
    organizationId,
    db: getOrgClient(organizationId),
  }
}

/**
 * Ensures the caller is the platform super admin. Returns the unscoped
 * Prisma client.
 */
export async function requireSuperAdmin() {
  const session = await auth()
  if (!session?.user) return unauthorized()
  if (session.user.role !== "super_admin") return forbidden()
  return { session, db: prisma }
}

/**
 * SSR variant for Server Components. Returns the org-scoped client or
 * `null` when the caller is not authenticated. Pages should `redirect()`
 * or call `notFound()` based on the result.
 *
 * Super admins (no organizationId in their JWT) are silently routed to
 * the first organization in the database so they can use the regular
 * /admin/* pages without bouncing back to the login page. A proper
 * /super-admin UI with an org switcher is on the roadmap (issue #35);
 * until then this acts as the impersonation default.
 */
export async function getOrgContext() {
  const session = await auth()
  if (!session?.user) return null

  let organizationId = session.user.organizationId
  if (!organizationId && session.user.role === "super_admin") {
    const fallback = await prisma.organization.findFirst({
      orderBy: { createdAt: "asc" },
      select: { id: true },
    })
    if (!fallback) return null
    organizationId = fallback.id
  }
  if (!organizationId) return null

  return {
    session,
    organizationId,
    db: getOrgClient(organizationId),
  }
}
