// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import type { Metadata } from "next"
import Link from "next/link"
import { notFound, redirect } from "next/navigation"
import { getOrgContext } from "@/lib/auth-guard"
import HelpLink from "@/components/admin/HelpLink"
import ShiftAssistPanel from "@/components/admin/ShiftAssistPanel"
import { loadShiftAssist, type AssistShiftOption } from "@/lib/availability-assist-data"
import { dayLabel } from "@/lib/spoken-time"

export const dynamic = "force-dynamic"
export const metadata: Metadata = { title: "Affecter selon les disponibilités" }

const linkClass = "font-medium text-blue-700 underline underline-offset-2 hover:text-blue-900 rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"

const hours = (s: { startTime: string; endTime: string }) => `de ${s.startTime} à ${s.endTime}${s.endTime <= s.startTime ? " le lendemain" : ""}`
const places = (s: AssistShiftOption) => `${s.occupied} ${s.occupied > 1 ? "places prises" : "place prise"} sur ${s.capacity}`
/** The option's short form (independent review, P3: the places were cut at 390 px): « Bar, 18:00 à 23:00, 2 sur 4 places ». */
const optionText = (s: AssistShiftOption) => `${s.name}, ${s.startTime} à ${s.endTime}${s.endTime <= s.startTime ? " le lendemain" : ""}, ${s.occupied} sur ${s.capacity} place${s.capacity > 1 ? "s" : ""}`

/**
 * « Affecter selon les disponibilités » (#1146, lot B, beta): for one shift, who is free, who
 * already has hours, breaks and the workload verdict; the organiser adds people one by one. Only
 * for an event that uses dated availability. `?shift=` the shift, `?scope=all` every active member.
 */
export default async function AssignByAvailabilityPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ shift?: string | string[]; scope?: string | string[] }> }) {
  const ctx = await getOrgContext()
  if (!ctx) redirect("/admin/login")
  const { id } = await params
  const q = await searchParams
  const shiftParam = Array.isArray(q.shift) ? q.shift[0] : q.shift
  const scope = (Array.isArray(q.scope) ? q.scope[0] : q.scope) === "all" ? "all" : "event"
  const data = await loadShiftAssist(ctx.db, id, shiftParam ?? null, scope)
  if (!data) notFound()

  const byDay = new Map<string, AssistShiftOption[]>()
  for (const s of data.shifts) byDay.set(s.date, [...(byDay.get(s.date) ?? []), s])
  const base = `/admin/events/${id}/availability/assign`
  const shiftQuery = data.shift ? `shift=${encodeURIComponent(data.shift.id)}` : ""
  const otherScope = scope === "all" ? base + (shiftQuery ? `?${shiftQuery}` : "") : `${base}?${shiftQuery ? `${shiftQuery}&` : ""}scope=all`

  return (
    <div className="space-y-5 max-w-3xl">
      <div>
        <h1 id="page-heading" tabIndex={-1} className="text-xl font-bold text-gray-900 focus:outline-none">Affecter selon les disponibilités</h1>
        <HelpLink route="/admin/events/[id]/availability/assign" />
        <p className="text-sm text-gray-700 mt-1">
          Choisissez un créneau : chaque personne apparaît avec ses disponibilités indiquées, les heures déjà prévues et les limites de charge. Vous décidez qui ajouter ; personne n&apos;est ajouté sans votre clic.
        </p>
        <p className="text-sm text-gray-700 mt-1">
          Pour préparer tout le planning avant de le publier d&apos;un coup :{" "}
          <Link href={`/admin/events/${id}/availability/drafts`} className={linkClass}>Affectations en brouillon</Link>
        </p>
        {!data.collecting && <p className="mt-2 text-sm text-gray-800 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2">La collecte est arrêtée : les réponses déjà données restent utilisées ici.</p>}
      </div>

      {data.shifts.length === 0 ? (
        <p className="text-sm text-gray-700">Aucun créneau pour l&apos;instant. <Link href={`/admin/events/${id}/shifts`} className={linkClass}>Créer des créneaux</Link></p>
      ) : (
        <form method="get" action={base} className="flex flex-wrap items-end gap-3">
          <div className="min-w-0 flex-1 basis-64">
            <label htmlFor="assist-shift" className="block text-sm font-medium text-gray-700 mb-1">Créneau</label>
            <select id="assist-shift" name="shift" defaultValue={data.shift?.id ?? ""} required className="input w-full">
              <option value="" disabled>Choisir un créneau…</option>
              {[...byDay.entries()].map(([date, list]) => (
                <optgroup key={date} label={dayLabel(date)}>
                  {list.map((s) => <option key={s.id} value={s.id}>{optionText(s)}</option>)}
                </optgroup>
              ))}
            </select>
          </div>
          {scope === "all" && <input type="hidden" name="scope" value="all" />}
          <button type="submit" className="min-h-11 rounded-xl border border-blue-600 px-4 py-2 text-sm font-medium text-blue-700 hover:bg-blue-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600">Afficher</button>
        </form>
      )}

      {data.shift && (
        <>
          <section aria-labelledby="assist-shift-heading" className="bg-white border border-gray-200 rounded-xl p-4 space-y-1">
            <h2 id="assist-shift-heading" className="text-sm font-semibold text-gray-900">{data.shift.name}</h2>
            <p className="text-sm text-gray-700">{dayLabel(data.shift.date)}, {hours(data.shift)}. {places(data.shift)}.</p>
            {data.protection === "on" && <p className="text-sm text-gray-700">Cet événement protège les pauses et la charge : une personne que ses limites empêchent d&apos;ajouter n&apos;a pas de bouton.</p>}
            {data.protection === "incomplete" && <p className="text-sm text-red-800">La protection des pauses et de la charge est incomplète : plus aucune inscription n&apos;est acceptée.</p>}
          </section>
          <p className="text-sm text-gray-700">
            <span id="assist-scope">{scope === "all" ? "Tous les membres actifs de l'organisation" : "Les personnes sollicitées pour leurs disponibilités ou déjà prévues sur l'événement"}
            {data.alreadyOnShift > 0 ? ` ; ${data.alreadyOnShift} déjà sur ce créneau, non listée${data.alreadyOnShift > 1 ? "s" : ""}` : ""}.</span>{" "}
            <Link href={otherScope} aria-describedby="assist-scope" className={linkClass}>
              {scope === "all" ? "Voir seulement les personnes sollicitées ou déjà prévues" : "Voir tous les membres actifs"}
            </Link>
          </p>
          <ShiftAssistPanel key={`${data.shift.id}-${scope}`} eventId={id} shift={{ id: data.shift.id, name: data.shift.name }} rows={data.rows} />
        </>
      )}
      <p className="text-sm"><Link href={`/admin/events/${id}/availability`} className={linkClass}>Retour aux disponibilités</Link></p>
    </div>
  )
}
