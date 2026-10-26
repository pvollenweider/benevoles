"use client"

// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { useId, useMemo, useState } from "react"
import { fmtRange } from "@/lib/gantt-utils"
import { spokenStaffingState, staffingStateText, type StaffingState } from "@/lib/staffing"
import { mailtoHref } from "@/lib/email-address"
import { telHref } from "@/lib/shift-info"
import { dayKey } from "@/lib/leader-scope"
import { leaderRosterCount, leaderRosterDays, leaderRosterByPoste } from "@/lib/leader-roster"

/**
 * The read-only roster of a sector leader (#1169): every poste of the sector, grouped by poste,
 * filterable by day. The API already limits every row to the sector's postes (B05): the counts
 * here are computed from those rows only. A poste leader keeps the page of before #1169.
 */

export type RosterRegistration = {
  id: string
  status: string
  comment: string | null
  volunteer: { firstName: string; lastName: string; email: string | null; phone: string }
  shift: { roleName: string; label: string; date: string; startTime: string; endTime: string }
}

export type RosterStaffing = {
  roleName: string
  label: string; date: string; startTime: string; endTime: string
  capacity: number; minVolunteers: number; active: number; state: StaffingState
}

const longDay = (key: string) => new Date(`${key}T00:00:00Z`).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" })

/** « · » between parts, read as a comma. */
function Dot() {
  return <><span aria-hidden="true"> · </span><span className="sr-only">, </span></>
}

function StaffingLine({ s }: { s: RosterStaffing }) {
  const text = staffingStateText(s, s.state)
  if (!text) return null
  const below = s.state === "below_minimum"
  return (
    <p className={`text-xs mt-0.5 ${below ? "font-semibold text-red-800" : "text-gray-700"}`}>
      <span aria-hidden="true">{below ? "⚠ " : ""}{s.active}/{s.capacity} · {text}</span>
      <span className="sr-only">{s.active} inscrit{s.active > 1 ? "s" : ""} sur {s.capacity}, {spokenStaffingState(s, s.state)}</span>
    </p>
  )
}

