// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import type { Metadata } from "next"
import Link from "next/link"
import { notFound, redirect } from "next/navigation"
import { getOrgContext } from "@/lib/auth-guard"
import { formatShortDate } from "@/lib/utils"
import { isEventDay } from "@/lib/day-of"
import { loadDayOf } from "@/lib/day-of-load"
import DayOfBoard from "@/components/admin/DayOfBoard"
import HelpLink from "@/components/admin/HelpLink"
import { statusBoxClass } from "@/lib/status-message"
import SectorFilter from "@/components/admin/SectorFilter"
import { loadSectorFilter } from "@/lib/sector-filter-data"
import { CURRENT_SHIFT_WORDS, sectorFilterAnnouncement, sectorFilterValue, withSectorFilter } from "@/lib/sector-filter"

export const dynamic = "force-dynamic"

export const metadata: Metadata = { title: "Jour J" }

const navLinkClass =
  "inline-flex items-center min-h-11 px-4 rounded-xl border border-gray-300 bg-white text-sm font-medium text-gray-800 hover:bg-gray-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"

/**
 * « Jour J » (#561): what the coordinator needs on site, on a phone. Shifts running now and in
 * the next hours, who is expected and who has arrived, one tap to mark someone present. Only the
 * name, the shift, the state and the phone: no email, answers or notes.
 */
export default async function DayOfPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ secteur?: string | string[] }> }) {
  const ctx = await getOrgContext()
  if (!ctx) redirect("/admin/login")
  const { id } = await params
  const now = new Date()
  // The « Secteur » filter (#1170): the sector's postes only, on this read and on every poll.
  const sector = await loadSectorFilter(ctx.db, id, (await searchParams).secteur)
  if (!sector) notFound()
  const loaded = await loadDayOf(ctx.db, id, now, sector.shiftWhere)
  if (!loaded) notFound()
  const { event, timeZone, board, today, refreshedAt } = loaded
  const base = `/admin/events/${event.id}`
  const sectorValue = sectorFilterValue(sector.filter)
  const eventDay = isEventDay({ startDate: event.startDate.toISOString(), endDate: event.endDate.toISOString() }, now, timeZone)

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 id="page-heading" tabIndex={-1} className="text-xl font-bold text-gray-900 focus:outline-none">Jour J</h1>
        <HelpLink route="/admin/events/[id]/day-of" />
      </div>

      {!eventDay && (
        <p className={`${statusBoxClass("info")} px-4 py-3`}>
          {formatShortDate(event.startDate) === formatShortDate(event.endDate)
            ? `L'événement a lieu le ${formatShortDate(event.startDate)}.`
            : `L'événement a lieu du ${formatShortDate(event.startDate)} au ${formatShortDate(event.endDate)}.`}
          {" "}Cette page sert pendant l&apos;événement : les créneaux en cours, ceux des prochaines heures et les présences.
        </p>
      )}

      {sector.offered && (
        <SectorFilter
          options={sector.options}
          value={sectorValue}
          announcement={sectorFilterAnnouncement(sector.filter, board.inProgress.concat(board.upcoming).reduce((n, g) => n + g.shifts.length, 0), CURRENT_SHIFT_WORDS)}
        />
      )}

      {/* Keyed by the sector: the board's marks, search and polling restart on the sector's shifts. */}
      <DayOfBoard key={sectorValue} eventId={event.id} board={board} today={today} refreshedAt={refreshedAt} sector={sectorValue} />

      <nav aria-labelledby="dayof-more" className="border-t border-gray-200 pt-4 space-y-2">
        <h2 id="dayof-more" className="text-sm font-semibold text-gray-700">Autres pages de l&apos;événement</h2>
        <ul role="list" className="flex flex-wrap gap-2">
          <li><Link href={withSectorFilter(`${base}/registrations`, sector.filter)} className={navLinkClass}>Inscriptions</Link></li>
          <li><Link href={withSectorFilter(`${base}/staffing`, sector.filter)} className={navLinkClass}>Où manque-t-il du monde ?</Link></li>
          <li><Link href={`${base}/message`} className={navLinkClass}>Écrire aux bénévoles</Link></li>
        </ul>
      </nav>
    </div>
  )
}
