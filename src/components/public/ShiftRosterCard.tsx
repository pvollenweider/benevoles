"use client"

// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { useRef, useState } from "react"
import { fmtRange } from "@/lib/gantt-utils"
import { announce } from "@/lib/announce"
import {
  ROSTER_EMPTY_TEXT, ROSTER_FAILURE_TEXT, ROSTER_INTRO_TEXT, ROSTER_SEE_OTHERS_LABEL, ROSTER_WIDEN_LABEL, rosterButtonLabel,
  rosterDoneText, rosterEventHref, rosterOthersText, rosterSpokenName, rosterVisibleName, viewerStateText,
  type RosterAction, type RosterViewerState, type ShiftRosterEntry,
} from "@/lib/shift-roster"
import { RosterName } from "./RosterName"

/** What GET /api/public/registrations/[token]/roster answers (#1068). */
export type RosterData =
  | { available: false }
  | { available: true; displayName: string | null; state: RosterViewerState; shifts: ShiftRosterEntry[] }

const CHOICE_ID = "roster-choice"

/**
 * « Qui est inscrit » (#1068), on the personal page: the viewer's own confirmed shifts, each with
 * the other confirmed volunteers who chose to show their name, then how many others are there
 * without it (a number from the server, nothing else), and a link to the event page where
 * « Voir qui est inscrit » shows every shift. Then the volunteer's own choice with its button(s):
 * a name shown under the first text (confirmed volunteers only) is offered the current one
 * (invited members too). The page loads the data with its own and renders nothing while the event
 * has no roster. Focus stays on the button pressed, or moves to « Masquer mon nom » once the
 * second button is gone; the result is said by the card's status line, a failure by its alert,
 * both mounted from the first render.
 */
export default function ShiftRosterCard({ token, data, beginChange, eventPageUrl }: {
  token: string
  data: Extract<RosterData, { available: true }>
  /** Called when a change is sent; returns what applies its answer (a no-op if the page moved on since). */
  beginChange: () => (next: RosterData) => void
  /** The event's public page, while published: the link to the other shifts. */
  eventPageUrl?: string | null
}) {
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState("")
  const [failure, setFailure] = useState("")
  const mainButton = useRef<HTMLButtonElement>(null)

  async function change(action: RosterAction) {
    if (busy || data.state === "minor") return
    const visible = action !== "hide"
    setBusy(true)
    setFailure("")
    setStatus("")
    const apply = beginChange()
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
      announce(setStatus, rosterDoneText(action))
      apply(next)
      // The second button unmounts with its state: focus to the one left.
      if (action === "widen") requestAnimationFrame(() => mainButton.current?.focus())
    } else {
      announce(setFailure, error ?? ROSTER_FAILURE_TEXT)
    }
  }

  const mine = data.shifts.filter((s) => s.own)
  const mainAction: RosterAction = data.state === "visible" || data.state === "visible_confirmed" ? "hide" : "show"

  return (
    <section id="roster-title-region" aria-labelledby="roster-title" className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
      <div>
        <h2 id="roster-title" className="text-sm font-semibold text-gray-900">Qui est inscrit</h2>
        <p className="text-sm text-gray-700 mt-0.5">{ROSTER_INTRO_TEXT}</p>
      </div>

      {mine.length === 0 && <p className="text-sm text-gray-600">{ROSTER_EMPTY_TEXT}</p>}
      {mine.map((shift) => {
        // Shift dates are calendar days at midnight UTC: read them in UTC, whatever the visitor's zone.
        const date = new Date(shift.date).toLocaleDateString("fr-FR", { timeZone: "UTC", weekday: "long", day: "numeric", month: "long" })
        // After the list, not a list item: the list's count stays the number of people named.
        const others = rosterOthersText(shift.othersCount, shift.names.length > 0)
        return (
          <div key={shift.shiftId}>
            <h3 className="text-sm font-medium text-gray-900 break-words">
              {shift.label} <span className="font-normal text-gray-600">· {date} · {fmtRange(shift.startTime, shift.endTime)}</span>
            </h3>
            {shift.names.length > 0 && (
              <ul role="list" className="mt-1 space-y-0.5 text-sm text-gray-700">
                {shift.names.map((name, i) => <li key={i} className="break-words"><RosterName name={name} /></li>)}
              </ul>
            )}
            {others && <p className={`${shift.names.length > 0 ? "mt-0.5" : "mt-1"} text-sm text-gray-700 break-words`}>{others}</p>}
            {!others && shift.names.length === 0 && <p className="mt-1 text-sm text-gray-700">Personne d&apos;autre pour l&apos;instant.</p>}
          </div>
        )
      })}

      {eventPageUrl && (
        <p className="text-sm">
          <a href={rosterEventHref(eventPageUrl)} className="font-medium text-blue-700 underline underline-offset-2 hover:text-blue-900 rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600">{ROSTER_SEE_OTHERS_LABEL}</a>
        </p>
      )}

      <div className="border-t border-gray-100 pt-3 space-y-2">
        <p id={CHOICE_ID} className="text-sm text-gray-700">
          {data.displayName && rosterSpokenName(data.displayName) !== data.displayName ? (
            <>
              <span aria-hidden="true">{viewerStateText(data.state, rosterVisibleName(data.displayName))}</span>
              <span className="sr-only">{viewerStateText(data.state, rosterSpokenName(data.displayName))}</span>
            </>
          ) : viewerStateText(data.state, data.displayName)}
        </p>
        {data.state !== "minor" && (
          <div className="flex flex-col items-start gap-2 sm:flex-row sm:items-center">
            <button
              ref={mainButton}
              type="button"
              onClick={() => change(mainAction)}
              aria-describedby={CHOICE_ID}
              aria-disabled={busy || undefined}
              className="border border-blue-600 text-blue-600 rounded-xl px-4 py-2 text-sm font-medium transition-colors hover:bg-blue-50 aria-disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
            >
              {rosterButtonLabel(data.state)}
            </button>
            {data.state === "visible_confirmed" && (
              <button
                type="button"
                onClick={() => change("widen")}
                aria-describedby={CHOICE_ID}
                aria-disabled={busy || undefined}
                className="border border-blue-600 text-blue-600 rounded-xl px-4 py-2 text-sm font-medium transition-colors hover:bg-blue-50 aria-disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
              >
                {ROSTER_WIDEN_LABEL}
              </button>
            )}
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
