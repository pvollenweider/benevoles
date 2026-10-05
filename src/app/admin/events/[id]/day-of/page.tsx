// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import type { Metadata } from "next"
import Link from "next/link"
import { notFound, redirect } from "next/navigation"
import { getOrgContext } from "@/lib/auth-guard"
import { orgTimeZone } from "@/lib/time-zone"
import { contactPhone } from "@/lib/contact-phone"
import { formatShortDate } from "@/lib/utils"
import { fmtHour } from "@/lib/registrations-list"
import { dayOfBoard, dayOfDateRange, isEventDay, localDay, type DayOfShift } from "@/lib/day-of"
import DayOfBoard from "@/components/admin/DayOfBoard"
import HelpLink from "@/components/admin/HelpLink"

export const dynamic = "force-dynamic"

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const ctx = await getOrgContext()
  if (!ctx) return { title: "Jour J" }
  const { id } = await params
  const event = await ctx.db.event.findFirst({ where: { id }, select: { title: true } })
  return { title: event ? `Jour J, ${event.title}` : "Jour J" }
}

const linkClass =
  "font-medium text-blue-700 underline underline-offset-2 hover:text-blue-900 rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
const navLinkClass =
  "inline-flex items-center min-h-11 px-4 rounded-xl border border-gray-300 bg-white text-sm font-medium text-gray-800 hover:bg-gray-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"

/**
 * « Jour J » (#561): what the coordinator needs on site, on a phone. Shifts running now and in
 * the next hours, who is expected and who has arrived, one tap to mark someone present. Only the
 * name, the shift, the state and the phone: no email, answers or notes.
 */
export default async function DayOfPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await getOrgContext()
  if (!ctx) redirect("/admin/login")
  const { id } = await params
  const now = new Date()
  const range = dayOfDateRange(now)

  const event = await ctx.db.event.findFirst({
    where: { id },
    select: {
      id: true, title: true, startDate: true, endDate: true,
      organization: { select: { timeZone: true } },
      shifts: {
        where: { status: { not: "cancelled" }, date: { gte: range.from, lte: range.to } },
        select: {
          id: true, roleName: true, label: true, date: true, startTime: true, endTime: true, capacity: true, displayOrder: true,
          contactName: true, contactPhone: true,
          // Confirmed people only: check-in applies to them (#399), as on the registrations list.
          registrations: {
            where: { status: "active" },
            select: { id: true, phone: true, checkedInAt: true, volunteer: { select: { firstName: true, lastName: true, phone: true } } },
          },
        },
      },
    },
  })
  if (!event) notFound()

  const timeZone = orgTimeZone(event.organization)
  const shifts: DayOfShift[] = event.shifts.map((s) => ({
    id: s.id, roleName: s.roleName, label: s.label, date: s.date.toISOString().slice(0, 10),
    startTime: s.startTime, endTime: s.endTime, capacity: s.capacity, displayOrder: s.displayOrder,
    contactName: s.contactName, contactPhone: s.contactPhone,
    people: s.registrations
      .map((r) => ({
        registrationId: r.id,
        firstName: r.volunteer.firstName,
        lastName: r.volunteer.lastName,
        phone: contactPhone(r),
        checkedInAt: r.checkedInAt?.toISOString() ?? null,
      }))
      .sort((a, b) => a.lastName.localeCompare(b.lastName, "fr") || a.firstName.localeCompare(b.firstName, "fr")),
  }))
  const board = dayOfBoard(shifts, now, timeZone)
  const base = `/admin/events/${event.id}`
  const clock = now.toLocaleTimeString("fr-CH", { timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
  const eventDay = isEventDay({ startDate: event.startDate.toISOString(), endDate: event.endDate.toISOString() }, now, timeZone)

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <Link href={base} className={`inline-flex min-h-11 items-center text-sm ${linkClass}`}><span aria-hidden="true">← </span>Retour à {event.title}</Link>
        <h1 id="page-heading" tabIndex={-1} className="text-xl font-bold text-gray-900 focus:outline-none">Jour J</h1>
        <p className="text-sm text-gray-700">{event.title}</p>
        <HelpLink route="/admin/events/[id]/day-of" />
      </div>

      {!eventDay && (
        <p className="text-sm text-gray-800 bg-blue-50 border border-blue-200 rounded-xl px-4 py-3">
          {formatShortDate(event.startDate) === formatShortDate(event.endDate)
            ? `L'événement a lieu le ${formatShortDate(event.startDate)}.`
            : `L'événement a lieu du ${formatShortDate(event.startDate)} au ${formatShortDate(event.endDate)}.`}
          {" "}Cette page sert pendant l&apos;événement : les créneaux en cours, ceux des prochaines heures et les présences.
        </p>
      )}

      <DayOfBoard eventId={event.id} board={board} today={localDay(now, timeZone)} refreshedAt={fmtHour(clock)} />

      <nav aria-labelledby="dayof-more" className="border-t border-gray-200 pt-4 space-y-2">
        <h2 id="dayof-more" className="text-sm font-semibold text-gray-700">Autres pages de l&apos;événement</h2>
        <ul role="list" className="flex flex-wrap gap-2">
          <li><Link href={`${base}/registrations`} className={navLinkClass}>Inscriptions</Link></li>
          <li><Link href={`${base}/staffing`} className={navLinkClass}>Où manque-t-il du monde ?</Link></li>
          <li><Link href={`${base}/message`} className={navLinkClass}>Écrire aux bénévoles</Link></li>
        </ul>
      </nav>
    </div>
  )
}
