"use client"

// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { useRef, useState } from "react"
import { fmtRange } from "@/lib/gantt-utils"
import { announce } from "@/lib/announce"
import {
  ROSTER_NOTICE_VERSION, rosterEventHref, type RosterAction, type RosterViewerState, type ShiftRosterEntry,
} from "@/lib/shift-roster"
import {
  ROSTER_COUNT_NOTICE, ROSTER_DOC_LINKS, ROSTER_DOC_TOPIC, ROSTER_EMPTY_TEXT, ROSTER_FAILURE_TEXT, ROSTER_NAME_SWITCH_LABEL,
  ROSTER_NOBODY_TEXT, ROSTER_SEE_OTHERS_LABEL, ROSTER_WIDEN_LABEL, ROSTER_WIDEN_TEXT, rosterChoiceText, rosterDoneText,
  rosterOthersText, rosterSpokenName, rosterStateText, rosterVisibleName,
} from "@/lib/shift-roster-text"
import { RosterName } from "./RosterName"
import Switch from "./Switch"
import DocMoreLink from "@/components/DocMoreLink"

/** What GET /api/public/registrations/[token]/roster answers (#1068). */
export type RosterData =
  | { available: false }
  | { available: true; displayName: string | null; state: RosterViewerState; shifts: ShiftRosterEntry[] }

const CHOICE_ID = "roster-choice"
const WIDEN_ID = "roster-widen"

/** Ends a sentence once (« À confirmer : … l'afficher. » keeps its period). */
const sentence = (text: string) => (text.endsWith(".") ? text : `${text}.`)

/** A printed text and its spoken form, each read once (the printed one hidden from screen readers). */
function Spoken({ printed, spoken }: { printed: string; spoken: string }) {
  if (printed === spoken) return <>{printed}</>
  return (
    <>
      <span aria-hidden="true">{printed}</span>
      <span className="sr-only">{spoken}</span>
    </>
  )
}

