// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import type { Metadata } from "next"
import Link from "next/link"
import { notFound, redirect } from "next/navigation"
import { getOrgContext } from "@/lib/auth-guard"
import { fmtRange } from "@/lib/gantt-utils"
import { staffingHeadline, staffingSummary, type StaffingShiftLine } from "@/lib/staffing"

export const dynamic = "force-dynamic"
export const metadata: Metadata = { title: "Où manque-t-il du monde ?" }

const linkClass =
  "font-medium text-blue-700 underline underline-offset-2 hover:text-blue-900 rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"

// Shift.date is a UTC midnight.
const day = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("fr-FR", { timeZone: "UTC", weekday: "short", day: "numeric", month: "short" })

function Group({ id, title, count, hint, children }: { id: string; title: string; count: number; hint?: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby={id} className="space-y-2">
      <h2 id={id} className="text-base font-semibold text-gray-900">
        {title} <span className="text-sm font-normal text-gray-600">({count})</span>
      </h2>
      {hint && <p className="text-sm text-gray-600">{hint}</p>}
      {/* role="list": Safari/VoiceOver drops list semantics once Tailwind removes the bullets. */}
      <ul role="list" className="bg-white border border-gray-200 rounded-xl divide-y divide-gray-100">{children}</ul>
    </section>
  )
}

function ShiftLine({ eventId, group, s, detail }: { eventId: string; group: string; s: StaffingShiftLine; detail: React.ReactNode }) {
  const name = s.label !== s.roleName ? `${s.roleName} · ${s.label}` : s.roleName
  const detailId = `${group}-${s.id}-detail`
  return (
    <li className="px-4 py-3 text-sm flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
      {/* Date and time inside the link: its name is what's visible, nothing duplicated for AT. */}
      <Link href={`/admin/events/${eventId}/registrations?shift=${encodeURIComponent(s.id)}`} aria-describedby={detailId} className={`${linkClass} min-w-0`}>
        {name}
        <span className="font-normal text-gray-600 ml-2">{day(s.date)} · {fmtRange(s.startTime, s.endTime)}</span>
      </Link>
      <p id={detailId} className="text-gray-800 tabular-nums">{detail}</p>
    </li>
  )
}

/** « Où manque-t-il encore du monde ? » (#394): the event's shifts grouped by what to do next. */
export default async function StaffingPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await getOrgContext()
  if (!ctx) redirect("/admin/login")
  const { id } = await params

  const event = await ctx.db.event.findFirst({
    where: { id },
    select: {
      id: true, title: true,
      shifts: {
        where: { status: { not: "cancelled" } },
        select: {
          id: true, roleName: true, label: true, date: true, startTime: true, endTime: true, capacity: true, status: true,
          registrations: { where: { status: { in: ["active", "waiting", "offered"] } }, select: { status: true } },
        },
      },
      sectorLeaders: { select: { roleName: true } },
    },
  })
  if (!event) notFound()

  const summary = staffingSummary(
    event.shifts.map((s) => ({
      id: s.id, roleName: s.roleName, label: s.label, date: s.date.toISOString().slice(0, 10),
      startTime: s.startTime, endTime: s.endTime, capacity: s.capacity, closed: s.status === "closed",
      active: s.registrations.filter((r) => r.status === "active").length,
      waiting: s.registrations.filter((r) => r.status !== "active").length,
    })),
    event.sectorLeaders.map((l) => l.roleName),
  )
  const base = `/admin/events/${event.id}`
  const plural = (n: number, w: string) => `${n} ${n > 1 ? (w.endsWith("eau") ? `${w}x` : `${w}s`) : w}`

  return (
    <div className="space-y-6">
      <div>
        <Link href={base} className={`text-sm ${linkClass}`}><span aria-hidden="true">← </span>Retour à {event.title}</Link>
        <h1 id="page-heading" tabIndex={-1} className="text-2xl font-bold text-gray-900 mt-1 focus:outline-none">Où manque-t-il du monde ?</h1>
        <p className="text-sm text-gray-700 mt-1">
          {staffingHeadline(summary.totals)}
          {summary.totals.waiting > 0 && ` ${plural(summary.totals.waiting, "personne")} en liste d'attente.`}
        </p>
      </div>

      {summary.totals.shifts === 0 ? (
        <p className="text-sm text-gray-600">
          <Link href={`${base}/shifts`} className={linkClass}>Ajoutez des créneaux</Link> pour voir où il manque du monde.
        </p>
      ) : (
        <>
          {summary.emptyRoles.length > 0 && (
            <Group id="staffing-empty" title="Postes sans personne" count={summary.emptyRoles.length} hint="Personne n'est inscrit sur aucun créneau de ces postes.">
              {summary.emptyRoles.map((r) => (
                <li key={r.roleName} className="px-4 py-3 text-sm flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                  <Link href={`${base}/shifts`} className={linkClass}>
                    {r.roleName}
                    <span className="sr-only"> : voir ses créneaux</span>
                  </Link>
                  <p className="text-gray-800 tabular-nums">{plural(r.shiftCount, "créneau")} · {plural(r.capacity, "place")} à pourvoir</p>
                </li>
              ))}
            </Group>
          )}

          {summary.underfilled.length > 0 && (
            <Group id="staffing-underfilled" title="Créneaux à compléter" count={summary.underfilled.length} hint="Du plus dégarni au plus proche du complet. Les créneaux fermés aux inscriptions ne sont pas comptés.">
              {summary.underfilled.map((s) => (
                <ShiftLine key={s.id} eventId={event.id} group="underfilled" s={s} detail={<><strong>{plural(s.missing, "personne")} manque{s.missing > 1 ? "nt" : ""}</strong> ({s.active}/{s.capacity})</>} />
              ))}
            </Group>
          )}

          {summary.waitlisted.length > 0 && (
            <Group id="staffing-waitlist" title="Personnes en liste d'attente" count={summary.waitlisted.length} hint="Créneaux complets où des bénévoles attendent une place : une place de plus, ou un autre créneau à leur proposer.">
              {summary.waitlisted.map((s) => (
                <ShiftLine key={s.id} eventId={event.id} group="waitlist" s={s} detail={<>{plural(s.waiting, "personne")} en attente ({s.active}/{s.capacity})</>} />
              ))}
            </Group>
          )}

          {summary.rolesWithoutLeader.length > 0 && (
            <Group
              id="staffing-leaders"
              title="Postes sans responsable de secteur"
              count={summary.rolesWithoutLeader.length}
              hint={summary.usesLeaders ? undefined : "Facultatif : un responsable reçoit les inscriptions de son poste et voit sa liste d'équipe."}
            >
              {summary.rolesWithoutLeader.map((r) => (
                <li key={r} className="px-4 py-3 text-sm">
                  <Link href={`${base}/sector-leaders`} className={linkClass}>
                    {r}
                    <span className="sr-only"> : désigner un responsable</span>
                  </Link>
                </li>
              ))}
            </Group>
          )}

          {summary.full.length > 0 && (
            <Group id="staffing-full" title="Créneaux complets" count={summary.full.length} hint={summary.waitlisted.length > 0 ? "Sans compter ceux qui ont une liste d'attente, ci-dessus." : undefined}>
              {summary.full.map((s) => (
                <ShiftLine key={s.id} eventId={event.id} group="full" s={s} detail={<>{s.active}/{s.capacity}</>} />
              ))}
            </Group>
          )}
        </>
      )}
    </div>
  )
}
