"use client"

// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { fmt, toMin } from "@/lib/gantt-utils"
import { shiftListText, shiftViewState, type HeldKind, type TimelineShift } from "@/lib/public-timeline"

type Show = { name: string; startTime: string; endTime: string }

/**
 * A day's shifts as a list (#808), the alternative to the timeline on a small screen: in reading
 * order (start time, then role order, then label), no horizontal scrolling. Each shift is a
 * button whose visible text is its whole accessible name (WCAG 2.5.3). The rules of what can be
 * selected are the timeline's (`shiftViewState`, src/lib/public-timeline.ts). A shift that can't
 * be chosen stays in the tab order (aria-disabled), so it can be found and read.
 */
export default function ShiftDayList({
  shifts,
  shows,
  selected,
  held,
  conflicts,
  onToggle,
  locked = false,
  describedBy,
  limitReachedRoles,
  reservedShiftIds,
  dayLabel,
}: {
  shifts: TimelineShift[]
  shows: Show[]
  selected: Set<string>
  held?: Map<string, HeldKind>
  conflicts?: Set<string>
  onToggle: (id: string, status: string) => void
  locked?: boolean
  describedBy?: string
  limitReachedRoles?: Map<string, number>
  reservedShiftIds?: Set<string>
  dayLabel: string
}) {
  const visible = shifts
    .filter((s) => s.status !== "cancelled")
    .sort((a, b) => toMin(a.startTime) - toMin(b.startTime) || (a.displayOrder ?? 0) - (b.displayOrder ?? 0) || a.label.localeCompare(b.label, "fr"))
  if (visible.length === 0) return null

  return (
    <ul aria-label={`Créneaux du ${dayLabel}`} className="mb-5 space-y-2">
      {shows.map((show, i) => (
        <li key={`show-${i}`} className="rounded-xl bg-indigo-50 px-4 py-2 text-sm text-indigo-950 break-words">
          Spectacle : {show.name}, {fmt(show.startTime)}–{fmt(show.endTime)}
        </li>
      ))}
      {visible.map((shift) => {
        const view = shiftViewState({
          shift,
          held: held?.get(shift.id),
          selected: selected.has(shift.id),
          conflict: conflicts?.has(shift.id) ?? false,
          reserved: !!reservedShiftIds?.has(shift.id),
          locked,
        })
        const text = shiftListText(shift, view, { locked: locked && !view.selected, limitReached: view.selected ? undefined : limitReachedRoles?.get(shift.roleName) })
        const tone = view.held
          ? "border-green-700 bg-green-50"
          : view.selected
            ? "border-blue-700 bg-blue-50"
            : view.clickable
              ? "border-gray-300 bg-white hover:bg-gray-50"
              : "border-gray-200 bg-gray-50"
        return (
          <li key={shift.id}>
            <button
              type="button"
              data-shift-id={shift.id}
              aria-pressed={view.clickable ? view.selected : undefined}
              aria-disabled={view.clickable ? undefined : true}
              aria-describedby={!view.clickable && (locked || view.reserved) ? describedBy : undefined}
              onClick={() => { if (view.clickable) onToggle(shift.id, shift.status) }}
              className={`w-full min-h-11 rounded-xl border-2 px-4 py-2 text-left break-words focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 ${tone} ${view.clickable ? "cursor-pointer" : "cursor-default"}`}
            >
              <span className="block text-base font-medium text-gray-900">{text.title}</span>
              {/* Spaces between the lines: the accessible name reads them apart. */}
              {" "}
              <span className="mt-0.5 flex items-center gap-1 text-sm text-gray-800">
                {(view.selected || view.held) && (
                  <svg aria-hidden="true" className="w-4 h-4 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                )}
                <span>{text.status}</span>
              </span>
              {text.details && <>{" "}<span className="mt-0.5 block text-sm text-gray-700">{text.details}</span></>}
            </button>
          </li>
        )
      })}
    </ul>
  )
}
