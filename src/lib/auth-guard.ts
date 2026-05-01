import { NextResponse } from "next/server"
import { cookies } from "next/headers"
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

async function resolveSuperAdminOrg(): Promise<string | null> {
  const cookieStore = await cookies()
  const fromCookie = cookieStore.get("sa-org-id")?.value
  if (fromCookie) return fromCookie
  const fallback = await prisma.organization.findFirst({
    orderBy: { createdAt: "asc" },
    select: { id: true },
  })
  return fallback?.id ?? null
}

export async function requireOrgSession() {
  const session = await auth()
  if (!session?.user) return unauthorized()

  let organizationId = session.user.organizationId
  if (!organizationId && session.user.role === "super_admin") {
    organizationId = await resolveSuperAdminOrg()
  }
  if (!organizationId) return forbidden()

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
  }
  if (!organizationId) return null

  return {
    session,
    organizationId,
    db: getOrgClient(organizationId),
  }
}
