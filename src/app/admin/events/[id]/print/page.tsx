// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import type { Metadata } from "next"
import Link from "next/link"
import { notFound, redirect } from "next/navigation"
import { getOrgContext } from "@/lib/auth-guard"
import { SHEET_VIEWS } from "@/lib/print-sheets"

export const dynamic = "force-dynamic"
export const metadata: Metadata = { title: "Rapports" }

const linkClass =
  "font-medium text-blue-700 underline underline-offset-2 hover:text-blue-900 rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"

/** Reports of an event (#400): the full export first, then five sheets, each opened in a new tab and printed from there. */
export default async function ReportsPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await getOrgContext()
  if (!ctx) redirect("/admin/login")
  const { id } = await params
  const event = await ctx.db.event.findFirst({ where: { id }, select: { id: true, title: true } })
  if (!event) notFound()
  const base = `/api/admin/events/${event.id}/export`
  const forVolunteers = SHEET_VIEWS.filter((v) => v.audience === "volunteers")
  const forOrganizers = SHEET_VIEWS.filter((v) => v.audience === "organizers")

  const row = (href: string, name: string, description: string, describedBy?: string) => {
    const descId = `desc-${href.split("/").pop()}`
    return (
      <li key={href} className="px-4 py-3">
        <a href={href} target="_blank" rel="noopener" aria-describedby={[descId, describedBy].filter(Boolean).join(" ")} className={linkClass}>
          {name}
          <span className="sr-only"> (ouvre dans un nouvel onglet)</span>
          <span aria-hidden="true" className="ml-1 font-normal text-gray-500">↗</span>
        </a>
        <p id={descId} className="text-sm text-gray-600">{description}</p>
      </li>
    )
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <Link href={`/admin/events/${event.id}`} className={`text-sm ${linkClass}`}><span aria-hidden="true">← </span>Retour à {event.title}</Link>
        <h1 id="page-heading" tabIndex={-1} className="text-2xl font-bold text-gray-900 mt-1 focus:outline-none">Rapports</h1>
        <p className="text-sm text-gray-700 mt-1">
          Des documents lisibles en noir et blanc, à imprimer ou enregistrer en PDF depuis le navigateur. Chacun s&apos;ouvre dans un nouvel onglet.
        </p>
      </div>

      <section aria-labelledby="reports-full" className="space-y-2">
        <h2 id="reports-full" className="text-base font-semibold text-gray-900">Le document complet</h2>
        <ul role="list" className="bg-white border border-gray-200 rounded-xl divide-y divide-gray-100">
          {row(`${base}/pdf`, "Export complet", "Le planning en frise par jour, le récapitulatif par poste et la liste des bénévoles, en couleur.")}
        </ul>
      </section>

      <section aria-labelledby="reports-volunteers" className="space-y-2">
        <h2 id="reports-volunteers" className="text-base font-semibold text-gray-900">À afficher ou à remettre aux bénévoles</h2>
        <ul role="list" className="bg-white border border-gray-200 rounded-xl divide-y divide-gray-100">
          {forVolunteers.map((v) => row(`${base}/sheets/${v.id}`, v.name, v.description))}
        </ul>
      </section>

      <section aria-labelledby="reports-organizers" className="space-y-2">
        <h2 id="reports-organizers" className="text-base font-semibold text-gray-900">Pour les organisateurs seulement</h2>
        <p id="reports-organizers-note" className="text-sm text-gray-600">Contiennent des numéros de téléphone : à ne pas afficher ni distribuer.</p>
        <ul role="list" className="bg-white border border-gray-200 rounded-xl divide-y divide-gray-100">
          {forOrganizers.map((v) => row(`${base}/sheets/${v.id}`, v.name, v.description, "reports-organizers-note"))}
        </ul>
      </section>
      <p className="text-sm text-gray-600">Les heures cumulées des membres ne figurent dans aucun de ces documents.</p>
    </div>
  )
}
