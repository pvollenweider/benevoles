// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import Link from "next/link"
import { fmtRange } from "@/lib/gantt-utils"
import { fillPercent, shiftStaffingState, spokenStaffingState, staffingStateText, type StaffingShiftLine as Line, type StaffingState } from "@/lib/staffing"

/**
 * The state of a shift against its minimum (#949), in words: « sous le minimum (2) » in a red badge
 * with ⚠, « minimum atteint » or « complet » as plain text. Nothing without a minimum. Screen
 * readers get « sous le minimum de 2 » (« (2) » would be a bare number). The badge uses the
 * Erreur pair of DESIGN.md (#fee2e2 / #b91c1c), with a border in forced colours.
 */
export function StaffingStateLabel({ s, state }: { s: { capacity: number; minVolunteers?: number | null }; state: StaffingState }) {
  const text = staffingStateText(s, state)
  if (!text) return null
  const spoken = spokenStaffingState(s, state) ?? text
  const words = (
    <>
      <span aria-hidden="true">{text}</span>
      <span className="sr-only">{spoken}</span>
    </>
  )
  if (state !== "below_minimum") return words
  return (
    <span className="inline-block rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700 forced-colors:border forced-colors:border-[CanvasText]">
      <span aria-hidden="true">⚠ </span>
      {words}
    </span>
  )
}

/** « · minimum atteint » after the figures, or nothing for a shift without a minimum. */
export function StaffingStateSuffix({ s }: { s: { capacity: number; minVolunteers?: number | null; active: number; requested?: number; state?: StaffingState } }) {
  const state = s.state ?? shiftStaffingState(s)
  if (!staffingStateText(s, state)) return null
  return <> · <StaffingStateLabel s={s} state={state} /></>
}

export const staffingLinkClass =
  "font-medium text-blue-700 underline underline-offset-2 hover:text-blue-900 rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"

// Shift.date is a UTC midnight.
const day = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("fr-FR", { timeZone: "UTC", weekday: "short", day: "numeric", month: "short" })

/** Filled share as a bar. Decorative: the figures next to it carry the meaning. */
export function Meter({ active, capacity, className = "" }: { active: number; capacity: number; className?: string }) {
  const pct = fillPercent(active, capacity)
  return (
    <span aria-hidden="true" className={`block h-2 rounded-full bg-gray-200 overflow-hidden ${className}`}>
      <span className={`block h-full rounded-full ${pct >= 100 ? "bg-gray-700" : "bg-blue-600"}`} style={{ width: `${pct}%` }} />
    </span>
  )
}

/**
 * One shift of the coverage report (« Où manque-t-il du monde ? »): its link to the registrations,
 * then its own action (« Chercher des bénévoles ») on a line of its own (#926: the two links ran
 * together, « 09:00–12:00Chercher des bénévoles »).
 */
export function ShiftLine({ eventId, group, s, detail, action }: { eventId: string; group: string; s: Line; detail: React.ReactNode; action?: React.ReactNode }) {
  const name = s.label !== s.roleName ? `${s.roleName} · ${s.label}` : s.roleName
  const detailId = `${group}-${s.id}-detail`
  return (
    <li className="px-4 py-3 text-sm grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_auto] gap-x-6 gap-y-2 items-center">
      <div className="min-w-0">
        {/* Date and time inside the link: its name is what's visible, nothing duplicated for AT.
            The space keeps « Bar » and the date apart in the link's name too (#926). */}
        <Link href={`/admin/events/${eventId}/registrations?shift=${encodeURIComponent(s.id)}`} aria-describedby={detailId} className={staffingLinkClass}>
          {name}{" "}
          <span className="block sm:inline font-normal text-gray-600 sm:ml-1">{day(s.date)} · {fmtRange(s.startTime, s.endTime)}</span>
        </Link>
        {action && <div className="sm:mt-1">{action}</div>}
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 sm:justify-end">
        <Meter active={s.active} capacity={s.capacity} className="w-full sm:w-24 shrink-0" />
        <p id={detailId} className="text-gray-800 tabular-nums">{detail}</p>
      </div>
    </li>
  )
}
