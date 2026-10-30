// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import type { Metadata } from "next"
import Link from "next/link"
import { notFound, redirect } from "next/navigation"
import { getOrgContext } from "@/lib/auth-guard"
import HelpLink from "@/components/admin/HelpLink"
import DraftBoard from "@/components/admin/DraftBoard"
import { loadDraftBoard } from "@/lib/draft-board-data"

export const dynamic = "force-dynamic"
export const metadata: Metadata = { title: "Affectations en brouillon" }

const linkClass = "font-medium text-blue-700 underline underline-offset-2 hover:text-blue-900 rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)

/**
 * « Affectations en brouillon » (#1146, lot C, beta): the person × day planning of an event that
 * uses dated availability. Drafts hold no place and send nothing until « Publier les affectations »
 * publishes them all at once. `?scope=all` every active member, `?day=` the day of the day view,
 * `?view=day` the day view on a wide screen too.
 */
export default async function DraftAssignmentsPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ scope?: string | string[]; day?: string | string[]; view?: string | string[] }> }) {
  const ctx = await getOrgContext()
  if (!ctx) redirect("/admin/login")
  const { id } = await params
  const q = await searchParams
  const scope = first(q.scope) === "all" ? "all" : "event"
  const data = await loadDraftBoard(ctx.db, id, scope)
  if (!data) notFound()
  const wanted = first(q.day)
  const day = wanted && data.dates.includes(wanted) ? wanted : data.dates[0] ?? null
  const view = first(q.view) === "day" ? "day" : "grid"
  const base = `/admin/events/${id}/availability/drafts`

  return (
    <div data-admin-wide="" className="space-y-6">
      <div>
        <h1 id="page-heading" tabIndex={-1} className="text-xl font-bold text-gray-900 focus:outline-none">Affectations en brouillon</h1>
        <HelpLink route="/admin/events/[id]/availability/drafts" />
        <p className="max-w-[75ch] text-sm text-gray-700 mt-1">
          Préparez les affectations personne par personne et jour par jour. Un brouillon ne prend aucune place et n&apos;envoie rien : rien n&apos;est visible des bénévoles avant que vous publiiez. La publication se fait tout d&apos;un coup, ou pas du tout si un point bloque.
        </p>
        <p className="text-sm text-gray-700 mt-1">
          Pour un créneau précis : <Link href={`/admin/events/${id}/availability/assign`} className={linkClass}>Affecter selon les disponibilités</Link>
        </p>
        {!data.collecting && <p className="mt-2 text-sm text-gray-800 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2">La collecte est arrêtée : les réponses déjà données restent utilisées ici.</p>}
        {data.protection === "incomplete" && <p className="mt-2 text-sm text-red-800">La protection des pauses et de la charge est incomplète : aucune affectation ne peut être publiée.</p>}
      </div>
      <DraftBoard key={`${scope}-${view}`} eventId={id} board={data} day={day} view={view} scope={scope} basePath={base} />
    </div>
  )
}
