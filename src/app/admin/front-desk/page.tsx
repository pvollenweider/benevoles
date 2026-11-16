// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import type { Metadata } from "next"
import Link from "next/link"
import { redirect } from "next/navigation"
import { auth } from "@/auth"
import { ADMIN_HOME } from "@/lib/admin-next"
import { isFrontDeskRole } from "@/lib/permissions"
import { formatFrontDeskDay, loadFrontDeskAccesses, type FrontDeskEventLink } from "@/lib/front-desk-access"
import SignOutButton from "@/components/admin/SignOutButton"

export const dynamic = "force-dynamic"
export const metadata: Metadata = { title: "Accès accueil", robots: { index: false, follow: false } }

const linkClass =
  "inline-flex items-center min-h-11 px-4 py-2 rounded-xl border border-blue-600 bg-white text-sm font-medium text-blue-700 underline underline-offset-2 break-words hover:bg-blue-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"

/** « le 14 juin 2026 » or « du 12 au 14 juin 2026 », in the stored calendar days (UTC). */
function datesOf(access: FrontDeskEventLink): string {
  return formatFrontDeskDay(access.startDate) === formatFrontDeskDay(access.endDate)
    ? `le ${formatFrontDeskDay(access.startDate)}`
    : `du ${formatFrontDeskDay(access.startDate)} au ${formatFrontDeskDay(access.endDate)}`
}

/**
 * The landing page of a front-desk account (#1142), and its only page besides the day-of pages of
 * the events it holds a live grant on: the proxy, the admin layout and every page's loader send it
 * here (src/lib/front-desk-pages.ts). It lists the person's live accesses, with nothing of the
 * organisation they cannot open, and lets them sign out.
 */
export default async function FrontDeskPage() {
  const session = await auth()
  if (!session?.user) redirect("/admin/login")
  // Anyone else has the admin itself (or the second-factor step it leads to).
  if (!isFrontDeskRole(session.user.role)) redirect(ADMIN_HOME)

  const adminUserId = session.user.id
  const organizationId = session.user.organizationId
  // A dedicated loader, never getOrgContext: the role is no administrator of the organisation.
  const accesses = adminUserId && organizationId
    ? await loadFrontDeskAccesses({ adminUserId, organizationId, now: new Date() })
    : []

  const accessLink = (access: FrontDeskEventLink) => (
    <Link href={`/admin/front-desk/events/${encodeURIComponent(access.eventId)}`} className={linkClass}>
      Ouvrir le pointage : {access.eventTitle}, {datesOf(access)}
    </Link>
  )

  return (
    <main id="main" tabIndex={-1} className="min-h-screen bg-gray-50 flex items-center justify-center px-4 py-6 focus:outline-none">
      <div className="w-full max-w-lg">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-gray-900">Accès accueil</h1>
        </div>
        <div className="bg-white rounded-2xl border border-gray-200 p-6 space-y-5">
          {accesses.length === 0 ? (
            <p className="text-sm text-gray-700">Vous n&apos;avez plus d&apos;accès en cours. Adressez-vous à la personne qui vous a invité.</p>
          ) : accesses.length === 1 ? (
            <p>{accessLink(accesses[0])}</p>
          ) : (
            <ul role="list" className="space-y-3">
              {accesses.map((access) => <li key={access.accessId}>{accessLink(access)}</li>)}
            </ul>
          )}
          <SignOutButton />
        </div>
      </div>
    </main>
  )
}
