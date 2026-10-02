// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import ShiftInfoList from "@/components/ShiftInfoList"
import { REQUEST_SHORT, WAITLIST_SHORT } from "@/lib/waitlist-copy"
import { gapAfter, gapLabel, hasOverlap, personalDataLines, recapShifts, totalLabel, type RecapShiftInput } from "@/lib/signup-recap"
import type { ShiftInfo } from "@/lib/shift-info"
import { workloadMessage, workloadWarnings, type WorkloadShift } from "@/lib/workload"

type Props = {
  shifts: (RecapShiftInput & ShiftInfo)[]
  requirePhone: boolean
  phoneGiven: boolean
  commentGiven: boolean
  /** Labels of the custom questions answered (#483), listed in « Transmis à l'organisation ». */
  answeredQuestions?: string[]
  /** Shifts this volunteer already holds on the event, counted in the workload warnings (#465). */
  heldShifts?: WorkloadShift[]
  timeZone: string
  /** Compact for the sidebar, roomier inside the form card. */
  variant: "card" | "sidebar"
}

/**
 * The recap before « Confirmer mon inscription » (#373): shifts in order with day and hours,
 * what sits between them, waitlist and age flags, and the personal data that will be sent.
 * Pure render; the same component sits in the form card (phone) and the sidebar (desktop).
 */
export default function SignupRecap({ shifts, requirePhone, phoneGiven, commentGiven, answeredQuestions = [], heldShifts = [], timeZone, variant }: Props) {
  const rows = recapShifts(shifts)
  // Waitlist entries may never become shifts: only firm places count (#465).
  const workload = workloadWarnings([...shifts.filter((sh) => !rows.find((r) => r.id === sh.id)?.waitlist), ...heldShifts], timeZone)
  const byId = new Map(shifts.map((s) => [s.id, s]))
  const needsBirthDate = rows.some((r) => r.minAge !== null)
  const overlap = hasOverlap(rows)
  const dense = variant === "sidebar"
  const text = dense ? "text-xs" : "text-sm"

  return (
    <div className={dense ? "" : "space-y-3"}>
      {/* h2 in the sidebar (under the page h1), h3 in the card (under « Tes informations »). */}
      {dense ? (
        <h2 className="px-4 pt-3 pb-1 text-xs font-semibold text-gray-600">Tes créneaux <span className="font-normal">· {totalLabel(rows)}</span></h2>
      ) : (
        <h3 className="text-xs font-semibold text-gray-600">Tes créneaux <span className="font-normal">· {totalLabel(rows)}</span></h3>
      )}
      {overlap && (
        <p className={`${dense ? "mx-4 mb-2" : ""} rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-800`}>
          <strong>Attention :</strong> deux de tes créneaux se chevauchent, retires-en un avant de confirmer.
        </p>
      )}
      {workload.length > 0 && (
        <div className={`${dense ? "mx-4 mb-2" : ""} rounded-lg bg-amber-50 border border-amber-300 px-3 py-2 text-xs text-amber-950`}>
          <p className="font-semibold">Journée chargée</p>
          <ul role="list" className="mt-1 space-y-0.5">
            {workload.map((w) => <li key={`${w.kind}-${w.day}-${w.shiftIds.join()}`}>{workloadMessage(w)}</li>)}
          </ul>
          <p className="mt-1">Ces créneaux restent possibles : tu peux confirmer.</p>
        </div>
      )}
      {/* role="list": Safari/VoiceOver drops list semantics once Tailwind removes the markers. */}
      <ol role="list" className={dense ? "divide-y divide-gray-100" : "space-y-2"}>
        {rows.map((r, i) => {
          const gap = gapAfter(rows, i)
          const label = gap ? gapLabel(gap) : null
          const source = byId.get(r.id)
          return (
            <li key={r.id} className={dense ? "px-4 py-3" : "rounded-lg bg-white border border-gray-200 px-3 py-2"}>
              <p className={`${text} font-medium text-gray-900`}>{r.name}</p>
              <p className="text-xs text-gray-700 mt-0.5">
                {r.dayLabel} · <span className="font-mono">{r.timeLabel}</span>
                {r.endsNextDay && <span className="ml-1 text-gray-800">(fin le lendemain)</span>}
              </p>
              <p className="flex flex-wrap gap-1.5 mt-1">
                <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${r.waitlist || r.request ? "bg-amber-100 text-amber-900" : "bg-green-100 text-green-900"}`}>
                  {r.waitlist ? "Liste d'attente" : r.request ? "Sur validation" : "Place disponible"}
                </span>
                {r.minAge !== null && (
                  <span className="inline-block rounded-full px-2 py-0.5 text-xs font-medium bg-gray-100 text-gray-800">{r.minAge} ans minimum</span>
                )}
              </p>
              {source && <ShiftInfoList info={source} className="mt-1 text-xs text-gray-600" />}
              {label && (
                <p className={`mt-1.5 text-xs ${gap?.kind === "overlap" ? "font-medium text-red-800" : "text-gray-600"}`}>
                  <span aria-hidden="true">↓ </span>{label}
                </p>
              )}
            </li>
          )
        })}
      </ol>
      {rows.some((r) => r.waitlist) && <p className={`${dense ? "px-4 pb-2" : ""} text-xs text-amber-900`}>{WAITLIST_SHORT}</p>}
      {rows.some((r) => r.request) && <p className={`${dense ? "px-4 pb-2" : ""} text-xs text-amber-900`}>{REQUEST_SHORT}</p>}
      <div className={`${dense ? "px-4 py-3 border-t border-gray-100" : "rounded-lg bg-white border border-gray-200 px-3 py-2"}`}>
        <p className="text-xs font-semibold text-gray-600">Transmis à l&apos;organisation</p>
        <p className="text-xs text-gray-700 mt-0.5">
          {personalDataLines({ requirePhone, phoneGiven, needsBirthDate, commentGiven, answeredQuestions }).join(", ")}. Rien d&apos;autre.
        </p>
      </div>
    </div>
  )
}
