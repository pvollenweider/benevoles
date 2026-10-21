"use client"

// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { useState } from "react"
import { fmtRange } from "@/lib/gantt-utils"
import { announce } from "@/lib/announce"
import {
  ROSTER_EMPTY_TEXT, ROSTER_FAILURE_TEXT, rosterButtonLabel, rosterDoneText, rosterSpokenName, viewerStateText,
  type RosterViewerState, type ShiftRosterEntry,
} from "@/lib/shift-roster"

/** What GET /api/public/registrations/[token]/roster answers (#1068). */
export type RosterData =
  | { available: false }
  | { available: true; displayName: string | null; state: RosterViewerState; shifts: ShiftRosterEntry[] }

const CHOICE_ID = "roster-choice"

/** « Aline M. » shown, « Aline, initiale M » spoken: French voices read « M. » alone as « Monsieur ». */
function RosterName({ name }: { name: string }) {
  const spoken = rosterSpokenName(name)
  if (spoken === name) return <>{name}</>
  return (
    <>
      <span aria-hidden="true">{name}</span>
      <span className="sr-only">{spoken}</span>
    </>
  )
}

/**
 * « Qui est inscrit » (#1068), on the personal page: shift by shift over the event, the other
 * confirmed volunteers who chose to show their name (shifts without any are left out), then the
 * volunteer's own choice with one button to change it. The page loads the data with its own and
 * renders nothing while the event has no roster. Focus stays on the button; the result is said
 * by the card's status line, a failure by its alert, both mounted from the first render.
 */
export default function ShiftRosterCard({ token, data, onChange }: {
  token: string
  data: Extract<RosterData, { available: true }>
  onChange: (next: RosterData) => void
}) {
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState("")
  const [failure, setFailure] = useState("")

  async function toggle() {
    if (busy || data.state === "minor") return
    const visible = data.state !== "visible"
    setBusy(true)
    setFailure("")
    let next: RosterData | null = null
    let error: string | null = null
    try {
      const res = await fetch(`/api/public/registrations/${token}/roster`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ visible }),
      })
      const body = await res.json().catch(() => null)
      if (res.ok && body && typeof body.available === "boolean") next = body as RosterData
      else error = typeof body?.error === "string" && res.status !== 500 ? body.error : ROSTER_FAILURE_TEXT
    } catch {
      error = ROSTER_FAILURE_TEXT
    }
    setBusy(false)
    if (next) {
      announce(setStatus, rosterDoneText(visible))
      onChange(next)
    } else {
      announce(setFailure, error ?? ROSTER_FAILURE_TEXT)
    }
  }

  return (
    <section aria-labelledby="roster-title" className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
      <div>
        <h2 id="roster-title" className="text-sm font-semibold text-gray-900">Qui est inscrit</h2>
        <p className="text-sm text-gray-700 mt-0.5">Les bénévoles confirmés de l&apos;événement qui ont choisi d&apos;afficher leur nom, créneau par créneau.</p>
      </div>

      {data.shifts.length === 0 && <p className="text-sm text-gray-600">{ROSTER_EMPTY_TEXT}</p>}
      {data.shifts.map((shift) => {
        // Shift dates are calendar days at midnight UTC: read them in UTC, whatever the visitor's zone.
        const date = new Date(shift.date).toLocaleDateString("fr-FR", { timeZone: "UTC", weekday: "long", day: "numeric", month: "long" })
        return (
          <div key={shift.shiftId}>
            <h3 className="text-sm font-medium text-gray-900 break-words">
              {shift.label} <span className="font-normal text-gray-600">· {date} · {fmtRange(shift.startTime, shift.endTime)}</span>
            </h3>
            <ul role="list" className="mt-1 space-y-0.5 text-sm text-gray-700">
              {shift.names.map((name) => <li key={name} className="break-words"><RosterName name={name} /></li>)}
            </ul>
          </div>
        )
      })}

      <div className="border-t border-gray-100 pt-3 space-y-2">
        <p id={CHOICE_ID} className="text-sm text-gray-700">
          {data.displayName && rosterSpokenName(data.displayName) !== data.displayName ? (
            <>
              <span aria-hidden="true">{viewerStateText(data.state, data.displayName)}</span>
              <span className="sr-only">{viewerStateText(data.state, rosterSpokenName(data.displayName))}</span>
            </>
          ) : viewerStateText(data.state, data.displayName)}
        </p>
        {data.state !== "minor" && (
          <div className="flex flex-col items-start gap-2 sm:flex-row sm:items-center">
            <button
              type="button"
              onClick={toggle}
              aria-describedby={CHOICE_ID}
              aria-disabled={busy || undefined}
              className="border border-blue-600 text-blue-600 rounded-xl px-4 py-2 text-sm font-medium transition-colors hover:bg-blue-50 aria-disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
            >
              {rosterButtonLabel(data.state)}
            </button>
            {/* Visible only: the result is said once by the status line below (DESIGN.md). */}
            {busy && <p className="text-sm text-gray-700">Enregistrement…</p>}
          </div>
        )}
        {/* Always mounted, so that the next text is voiced (announce). */}
        <p role="alert" className={failure ? "text-sm text-red-700" : "sr-only"}>{failure}</p>
        <p role="status" className="sr-only">{status}</p>
      </div>
    </section>
  )
}