export default function SectorLeaderRoster({ heading, eventTitle, postes, registrations, staffing }: {
  heading: string
  eventTitle: string
  postes: string[]
  registrations: RosterRegistration[]
  staffing: RosterStaffing[]
}) {
  const ids = useId()
  const days = useMemo(() => leaderRosterDays(registrations, staffing), [registrations, staffing])
  const [day, setDay] = useState("")
  const showFilter = days.length > 1
  const inDay = (date: string) => !day || dayKey(date) === day
  const visible = registrations.filter((r) => inDay(r.shift.date))
  const belowMinimum = staffing.filter((s) => s.state === "below_minimum" && inDay(s.date))
  const byPoste = leaderRosterByPoste(postes, visible)
  const count = leaderRosterCount(visible)
  const countText = `${count} bénévole${count > 1 ? "s" : ""} inscrit${count > 1 ? "s" : ""}`
  const staffingByKey = new Map(staffing.map((s) => [`${s.roleName}__${s.label}__${s.date}__${s.startTime}`, s]))

  return (
    <div className="max-w-lg mx-auto space-y-4">
      <div>
        <p className="text-sm text-gray-500">{eventTitle}</p>
        <h1 className="text-xl font-bold text-gray-900 break-words">{heading}</h1>
        {showFilter && (
          <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1">
            <label htmlFor={`${ids}-day`} className="text-sm text-gray-700">Jour</label>
            <select
              id={`${ids}-day`}
              value={day}
              onChange={(e) => setDay(e.target.value)}
              className="w-full sm:w-auto border border-gray-500 rounded-lg px-3 py-1.5 text-sm bg-white"
            >
              <option value="">Tous les jours</option>
              {days.map((d) => <option key={d} value={d}>{longDay(d)}</option>)}
            </select>
          </div>
        )}
        {/* The count follows the day filter; one region, never remounted, read in full. */}
        {showFilter ? (
          <p role="status" aria-atomic="true" className="text-sm text-gray-600 mt-1">
            {countText}, {day ? longDay(day) : "tous les jours"}
            {belowMinimum.length > 0 && <span className="sr-only">, {belowMinimum.length > 1 ? `${belowMinimum.length} créneaux sous leur minimum` : "1 créneau sous son minimum"}</span>}
          </p>
        ) : (
          <p className="text-sm text-gray-600 mt-1">{countText}</p>
        )}
      </div>

      {belowMinimum.length > 0 && (
        <section aria-labelledby={`${ids}-below`} className="bg-white rounded-xl border border-red-200 p-4">
          <h2 id={`${ids}-below`} className="font-medium text-gray-900 text-sm">
            <span aria-hidden="true">⚠ </span>{belowMinimum.length > 1 ? `${belowMinimum.length} créneaux sous leur minimum` : "1 créneau sous son minimum"}
          </h2>
          <p className="text-xs text-gray-600 mt-0.5">Sous ce nombre de personnes, le créneau ne peut pas tourner.</p>
          <ul role="list" className="mt-2 space-y-1 text-sm text-gray-900">
            {belowMinimum.map((s, i) => (
              <li key={i} className="break-words">
                {s.roleName}<Dot />{s.label}, {longDay(dayKey(s.date))}<Dot />{fmtRange(s.startTime, s.endTime)}
                <StaffingLine s={s} />
              </li>
            ))}
          </ul>
        </section>
      )}

      {postes.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-200 p-8 text-center text-gray-500 text-sm">
          Aucun poste n&apos;est dans ce secteur pour l&apos;instant.
        </div>
      ) : (
        <div className="space-y-4">
          {byPoste.map((poste, p) => {
            const posteId = `${ids}-poste-${p}`
            const n = leaderRosterCount(poste.shifts.flatMap((s) => s.registrations))
            return (
              <section key={poste.roleName} aria-labelledby={posteId} className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
                <h2 id={posteId} className="font-semibold text-gray-900 break-words">
                  {poste.roleName}<span className="sr-only">, </span>
                  <span className="ml-2 text-xs font-normal text-gray-600">{n} inscrit{n > 1 ? "s" : ""}</span>
                </h2>
                {poste.shifts.length === 0 ? (
                  <p className="text-sm text-gray-500">{day ? "Personne n'est inscrit·e ce jour-là." : "Personne n'est encore inscrit·e sur ce poste."}</p>
                ) : poste.shifts.map((group, g) => {
                  const shiftId = `${posteId}-shift-${g}`
                  const st = staffingByKey.get(`${poste.roleName}__${group.label}__${group.date}__${group.startTime}`)
                  return (
                    <section key={g} aria-labelledby={shiftId} className="border-t border-gray-100 pt-3 first:border-t-0 first:pt-0">
                      <h3 id={shiftId} className="font-medium text-gray-900 text-sm break-words">{group.label}</h3>
                      <p className={`text-xs text-gray-500 mt-0.5 ${st ? "" : "mb-2"}`}>{longDay(dayKey(group.date))}<Dot />{fmtRange(group.startTime, group.endTime)}</p>
                      {st && <div className="mb-2"><StaffingLine s={st} /></div>}
                      <ul className="space-y-2" role="list">
                        {group.registrations.map((reg) => (
                          <li key={reg.id} className="border-t border-gray-100 pt-2 first:border-t-0 first:pt-0">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <span className="text-sm text-gray-900">{reg.volunteer.firstName} {reg.volunteer.lastName}</span>
                              {reg.status === "waiting" && (
                                <span className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5 flex-shrink-0">Liste d&apos;attente</span>
                              )}
                            </div>
                            <div className="text-xs text-gray-500 mt-0.5 flex flex-wrap gap-x-3 break-all">
                              {mailtoHref(reg.volunteer.email) ? (
                                <a href={mailtoHref(reg.volunteer.email)!} className="hover:text-blue-600 underline-offset-2 hover:underline">{reg.volunteer.email}</a>
                              ) : reg.volunteer.email && <span>{reg.volunteer.email}</span>}
                              {reg.volunteer.phone && (telHref(reg.volunteer.phone) !== "tel:" ? (
                                <a href={telHref(reg.volunteer.phone)} className="hover:text-blue-600 underline-offset-2 hover:underline">{reg.volunteer.phone}</a>
                              ) : <span>{reg.volunteer.phone}</span>)}
                            </div>
                            {reg.comment && <p className="text-xs text-gray-600 mt-1 italic">{reg.comment}</p>}
                          </li>
                        ))}
                      </ul>
                    </section>
                  )
                })}
              </section>
            )
          })}
        </div>
      )}
    </div>
  )
}
