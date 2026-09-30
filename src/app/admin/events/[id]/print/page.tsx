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
  const event = await ctx.db.event.findFirst({
    where: { id },
    select: {
      id: true, title: true,
      shifts: {
        where: { status: { not: "cancelled" } },
        orderBy: { displayOrder: "asc" },
        select: { roleName: true, registrations: { where: { status: "active" }, select: { volunteer: { select: { firstName: true, lastName: true } } } } },
      },
    },
  })
  if (!event) notFound()
  const roles = [...new Set(event.shifts.map((s) => s.roleName))]
  // For the badge reprint field: the names as they are registered, so a typo doesn't end in an empty page.
  const names = [...new Set(event.shifts.flatMap((s) => s.registrations.map((r) => `${r.volunteer.firstName} ${r.volunteer.lastName}`.trim())))].sort((a, b) => a.localeCompare(b, "fr"))
  const base = `/api/admin/events/${event.id}/export`
  const forVolunteers = SHEET_VIEWS.filter((v) => v.audience === "volunteers")
  const forOrganizers = SHEET_VIEWS.filter((v) => v.audience === "organizers")

  // A report opens in a new tab and is printed from there; a download saves a file (#384).
  const row = (href: string, name: string, description: string, describedBy?: string, kind: "tab" | "download" = "tab") => {
    const descId = `desc-${href.split("/").pop()}`
    const describes = [descId, describedBy].filter(Boolean).join(" ")
    return (
      <li key={href} className="px-4 py-3">
        {kind === "download" ? (
          <a href={href} download aria-describedby={describes} className={linkClass}>
            {name}
            <span className="sr-only"> (télécharge un fichier)</span>
          </a>
        ) : (
          <a href={href} target="_blank" rel="noopener" aria-describedby={describes} className={linkClass}>
            {name}
            <span className="sr-only"> (ouvre dans un nouvel onglet)</span>
            <span aria-hidden="true" className="ml-1 font-normal text-gray-500">↗</span>
          </a>
        )}
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
          Des documents lisibles en noir et blanc, à imprimer ou enregistrer en PDF depuis le navigateur. Les rapports s&apos;ouvrent dans un nouvel onglet ; l&apos;archive se télécharge.
        </p>
      </div>

      <section aria-labelledby="reports-full" className="space-y-2">
        <h2 id="reports-full" className="text-base font-semibold text-gray-900">Le document complet</h2>
        <ul role="list" className="bg-white border border-gray-200 rounded-xl divide-y divide-gray-100">
          {row(`${base}/pdf`, "Export complet", "Le planning en frise par jour, le récapitulatif par poste et la liste des bénévoles, en couleur.")}
          {row(`${base}/archive`, "Archive de l'événement (JSON)", "Toutes les données de l'événement dans un fichier téléchargé : réglages, créneaux, inscriptions, pages, responsables, jalons et journal. Pour vos archives ou pour changer d'outil.", undefined, "download")}
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
      <section aria-labelledby="reports-badges" className="space-y-2">
        <h2 id="reports-badges" className="text-base font-semibold text-gray-900">Badges</h2>
        <p id="reports-badges-desc" className="text-sm text-gray-600">Un badge par bénévole inscrit (prénom, nom, poste, créneaux), dix par feuille A4 à découper. Sans photo ni code QR. La couleur du bandeau est celle du poste, à défaut celle de l&apos;événement.</p>
        {/* A GET form: the options travel in the link, the page opens in a new tab and is printed from there. */}
        <form action={`${base}/badges`} method="get" target="_blank" aria-labelledby="reports-badges" className="bg-white border border-gray-200 rounded-xl px-4 py-3 space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="badges-role" className="block text-sm font-medium text-gray-800 mb-1">Poste</label>
              <select id="badges-role" name="role" className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm">
                <option value="">Tous les postes</option>
                {roles.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="badges-color" className="block text-sm font-medium text-gray-800 mb-1">Couleur du bandeau</label>
              <select id="badges-color" name="color" className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm">
                <option value="role">Couleur du poste (à défaut celle de l&apos;événement)</option>
                <option value="event">Couleur de l&apos;événement</option>
                <option value="none">Noir et blanc</option>
              </select>
            </div>
          </div>
          <div>
            <label htmlFor="badges-name" className="block text-sm font-medium text-gray-800 mb-1">Un seul bénévole (réimpression)</label>
            <input id="badges-name" name="name" type="text" list="badges-names" autoComplete="off" placeholder="Prénom Nom, tel qu'inscrit" aria-describedby="badges-name-help" className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm placeholder:text-gray-500" />
            <datalist id="badges-names">{names.map((n) => <option key={n} value={n} />)}</datalist>
            <p id="badges-name-help" className="text-xs text-gray-600 mt-1">Vide : tous les bénévoles du poste choisi.</p>
          </div>
          <fieldset className="flex flex-wrap gap-x-6 gap-y-2">
            <legend className="sr-only">Contenu du badge</legend>
            <label className="inline-flex items-center gap-2 text-sm text-gray-800"><input type="checkbox" name="lastName" value="1" defaultChecked className="h-4 w-4 rounded border-gray-300" /> Nom de famille</label>
            <label className="inline-flex items-center gap-2 text-sm text-gray-800"><input type="checkbox" name="shifts" value="1" defaultChecked className="h-4 w-4 rounded border-gray-300" /> Créneaux</label>
          </fieldset>
          <button type="submit" className={linkClass}>
            Ouvrir les badges
            <span className="sr-only"> (ouvre dans un nouvel onglet)</span>
            <span aria-hidden="true" className="ml-1 font-normal text-gray-500">↗</span>
          </button>
        </form>
      </section>
      <p className="text-sm text-gray-600">Les heures cumulées des membres ne figurent dans aucun de ces documents.</p>
    </div>
  )
}
