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
 */
export async function requireOrgSession() {
  const session = await auth()
  if (!session?.user) return unauthorized()
  const organizationId = session.user.organizationId
  if (!organizationId) {
    // Super admins must use the dedicated super-admin routes; refuse to
    // operate without an org context to avoid accidental cross-tenant writes.
    return forbidden()
  }
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
 * `null` when the caller is not attached to an organization. Pages should
 * `redirect()` or call `notFound()` based on the result.
 */
export async function getOrgContext() {
  const session = await auth()
  const organizationId = session?.user?.organizationId
  if (!session?.user || !organizationId) return null
  return {
    session,
    organizationId,
    db: getOrgClient(organizationId),
  }
}