/**
 * « Qui est inscrit » (#1068), on the personal page: the viewer's own confirmed shifts, each with
 * the other confirmed volunteers who chose to show their name, then how many others are there
 * without it (a number from the server, nothing else), and a link to the event page where
 * « Voir qui est inscrit » shows every shift. Then the volunteer's own choice: a switch
 * (« Afficher mon nom aux autres bénévoles »), its state always in words next to it, and what it
 * means (rosterChoiceText); turning it on gives the consent under the current text, off withdraws
 * it, and it flips only once the server has stored the choice. A name shown under the first text
 * (confirmed volunteers only) is offered the current one by a button (a one-way action, so not a
 * switch), after which focus moves back to the switch. The page loads the data with its own and
 * renders nothing while the event has no roster. The result is said by the card's status line, a
 * failure by its alert, both mounted from the first render.
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
  const mainSwitch = useRef<HTMLButtonElement>(null)

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
        // The text this card shows (#1068): its audience is the one stored with the choice.
        body: JSON.stringify({ visible, noticeVersion: ROSTER_NOTICE_VERSION }),
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
      // The button unmounts with its state: focus to the switch.
      if (action === "widen") requestAnimationFrame(() => mainSwitch.current?.focus())
    } else {
      announce(setFailure, error ?? ROSTER_FAILURE_TEXT)
    }
  }

  const mine = data.shifts.filter((s) => s.own)
  const shown = data.state === "visible" || data.state === "visible_confirmed"
  const printedName = data.displayName ? rosterVisibleName(data.displayName) : null
  const spokenName = data.displayName ? rosterSpokenName(data.displayName) : null

  return (
    <section id="roster-title-region" aria-labelledby="roster-title" className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
      <h2 id="roster-title" className="text-sm font-semibold text-gray-900">Qui est inscrit</h2>

      {mine.length === 0 && <p className="text-sm text-gray-600">{ROSTER_EMPTY_TEXT}</p>}
      {mine.map((shift) => {
        // Shift dates are calendar days at midnight UTC: read them in UTC, whatever the visitor's zone.
        // Printed short (« jeu. 22 oct. »), spoken whole: « jeu. » alone is read as a word.
        const day = new Date(shift.date)
        const shortDate = day.toLocaleDateString("fr-FR", { timeZone: "UTC", weekday: "short", day: "numeric", month: "short" })
        const longDate = day.toLocaleDateString("fr-FR", { timeZone: "UTC", weekday: "long", day: "numeric", month: "long" })
        // After the list, not a list item: the list's count stays the number of people named.
        const others = rosterOthersText(shift.othersCount, shift.names.length > 0)
        return (
          <div key={shift.shiftId}>
            <h3 className="text-sm text-gray-900 break-words">
              <span className="font-semibold">{shift.label}</span>{" "}
              <span className="text-gray-600">· <Spoken printed={shortDate} spoken={longDate} /> · <span className="whitespace-nowrap">{fmtRange(shift.startTime, shift.endTime)}</span></span>
            </h3>
            {shift.names.length > 0 && (
              <ul role="list" className="mt-1 space-y-0.5 text-sm text-gray-700">
                {shift.names.map((name, i) => <li key={i} className="break-words"><RosterName name={name} /></li>)}
              </ul>
            )}
            {others && <p className={`${shift.names.length > 0 ? "mt-0.5" : "mt-1"} text-sm text-gray-700 break-words`}>{others}</p>}
            {!others && shift.names.length === 0 && <p className="mt-1 text-sm text-gray-700">{ROSTER_NOBODY_TEXT}</p>}
          </div>
        )
      })}

      {eventPageUrl && (
        <p className="text-sm">
          <a href={rosterEventHref(eventPageUrl)} className="font-medium text-blue-700 underline underline-offset-2 hover:text-blue-900 rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600">{ROSTER_SEE_OTHERS_LABEL}</a>
        </p>
      )}

      <div className="border-t border-gray-100 pt-3 space-y-1">
        {data.state === "minor" ? (
          <p id={CHOICE_ID} className="text-sm text-gray-700">{rosterChoiceText("minor", null)}</p>
        ) : (
          <>
            {/* The switch's description, spoken form only: a node referenced by aria-describedby
                is read even hidden, and browse mode never reads it a second time. */}
            <span id={CHOICE_ID} hidden>{`${sentence(rosterStateText(data.state, spokenName))} ${rosterChoiceText(data.state, spokenName)}`}</span>
            {/* The switch, then its state in words beside it (below it on a narrow screen). */}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
              <Switch checked={shown} onToggle={() => change(shown ? "hide" : "show")} describedBy={CHOICE_ID} busy={busy} buttonRef={mainSwitch} data-roster-name-switch>
                {ROSTER_NAME_SWITCH_LABEL}
              </Switch>
              <p className={`flex min-w-0 items-start gap-1.5 text-sm font-medium ${shown ? "text-blue-700" : "text-gray-700"}`}>
                {shown && (
                  <svg aria-hidden="true" viewBox="0 0 20 20" fill="currentColor" className="mt-0.5 h-4 w-4 shrink-0">
                    <path fillRule="evenodd" d="M16.7 5.3a1 1 0 0 1 0 1.4l-8 8a1 1 0 0 1-1.4 0l-4-4a1 1 0 1 1 1.4-1.4L8 12.6l7.3-7.3a1 1 0 0 1 1.4 0Z" clipRule="evenodd" />
                  </svg>
                )}
                <span className="min-w-0 break-words"><Spoken printed={rosterStateText(data.state, printedName)} spoken={rosterStateText(data.state, spokenName)} /></span>
              </p>
              {/* Visible only: the result is said once by the status line below (DESIGN.md). */}
              {busy && <span className="text-sm text-gray-700">Enregistrement…</span>}
            </div>
            <p className="text-xs text-gray-600"><Spoken printed={rosterChoiceText(data.state, printedName)} spoken={rosterChoiceText(data.state, spokenName)} /></p>
            {data.state === "visible_confirmed" && (
              <p className="flex flex-wrap items-center gap-x-3 text-sm text-gray-700">
                <span id={WIDEN_ID}>{ROSTER_WIDEN_TEXT}</span>
                <button
                  type="button"
                  onClick={() => change("widen")}
                  aria-describedby={WIDEN_ID}
                  aria-disabled={busy || undefined}
                  className="min-h-11 rounded-xl px-2 -mx-2 text-sm font-medium text-blue-700 underline underline-offset-2 hover:text-blue-900 aria-disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
                >
                  {ROSTER_WIDEN_LABEL}
                </button>
              </p>
            )}
          </>
        )}
        <p className="text-xs text-gray-600">{ROSTER_COUNT_NOTICE}</p>
        <p className="text-xs"><DocMoreLink href={ROSTER_DOC_LINKS.personal} about={ROSTER_DOC_TOPIC} /></p>
        {/* Always mounted, so that the next text is voiced (announce). */}
        <p role="alert" className={failure ? "text-sm text-red-700" : "sr-only"}>{failure}</p>
        <p role="status" className="sr-only">{status}</p>
      </div>
    </section>
  )
}
