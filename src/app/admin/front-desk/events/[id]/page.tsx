// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import type { Metadata } from "next"
import Link from "next/link"
import { redirect } from "next/navigation"
import { auth } from "@/auth"
import { ADMIN_HOME } from "@/lib/admin-next"
import { isFrontDeskRole } from "@/lib/permissions"
import { loadFrontDeskGrant } from "@/lib/front-desk-access"
import { FRONT_DESK_HOME } from "@/lib/front-desk-pages"
import { getOrgClient } from "@/lib/prisma-org"
import { loadDayOf } from "@/lib/day-of-load"
import { formatShortDate } from "@/lib/utils"
import FrontDeskDayOfBoard from "@/components/admin/FrontDeskDayOfBoard"
import SignOutButton from "@/components/admin/SignOutButton"

export const dynamic = "force-dynamic"

const noIndex: Metadata["robots"] = { index: false, follow: false }

/**
 * The « Jour J » page of a front-desk account (#1142), in its own route: it never goes through the
 * admin event layout, its tabs or its metadata. The grant is read server-side on every request;
 * without a live one the person is sent back to their landing page, which says the access is over.
 */
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const session = await auth()
  if (!session?.user || !isFrontDeskRole(session.user.role) || !session.user.id || !session.user.organizationId) {
    return { title: "Jour J", robots: noIndex }
  }
  const { id } = await params
  const grant = await loadFrontDeskGrant({ adminUserId: session.user.id, organizationId: session.user.organizationId, eventId: id, now: new Date() })
  return { title: grant ? `Jour J : ${grant.event.title}` : "Accès accueil", robots: noIndex }
}

export default async function FrontDeskDayOfPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) redirect("/admin/login")
  if (!isFrontDeskRole(session.user.role)) redirect(ADMIN_HOME)
  const { id } = await params
  const { id: adminUserId, organizationId } = session.user
  if (!adminUserId || !organizationId) redirect(FRONT_DESK_HOME)

  const now = new Date()
  const grant = await loadFrontDeskGrant({ adminUserId, organizationId, eventId: id, now })
  if (!grant) redirect(FRONT_DESK_HOME)

  const loaded = await loadDayOf(getOrgClient(organizationId), id, now)
  if (!loaded) redirect(FRONT_DESK_HOME)
  const { event, timeZone, board, today, refreshedAt } = loaded
  const dates = formatShortDate(event.startDate) === formatShortDate(event.endDate)
    ? `le ${formatShortDate(event.startDate)}`
    : `du ${formatShortDate(event.startDate)} au ${formatShortDate(event.endDate)}`

  return (
    <main id="main" tabIndex={-1} className="min-h-screen bg-gray-50 px-4 py-6 focus:outline-none">
      <div className="max-w-2xl mx-auto space-y-6">
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm text-gray-700">{grant.event.organizationName}</p>
            <h1 id="page-heading" tabIndex={-1} className="text-xl font-bold text-gray-900 break-words focus:outline-none">{grant.event.title}</h1>
            <p className="text-sm text-gray-700">{dates}</p>
          </div>
          <nav aria-label="Accès accueil" className="flex flex-wrap items-center gap-3">
            <Link href={FRONT_DESK_HOME} className="inline-flex items-center min-h-11 px-4 rounded-xl border border-gray-300 bg-white text-sm font-medium text-gray-800 hover:bg-gray-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600">
              Mes accès
            </Link>
            <SignOutButton />
          </nav>
        </header>

        <FrontDeskDayOfBoard
          eventId={event.id}
          board={board}
          today={today}
          refreshedAt={refreshedAt}
          timeZone={timeZone}
          registrationWindow={{
            publicStatus: event.publicStatus,
            registrationsOpen: event.registrationsOpen,
            registrationOpensAt: event.registrationOpensAt?.toISOString() ?? null,
            registrationClosesAt: event.registrationClosesAt?.toISOString() ?? null,
          }}
        />
      </div>
    </main>
  )
}
