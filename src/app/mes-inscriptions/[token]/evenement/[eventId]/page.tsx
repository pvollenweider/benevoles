// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import type { Metadata } from "next"
import { notFound, redirect } from "next/navigation"
import { loadOrgEventTarget } from "@/lib/org-personal-page-load"
import TooManyAttemptsNotice from "@/components/public/TooManyAttemptsNotice"
import OrgUnavailableNotice from "@/components/public/OrgUnavailableNotice"

/** A token-bearing page: always rendered per request, never cached. */
export const dynamic = "force-dynamic"

export const metadata: Metadata = {
  title: "Mes inscriptions",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
}

/**
 * « Voir l'événement » (#1429, lot A): a server-authorised hop to the event's own personal page,
 * for the same volunteer and organisation. The organisation token is checked first; an event id
 * that is not one of that volunteer's live registrations answers 404.
 */
export default async function OrgEventPage({ params }: { params: Promise<{ token: string; eventId: string }> }) {
  const { token, eventId } = await params
  const loaded = await loadOrgEventTarget(token, eventId)

  if (loaded.state === "blocked") {
    return (
      <main className="min-h-screen bg-gray-50 flex items-center justify-center px-4 py-8">
        <div className="max-w-md w-full bg-white rounded-2xl border border-gray-200 p-6 sm:p-8">
          <TooManyAttemptsNotice />
        </div>
      </main>
    )
  }
  if (loaded.state === "unavailable") return <OrgUnavailableNotice audience="volunteer" contact={loaded.contact} />
  if (loaded.state === "redirect") redirect(`/my/${encodeURIComponent(loaded.editToken)}`)
  notFound()
}
