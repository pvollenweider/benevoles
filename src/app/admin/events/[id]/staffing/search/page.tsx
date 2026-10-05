// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import type { Metadata } from "next"
import Link from "next/link"
import { notFound, redirect } from "next/navigation"
import { getOrgContext } from "@/lib/auth-guard"
import { loadOpenShiftsContext } from "@/lib/open-shifts-data"
import { acceptsRegistrations } from "@/lib/registration-window"
import OpenShiftsFinder from "@/components/admin/OpenShiftsFinder"

export const dynamic = "force-dynamic"
export const metadata: Metadata = { title: "Chercher des bénévoles" }

const linkClass =
  "font-medium text-blue-700 underline underline-offset-2 hover:text-blue-900 rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"

/**
 * « Chercher des bénévoles » (#566): from the underfilled shifts of « Où manque-t-il du monde ? »,
 * the members to write to, picked by hand, and one email each listing the open shifts.
 */
export default async function OpenShiftsSearchPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ shift?: string | string[] }> }) {
  const ctx = await getOrgContext()
  if (!ctx) redirect("/admin/login")
  const { id } = await params
  const q = await searchParams

  const data = await loadOpenShiftsContext(ctx.db, id)
  if (!data) notFound()
  const { event } = data
  const asked = new Set(Array.isArray(q.shift) ? q.shift : q.shift ? [q.shift] : [])
  const initialShiftIds = data.openShifts.filter((s) => asked.has(s.id)).map((s) => s.id)
  const base = `/admin/events/${event.id}`

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <Link href={`${base}/staffing`} className={`text-sm ${linkClass}`}><span aria-hidden="true">← </span>Où manque-t-il du monde ?</Link>
        <h1 id="page-heading" tabIndex={-1} className="text-2xl font-bold text-gray-900 mt-1 focus:outline-none">Chercher des bénévoles</h1>
        <p className="text-sm text-gray-700 mt-1">
          Choisissez les créneaux à compléter, puis cochez les membres à qui les proposer. Personne n&apos;est coché d&apos;avance et rien ne part sans votre confirmation. Chaque personne reçoit un seul email avec les créneaux qui la concernent et son lien pour s&apos;inscrire.
        </p>
      </div>

      {data.openShifts.length === 0 ? (
        <p className="text-sm text-gray-700">Aucun créneau à compléter pour l&apos;instant : tous les créneaux ouverts sont complets.</p>
      ) : (
        <>
          {!acceptsRegistrations(event) && (
            <p role="note" className="text-sm text-amber-900 bg-amber-50 border border-amber-300 rounded-lg px-3 py-2 forced-colors:border-[CanvasText]">
              Les inscriptions ne sont pas ouvertes pour cet événement : vous pouvez préparer votre choix, mais l&apos;envoi sera refusé tant qu&apos;elles ne le sont pas.{" "}
              <Link href={`${base}/edit`} className={linkClass}>Modifier l&apos;événement</Link>
            </p>
          )}
          <OpenShiftsFinder
            eventId={event.id}
            shifts={data.openShifts}
            eventShifts={data.eventShifts}
            members={data.members}
            registrations={data.registrations}
            invites={data.invites}
            tags={data.tags}
            initialShiftIds={initialShiftIds}
          />
        </>
      )}
    </div>
  )
}
