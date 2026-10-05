// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import type { Metadata } from "next"
import Link from "next/link"
import { notFound, redirect } from "next/navigation"
import { getOrgContext } from "@/lib/auth-guard"
import { fmtRange } from "@/lib/gantt-utils"
import { fillPercent, staffingHeadline, staffingSummary, type StaffingShiftLine } from "@/lib/staffing"
import { LIVE_STATUSES } from "@/lib/registration-capacity"
import { shiftDay, shiftHours, shiftName } from "@/lib/open-shifts"

export const dynamic = "force-dynamic"
export const metadata: Metadata = { title: "Où manque-t-il du monde ?" }

const linkClass =
  "font-medium text-blue-700 underline underline-offset-2 hover:text-blue-900 rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"

// Shift.date is a UTC midnight.
const day = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("fr-FR", { timeZone: "UTC", weekday: "short", day: "numeric", month: "short" })
const plural = (n: number, w: string) => `${n} ${n > 1 ? (w.endsWith("eau") ? `${w}x` : `${w}s`) : w}`

/** Filled share as a bar. Decorative: the figures next to it carry the meaning. */
function Meter({ active, capacity, className = "" }: { active: number; capacity: number; className?: string }) {
  const pct = fillPercent(active, capacity)
  return (
    <span aria-hidden="true" className={`block h-2 rounded-full bg-gray-200 overflow-hidden ${className}`}>
      <span className={`block h-full rounded-full ${pct >= 100 ? "bg-gray-700" : "bg-blue-600"}`} style={{ width: `${pct}%` }} />
    </span>
  )
}

/** « 2/5 » on screen, « 2 sur 5 » for screen readers. */
function Ratio({ active, capacity }: { active: number; capacity: number }) {
  return <>{active}<span aria-hidden="true">/</span><span className="sr-only"> sur </span>{capacity}</>
}

function Group({ id, title, count, hint, children }: { id: string; title: string; count: number; hint?: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby={id} className="space-y-2">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 id={id} className="text-base font-semibold text-gray-900">
          {title}
          <span className="sr-only"> : </span>
          <span className="ml-2 inline-block align-middle rounded-full bg-gray-100 px-2 py-0.5 text-xs font-semibold text-gray-700 tabular-nums">{count}</span>
        </h2>
        {hint && <p className="text-sm text-gray-600 basis-full">{hint}</p>}
      </div>
      {/* role="list": Safari/VoiceOver drops list semantics once Tailwind removes the bullets. */}
      <ul role="list" className="bg-white border border-gray-200 rounded-xl divide-y divide-gray-100">{children}</ul>
    </section>
  )
}

