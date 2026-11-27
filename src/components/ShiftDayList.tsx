"use client"

// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { useState } from "react"
import ShiftInfoList from "@/components/ShiftInfoList"
import { detailsButtonName, type ShiftDetails } from "@/lib/shift-details"
import { fmt, toMin } from "@/lib/gantt-utils"
import { shiftListText, shiftViewState, type HeldKind, type TimelineShift } from "@/lib/public-timeline"
import type { ShiftRosterEntry } from "@/lib/shift-roster"
import { RosterSummary } from "@/components/public/RosterName"
import { shiftListRowLook } from "@/lib/shift-list-look"

type Show = { name: string; startTime: string; endTime: string }

/**
 * A day's shifts as a list (#808), the alternative to the timeline on a small screen: in reading
 * order (start time, then role order, then label), no horizontal scrolling. Each shift is a
 * button whose visible text is its whole accessible name (WCAG 2.5.3). The rules of what can be
 * selected are the timeline's (`shiftViewState`, src/lib/public-timeline.ts). A shift that can't
 * be chosen stays in the tab order (aria-disabled), so it can be found and read.
 *
 * A shift that can be chosen (selected and held included) is a card with a 6 px left border in
 * the poste's colour (`shiftListRowLook`, src/lib/shift-list-look.ts). One that cannot is quiet:
 * no frame, no ground, grey text, the state on the title's line when it fits and under it when not.
 *
 * `roster` (#1068): « Voir qui est inscrit » is on, by shift id. A line under each shift with other
 * confirmed volunteers says who (« Sur ce créneau : Aline M. et 2 autres bénévoles. »), read with
 * the button as its description; nothing under a shift with nobody else.
 */
