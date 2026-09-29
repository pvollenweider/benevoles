// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import type { Metadata } from "next"
import Link from "next/link"
import { notFound, redirect } from "next/navigation"
import { getOrgContext } from "@/lib/auth-guard"
import { SHEET_VIEWS } from "@/lib/print-sheets"

export const dynamic = "force-dynamic"
export const metadata: Metadata = { title: "Imprimer" }

const linkClass =
  "font-medium text-blue-700 underline underline-offset-2 hover:text-blue-900 rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"

/** Printable sheets of an event (#400): five views, each opened in a new tab and printed from there. */
export default async function PrintPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await getOrgContext()
  if (!ctx) redirect("/admin/login")
  const { id } = await params
  const event = await ctx.db.event.findFirst({ where: { id }, select: { id: true, title: true } })
  if (!event) notFound()
  const base = `/api/admin/events/${event.id}/export`

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <Link href={`/admin/events/${event.id}`} className={`text-sm ${linkClass}`}><span aria-hidden="true">← </span>Retour à {event.title}</Link>
        <h1 id="page-heading" tabIndex={-1} className="text-2xl font-bold text-gray-900 mt-1 focus:outline-none">Imprimer</h1>
        <p className="text-sm text-gray-700 mt-1">
          Des feuilles lisibles en noir et blanc, à imprimer ou enregistrer en PDF depuis le navigateur. Chacune s&apos;ouvre dans un nouvel onglet.
        </p>
      </div>

      <ul role="list" className="bg-white border border-gray-200 rounded-xl divide-y divide-gray-100">
        {SHEET_VIEWS.map((v) => (
          <li key={v.id} className="px-4 py-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <div className="min-w-0">
              <a href={`${base}/sheets/${v.id}`} target="_blank" rel="noopener" aria-describedby={v.audience === "organizers" ? `audience-${v.id}` : undefined} className={linkClass}>
                {v.name}
                <span className="sr-only"> (ouvre dans un nouvel onglet)</span>
              </a>
              <p className="text-sm text-gray-600">{v.description}</p>
            </div>
            {v.audience === "organizers" && <span id={`audience-${v.id}`} className="text-xs text-gray-700 border border-gray-300 rounded-full px-2 py-0.5">organisateurs seulement</span>}
          </li>
        ))}
        <li className="px-4 py-3">
          <a href={`${base}/pdf`} target="_blank" rel="noopener" className={linkClass}>
            Export complet (planning, récap par poste, liste)
            <span className="sr-only"> (ouvre dans un nouvel onglet)</span>
          </a>
          <p className="text-sm text-gray-600">Le document existant, avec le planning en frise par jour.</p>
        </li>
      </ul>
      <p className="text-sm text-gray-600">
        Les feuilles avec téléphones sont destinées aux organisateurs ; les autres peuvent être affichées ou remises aux bénévoles. Les heures cumulées des membres n&apos;y figurent jamais.
      </p>
    </div>
  )
}
