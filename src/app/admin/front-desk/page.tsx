// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { auth } from "@/auth"
import { ADMIN_HOME } from "@/lib/admin-next"
import { isFrontDeskRole } from "@/lib/permissions"
import SignOutButton from "@/components/admin/SignOutButton"

export const dynamic = "force-dynamic"
export const metadata: Metadata = { title: "Accès accueil", robots: { index: false, follow: false } }

/**
 * The landing page of a front-desk account (#1142), and the only admin page it opens: the proxy,
 * the admin layout and every page's loader send it here (src/lib/front-desk-pages.ts). It says
 * the access exists and lets the person sign out; the check-in screen comes with a later change.
 * Nothing of the organisation is read or shown, and the admin layout renders no navigation for
 * this role, so this <main> is the page's only landmark.
 */
export default async function FrontDeskPage() {
  const session = await auth()
  if (!session?.user) redirect("/admin/login")
  // Anyone else has the admin itself (or the second-factor step it leads to).
  if (!isFrontDeskRole(session.user.role)) redirect(ADMIN_HOME)

  return (
    <main className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-gray-900">Accès accueil</h1>
        </div>
        <div className="bg-white rounded-2xl border border-gray-200 p-6 space-y-4">
          <p className="text-sm text-gray-700">Votre accès accueil est prêt. L&apos;écran de pointage arrive avec une prochaine version.</p>
          <SignOutButton />
        </div>
      </div>
    </main>
  )
}
