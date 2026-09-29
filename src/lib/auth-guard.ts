// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { auth } from "@/auth"
import { getOrgClient } from "./prisma-org"
import { prisma } from "./prisma"

type GuardError = NextResponse

function unauthorized(): GuardError {
  return NextResponse.json({ error: "Non autorisé" }, { status: 401 })
}

function forbidden(): GuardError {
  return NextResponse.json({ error: "Accès refusé" }, { status: 403 })
}

/**
 * The organization a super admin explicitly picked (sa-org-id cookie, set from the org list).
 * No implicit fallback: without a valid pick there is no tenant context, rather than silently
 * working on some other organization than the one the super admin believes they're in.
 */
export async function resolveSuperAdminOrg(): Promise<string | null> {
  const cookieStore = await cookies()
  const fromCookie = cookieStore.get("sa-org-id")?.value
  if (!fromCookie) return null
  const org = await prisma.organization.findUnique({ where: { id: fromCookie }, select: { id: true } })
  return org?.id ?? null
}

export const SUPER_ADMIN_ORG_PICKER = "/super-admin/organizations"

async function isOrgActive(organizationId: string): Promise<boolean> {
  const org = await prisma.organization.findUnique({ where: { id: organizationId }, select: { active: true } })
  return org?.active ?? false
}

export async function requireOrgSession() {
  const session = await auth()
  if (!session?.user) return unauthorized()

  let organizationId = session.user.organizationId
  if (!organizationId && session.user.role === "super_admin") {
    organizationId = await resolveSuperAdminOrg()
    if (!organizationId) {
      return NextResponse.json({ error: "Aucune organisation sélectionnée" }, { status: 409 })
    }
  }
  if (!organizationId) return forbidden()
  // Org admin's session may predate the org being disabled — reject on
  // every request, not just at login.
  if (session.user.role !== "super_admin" && !(await isOrgActive(organizationId))) return forbidden()

  return {
    session,
    organizationId,
    db: getOrgClient(organizationId),
  }
}

export async function requireSuperAdmin() {
  const session = await auth()
  if (!session?.user) return unauthorized()
  if (session.user.role !== "super_admin") return forbidden()
  return { session, db: prisma }
}

export async function getOrgContext() {
  const session = await auth()
  if (!session?.user) return null

  let organizationId = session.user.organizationId
  if (!organizationId && session.user.role === "super_admin") {
    organizationId = await resolveSuperAdminOrg()
    // Admin pages are only reachable for a super admin once an org is picked.
    if (!organizationId) redirect(SUPER_ADMIN_ORG_PICKER)
  }
  if (!organizationId) return null
  if (session.user.role !== "super_admin" && !(await isOrgActive(organizationId))) return null

  return {
    session,
    organizationId,
    db: getOrgClient(organizationId),
  }
}
