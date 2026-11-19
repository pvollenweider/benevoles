// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import type { Metadata } from "next"
import Link from "next/link"
import { loadOrgPage } from "@/lib/org-personal-page-load"
import { TOO_MANY_ATTEMPTS_TITLE } from "@/lib/too-many-attempts"
import TooManyAttemptsNotice from "@/components/public/TooManyAttemptsNotice"
import OrgUnavailableNotice from "@/components/public/OrgUnavailableNotice"
import LinkRequestForm from "@/components/LinkRequestForm"
import OrgPersonalPage from "@/components/public/OrgPersonalPage"

/** A token-bearing page: always rendered per request, never cached. */
export const dynamic = "force-dynamic"

export async function generateMetadata({ params }: { params: Promise<{ token: string }> }): Promise<Metadata> {
  const { token } = await params
  const loaded = await loadOrgPage(token)
  return {
    title: loaded.state === "ok" ? `Toutes mes inscriptions – ${loaded.data.organization.name}` : loaded.state === "unavailable" ? "Espace indisponible" : loaded.state === "blocked" ? TOO_MANY_ATTEMPTS_TITLE : "Ce lien ne fonctionne pas",
    // A personal link is never indexed and never leaks its address through a referrer.
    robots: { index: false, follow: false },
    referrer: "no-referrer",
  }
}

export default async function OrgPersonalPageRoute({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const loaded = await loadOrgPage(token)

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
  if (loaded.state === "invalid") {
    return (
      <main className="min-h-screen bg-gray-50 flex items-center justify-center px-4 py-8">
        <div className="max-w-md w-full bg-white rounded-2xl border border-gray-200 p-8 text-center">
          <h1 className="text-lg font-semibold text-gray-900 mb-2">Ce lien ne fonctionne pas</h1>
          <p className="text-sm text-gray-700 mb-4">Ce lien est invalide ou a été remplacé par un nouveau.</p>
          <LinkRequestForm variant="lost" />
          <Link href="/" className="inline-block mt-6 text-blue-700 text-sm underline underline-offset-2 rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600">
            Retour à l&apos;accueil
          </Link>
        </div>
      </main>
    )
  }
  return <OrgPersonalPage token={token} data={loaded.data} />
}