function ShiftLine({ eventId, group, s, detail, action }: { eventId: string; group: string; s: StaffingShiftLine; detail: React.ReactNode; action?: React.ReactNode }) {
  const name = s.label !== s.roleName ? `${s.roleName} · ${s.label}` : s.roleName
  const detailId = `${group}-${s.id}-detail`
  return (
    <li className="px-4 py-3 text-sm grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_auto] gap-x-6 gap-y-2 items-center">
      <div className="min-w-0">
        {/* Date and time inside the link: its name is what's visible, nothing duplicated for AT. */}
        <Link href={`/admin/events/${eventId}/registrations?shift=${encodeURIComponent(s.id)}`} aria-describedby={detailId} className={linkClass}>
          {name}
          <span className="block sm:inline font-normal text-gray-600 sm:ml-2">{day(s.date)} · {fmtRange(s.startTime, s.endTime)}</span>
        </Link>
        {action}
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 sm:justify-end">
        <Meter active={s.active} capacity={s.capacity} className="w-full sm:w-24 shrink-0" />
        <p id={detailId} className="text-gray-800 tabular-nums">{detail}</p>
      </div>
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
          registrations: { where: { status: { in: [...LIVE_STATUSES] } }, select: { status: true } },
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
      waiting: s.registrations.filter((r) => r.status === "waiting" || r.status === "offered").length,
      requested: s.registrations.filter((r) => r.status === "requested").length,
    })),
    event.sectorLeaders.map((l) => l.roleName),
  )
  const base = `/admin/events/${event.id}`
  const t = summary.totals
  const nothingToDo = summary.emptyRoles.length === 0 && summary.underfilled.length === 0 && summary.waitlisted.length === 0

  return (
    <div className="space-y-8 max-w-3xl">
      <div>
        <Link href={base} className={`text-sm ${linkClass}`}><span aria-hidden="true">← </span>Retour à {event.title}</Link>
        <h1 id="page-heading" tabIndex={-1} className="text-2xl font-bold text-gray-900 mt-1 focus:outline-none">Où manque-t-il du monde ?</h1>
      </div>

      {t.shifts === 0 ? (
        <p className="text-sm text-gray-700">
          <Link href={`${base}/shifts`} className={linkClass}>Ajoutez des créneaux</Link> pour voir où il manque du monde.
        </p>
      ) : (
        <>
          {/* One line and one bar for the whole event: the figures are the content, the bar the glance. */}
          <section aria-labelledby="staffing-overview" className="bg-white border border-gray-200 rounded-xl px-5 py-4">
            <h2 id="staffing-overview" className="sr-only">Vue d&apos;ensemble</h2>
            <p className="text-base text-gray-900">
              <strong className="tabular-nums">{t.active}</strong> place{t.active > 1 ? "s" : ""} pourvue{t.active > 1 ? "s" : ""} sur <span className="tabular-nums">{t.capacity}</span>
              <span className="text-gray-600"> · {plural(t.shifts, "créneau")}</span>
            </p>
            <Meter active={t.active} capacity={t.capacity} className="mt-2" />
            <p className="mt-2 text-sm text-gray-700">
              {staffingHeadline(t)}
              {t.waiting > 0 && ` ${plural(t.waiting, "personne")} en liste d'attente.`}
              {t.requested > 0 && (
                <>
                  {" "}
                  <Link href={`${base}/registrations?demandes=1`} className={linkClass}>{plural(t.requested, "demande")} à traiter</Link>
                  {t.requested > 1 ? " gardent leur place" : " garde sa place"} en attendant votre décision.
                </>
              )}
            </p>
          </section>

          {nothingToDo && (
            <p className="text-sm text-gray-700">Rien à faire pour l&apos;instant : personne ne manque et personne n&apos;attend.</p>
          )}

          {summary.emptyRoles.length > 0 && (
            <Group id="staffing-empty" title="Postes sans personne" count={summary.emptyRoles.length} hint="Personne n'est inscrit sur aucun créneau de ces postes.">
              {summary.emptyRoles.map((r, i) => (
                <li key={r.roleName} className="px-4 py-3 text-sm grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_auto] gap-x-6 gap-y-2 items-center">
                  <Link href={`${base}/shifts`} aria-describedby={`empty-${i}-detail`} className={linkClass}>
                    {r.roleName}
                    <span className="sr-only"> : voir ses créneaux</span>
                  </Link>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 sm:justify-end">
                    <Meter active={0} capacity={r.capacity} className="w-full sm:w-24 shrink-0" />
                    <p id={`empty-${i}-detail`} className="text-gray-800 tabular-nums">{plural(r.shiftCount, "créneau")} · <strong>{plural(r.capacity, "place")}</strong> à pourvoir</p>
                  </div>
                </li>
              ))}
            </Group>
          )}

          {summary.underfilled.length > 0 && (
            <div className="space-y-2">
            <Group id="staffing-underfilled" title="Créneaux à compléter" count={summary.underfilled.length} hint="Du plus dégarni au plus proche du complet. Les créneaux fermés aux inscriptions ne sont pas comptés.">
              {summary.underfilled.map((s) => (
                <ShiftLine
                  key={s.id}
                  eventId={event.id}
                  group="underfilled"
                  s={s}
                  detail={<><strong><Ratio active={s.active} capacity={s.capacity} /></strong>{s.requested ? ` · ${plural(s.requested, "demande")} à traiter` : ""} · manque {s.missing}</>}
                  action={
                    <Link href={`${base}/staffing/search?shift=${encodeURIComponent(s.id)}`} className={`mt-1 inline-block text-sm ${linkClass}`}>
                      Chercher des bénévoles
                      <span className="sr-only"> pour {shiftName(s)}, {shiftDay(s.date)}, {shiftHours(s)}</span>
                    </Link>
                  }
                />
              ))}
            </Group>
            {/* « Chercher des bénévoles » (#566): one shift from its line, several from here. */}
            <p className="text-sm">
              <Link href={`${base}/staffing/search`} className={linkClass}>Chercher des bénévoles pour plusieurs créneaux</Link>
            </p>
            </div>
          )}

          {summary.waitlisted.length > 0 && (
            <Group id="staffing-waitlist" title="Personnes en liste d'attente" count={summary.waitlisted.length} hint="Créneaux complets où des bénévoles attendent une place : une place de plus, ou un autre créneau à leur proposer.">
              {summary.waitlisted.map((s) => (
                <ShiftLine key={s.id} eventId={event.id} group="waitlist" s={s} detail={<><strong><Ratio active={s.active} capacity={s.capacity} /></strong> · {plural(s.waiting, "personne")} en attente</>} />
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
                <ShiftLine key={s.id} eventId={event.id} group="full" s={s} detail={<><Ratio active={s.active} capacity={s.capacity} />{s.requested ? ` · ${plural(s.requested, "demande")} à traiter` : ""}</>} />
              ))}
            </Group>
          )}
        </>
      )}
    </div>
  )
}
