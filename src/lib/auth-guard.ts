// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { hasLevel, isFrontDeskRole, OWNER_ONLY_MESSAGE, type Level } from "./permissions"
import { NextResponse } from "next/server"
import type { Session } from "next-auth"
import { cookies, headers } from "next/headers"
import { redirect } from "next/navigation"
import { auth } from "@/auth"
import { getOrgClient } from "./prisma-org"
import { prisma } from "./prisma"
import { adminEventIdFromPath, orgSwitchUrl, REQUEST_PATH_HEADER } from "./admin-next"
import { secondFactorRequired } from "./second-factor-guard"
import { secondFactorUrl } from "./second-factor-session"
import { loadFrontDeskGrant, type FrontDeskGrant } from "./front-desk-access"
import { FRONT_DESK_HOME } from "./front-desk-pages"

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

/**
 * An admin event page (/admin/events/<id>/...) opened by a super admin whose picked organization
 * is missing or another one than the event's, typically from a link in an email: the switch to
 * the event's organization that lands back on the same page. Null when there is nothing to switch
 * (not an event page, unknown event, already in its organization).
 */
export async function superAdminEventOrgSwitch(pickedOrgId: string | null): Promise<string | null> {
  const headerStore = await headers()
  const path = headerStore.get(REQUEST_PATH_HEADER)
  const eventId = adminEventIdFromPath(path)
  if (!path || !eventId) return null
  const event = await prisma.event.findUnique({ where: { id: eventId }, select: { organizationId: true } })
  if (!event || event.organizationId === pickedOrgId) return null
  return orgSwitchUrl(event.organizationId, path)
}

async function isOrgActive(organizationId: string): Promise<boolean> {
  const org = await prisma.organization.findUnique({ where: { id: organizationId }, select: { active: true } })
  return org?.active ?? false
}


/**
 * The checks of requireOrgSession() on a session already read: second factor, level, organisation
 * picked and active. A front-desk account (#1142) reaches no level, so it is refused here like
 * any role that is not an admin level.
 */
async function orgSessionOf(session: Session, level: Level) {
  // Super admin who hasn't given the second factor yet (pentest F6): role and organization are
  // masked anyway, this says why.
  if (session.secondFactor?.pending) return secondFactorRequired()
  if (!hasLevel(session.user?.role, level)) {
    return NextResponse.json({ error: OWNER_ONLY_MESSAGE }, { status: 403 })
  }

  let organizationId = session.user?.organizationId
  if (!organizationId && session.user?.role === "super_admin") {
    organizationId = await resolveSuperAdminOrg()
    if (!organizationId) {
      return NextResponse.json({ error: "Aucune organisation sélectionnée" }, { status: 409 })
    }
  }
  if (!organizationId) return forbidden()
  // Org admin's session may predate the org being disabled — reject on
  // every request, not just at login.
  if (session.user?.role !== "super_admin" && !(await isOrgActive(organizationId))) return forbidden()

  return {
    session,
    organizationId,
    db: getOrgClient(organizationId),
  }
}

/**
 * The organisation session of an admin route. `level` (#469): "organizer" (default) lets both
 * admin levels in; "owner" only owners (and the super admin) — see src/lib/permissions.ts.
 * Never a front-desk account (#1142): it has no level.
 */
export async function requireOrgSession(level: Level = "organizer") {
  const session = await auth()
  if (!session?.user) return unauthorized()
  return orgSessionOf(session, level)
}

/**
 * The session of the two routes a front-desk account may reach (#1142, FRONT_DESK_ROUTES in
 * src/lib/permissions.ts), on the event `eventId` of the route's path. An organiser, an owner or
 * the super admin passes exactly as with requireOrgSession() (`access: "organizer"`, whatever the
 * event: the route then finds it or not through the org-scoped client). A front-desk account
 * passes only with a live grant on that very event, read now (src/lib/front-desk-access.ts):
 * `access: "front_desk"`, with the grant. Any other role, no grant, a revoked or expired one, an
 * archived event, another organisation's event: 403, the same answer whichever it is.
 *
 * The caller still has to narrow what a front-desk account may do with the route (the bulk route
 * keeps the attendance actions only), and must read the event `eventId`, never another one.
 */
export async function requireFrontDeskOrOrganizer(eventId: string) {
  const session = await auth()
  if (!session?.user) return unauthorized()
  if (!isFrontDeskRole(session.user.role)) {
    const guard = await orgSessionOf(session, "organizer")
    if (guard instanceof NextResponse) return guard
    return { ...guard, access: "organizer" as const, grant: null }
  }
  // Front-desk accounts give no second factor (super admins only); a pending one masks the role
  // anyway, so this branch is never reached with it. Checked all the same.
  if (session.secondFactor?.pending) return secondFactorRequired()
  const organizationId = session.user.organizationId
  const adminUserId = session.user.id
  if (!organizationId || !adminUserId || !eventId) return forbidden()
  if (!(await isOrgActive(organizationId))) return forbidden()
  const grant: FrontDeskGrant | null = await loadFrontDeskGrant({ adminUserId, organizationId, eventId, now: new Date() })
  if (!grant) return forbidden()
  return {
    session,
    organizationId,
    db: getOrgClient(organizationId),
    access: "front_desk" as const,
    grant,
  }
}

/** The platform's super admin only: every organisation role, front desk (#1142) included, gets a 403. */
export async function requireSuperAdmin() {
  const session = await auth()
  if (!session?.user) return unauthorized()
  if (session.secondFactor?.pending) return secondFactorRequired()
  if (session.user.role !== "super_admin") return forbidden()
  return { session, db: prisma }
}

/**
 * The organisation context of an admin page: an owner, an organiser, or the super admin in the
 * organisation they picked. Null for anyone else (the pages then send to the login page). A
 * front-desk account (#1142) is no administrator of the organisation: it gets no context and is
 * sent to its own landing page, so no admin page renders for it, whichever one was asked.
 */
export async function getOrgContext() {
  const session = await auth()
  if (!session?.user) return null
  if (session.secondFactor?.pending) {
    const path = (await headers()).get(REQUEST_PATH_HEADER)
    redirect(secondFactorUrl(path))
  }
  if (isFrontDeskRole(session.user.role)) redirect(FRONT_DESK_HOME)
  // An allow-list, as in requireOrgSession(): a role that is no admin level gets no context.
  if (!hasLevel(session.user.role, "organizer")) return null

  let organizationId = session.user.organizationId
  if (!organizationId && session.user.role === "super_admin") {
    organizationId = await resolveSuperAdminOrg()
    // An event page opens in the event's organization, whichever one was picked (email links).
    const orgSwitch = await superAdminEventOrgSwitch(organizationId)
    if (orgSwitch) redirect(orgSwitch)
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