export default function ShiftDayList({
  shifts,
  shows,
  selected,
  held,
  conflicts,
  onToggle,
  locked = false,
  lockedMessageId,
  reservedMessageId,
  limitReachedRoles,
  reservedShiftIds,
  dayLabel,
  roster,
  details,
}: {
  shifts: TimelineShift[]
  shows: Show[]
  selected: Set<string>
  held?: Map<string, HeldKind>
  conflicts?: Set<string>
  onToggle: (id: string, status: string) => void
  locked?: boolean
  /** The text saying registrations are closed: read with a shift that can't be chosen for it. */
  lockedMessageId?: string
  /** The text explaining reserved roles: read with a reserved shift. */
  reservedMessageId?: string
  limitReachedRoles?: Map<string, number>
  reservedShiftIds?: Set<string>
  dayLabel: string
  roster?: Map<string, ShiftRosterEntry> | null
  /**
   * What can be read about a shift before choosing it (#1471), by shift id. A « Détails » button
   * under the row opens it in place, without selecting the shift.
   */
  details?: Map<string, ShiftDetails> | null
}) {
  const [openDetails, setOpenDetails] = useState<Set<string>>(() => new Set())
  const visible = shifts
    .filter((s) => s.status !== "cancelled")
    .sort((a, b) => toMin(a.startTime) - toMin(b.startTime) || (a.displayOrder ?? 0) - (b.displayOrder ?? 0) || a.label.localeCompare(b.label, "fr"))
  if (visible.length === 0) return null

  // The view, text and look of every row; the previous row decides the 4 px gap between two quiet
  // rows (8 px everywhere else).
  const rows = visible.map((shift) => {
    const view = shiftViewState({
      shift,
      held: held?.get(shift.id),
      selected: selected.has(shift.id),
      conflict: conflicts?.has(shift.id) ?? false,
      reserved: !!reservedShiftIds?.has(shift.id),
      locked,
    })
    const textOpts = { locked: locked && !view.selected, limitReached: view.selected ? undefined : limitReachedRoles?.get(shift.roleName) }
    const text = shiftListText(shift, view, textOpts)
    const look = shiftListRowLook({ view, roleName: shift.roleName, colorKey: shift.colorKey, limitReached: textOpts.limitReached })
    const rosterEntry = roster?.get(shift.id)
    const rosterId = rosterEntry && (rosterEntry.names.length > 0 || rosterEntry.othersCount > 0) ? `roster-list-${shift.id}` : undefined
    const reasonId = view.clickable ? undefined : view.reserved ? reservedMessageId : locked ? lockedMessageId : undefined
    return { shift, view, text, look, rosterEntry, rosterId, reasonId }
  })

  return (
    <ul aria-label={`Créneaux du ${dayLabel}`} className="mb-5">
      {shows.map((show, i) => (
        <li key={`show-${i}`} className={`rounded-xl bg-indigo-50 px-4 py-2 text-sm text-indigo-950 break-words ${i > 0 ? "mt-2" : ""}`}>
          Spectacle : {show.name}, {fmt(show.startTime)}–{fmt(show.endTime)}
        </li>
      ))}
      {rows.map(({ shift, view, text, look, rosterEntry, rosterId, reasonId }, i) => {
        const gap = i > 0
          ? (rows[i - 1].look.kind === "quiet" && look.kind === "quiet" ? "mt-1" : "mt-2")
          : shows.length > 0 ? "mt-2" : ""
        return (
          <li key={shift.id} className={gap || undefined}>
            <button
              type="button"
              data-shift-id={shift.id}
              aria-pressed={view.clickable ? view.selected : undefined}
              aria-disabled={view.clickable ? undefined : true}
              aria-describedby={[rosterId, reasonId].filter(Boolean).join(" ") || undefined}
              onClick={() => { if (view.clickable) onToggle(shift.id, shift.status) }}
              className={look.button}
            >
              <span className={look.title}>{text.title}{look.kind === "quiet" ? " " : null}</span>
              {/* Spaces between the lines: the accessible name reads them apart. On a quiet row the
                  button is a flex container, where a whitespace-only text node has no box: the
                  spaces its name needs are inside the spans instead, without changing the layout. */}
              {" "}
              <span className={look.statusLine}>
                {view.held ? (
                  // Held: a check in a circle, as on the timeline; selected: a plain check.
                  <svg aria-hidden="true" className="w-4 h-4 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                ) : view.selected ? (
                  <svg aria-hidden="true" className="w-4 h-4 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                ) : null}
                <span>{text.status}{look.kind === "quiet" ? " " : null}</span>
              </span>
              {text.details && <>{" "}<span className={look.details}>{text.details}</span></>}
            </button>
            {rosterId && (
              <p id={rosterId} className="mt-1 px-1 text-sm text-gray-700 break-words">
                <RosterSummary entry={rosterEntry} own={rosterEntry?.own ?? false} />
              </p>
            )}
            {details?.get(shift.id) && (() => {
              const info = details.get(shift.id)!
              const open = openDetails.has(shift.id)
              const panelId = `details-list-${shift.id}`
              return (
                <>
                  {/* A sibling of the row, on its own line: a slip of the finger never selects the
                      shift. Never disabled, never grey, even under a shift that can't be chosen. */}
                  <button
                    type="button"
                    aria-expanded={open}
                    aria-controls={panelId}
                    aria-label={detailsButtonName(text.title)}
                    onClick={() => setOpenDetails((prev) => {
                      const next = new Set(prev)
                      if (next.has(shift.id)) next.delete(shift.id)
                      else next.add(shift.id)
                      return next
                    })}
                    className="mt-1 inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-gray-400 bg-white px-3 text-sm font-medium text-gray-800 hover:bg-gray-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 forced-colors:border-[ButtonText]"
                  >
                    <svg aria-hidden="true" className={`h-4 w-4 transition-transform motion-reduce:transition-none ${open ? "rotate-90" : ""}`} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                    </svg>
                    Détails
                  </button>
                  <div id={panelId} hidden={!open} className="mt-1 px-1 text-sm text-gray-700 break-words">
                    {info.description && <p className="whitespace-pre-line">{info.description}</p>}
                    <ShiftInfoList info={info.info} className={info.description ? "mt-1" : ""} />
                  </div>
                </>
              )
            })()}
          </li>
        )
      })}
    </ul>
  )
}
