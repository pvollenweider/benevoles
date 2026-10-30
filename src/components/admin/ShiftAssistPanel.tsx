"use client"

// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { startTransition, useEffect, useMemo, useRef, useState } from "react"
import { flushSync } from "react-dom"
import { useRouter } from "next/navigation"
import { announce } from "@/lib/announce"
import { focusFirstAvailable } from "@/lib/focus-return"
import { NETWORK_ERROR } from "@/lib/use-submit"
import {
  ackLabel, committedHoursText, filterCandidates, fitDetail, FIT_LABELS, sortCandidates, SPREAD_SORT_EXPLANATION,
  type AssistSort, type CandidateRow, type FitState,
} from "@/lib/availability-assist"
import { fmtDuration } from "@/lib/signup-recap"

const focusRing = "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"

/**
 * Status pairs of DESIGN.md §2, never colour alone: the badge says the fit in words. No blue pair
 * (the action colour); a transparent border keeps the badge outlined in forced colours.
 */
const FIT_BADGE: Record<FitState, string> = {
  full: "bg-[#dcfce7] text-[#15803d]",
  partial: "bg-[#f3e8ff] text-[#6b21a8]",
  unknown: "bg-[#fef3c7] text-[#92400e]",
  outside: "bg-[#f3f4f6] text-[#374151]",
}

const plural = (n: number, one: string, many: string) => `${n} ${n > 1 ? many : one}`

/** « Nadia Rochat », or « Nadia Rochat (nadia.rochat@example.org) » when another listed person has the same name. */
const spokenName = (row: CandidateRow) => `${row.firstName} ${row.lastName}${row.sameNameHint ? ` (${row.sameNameHint})` : ""}`

/**
 * The per-shift panel « Affecter selon les disponibilités » (#1146, lot B): one card per person,
 * with their availability for the shift, hours already planned, breaks and the workload verdict,
 * and « Ajouter à ce créneau ». The organiser decides; nobody is added without a click, and a
 * person who said they are not available needs the acknowledgement ticked first (owner decision 6).
 * Accessibility review (2026-10-30): cards with h3 under the list's h2; sort as a pressed-button
 * group; acknowledgement validated on click (error tied to the box, focus on it); one polite status
 * region; after an addition, focus on the next card's heading once the list re-rendered.
 */
export default function ShiftAssistPanel({ eventId, shift, rows }: {
  eventId: string
  shift: { id: string; name: string }
  rows: CandidateRow[]
}) {
  const router = useRouter()
  const [sort, setSort] = useState<AssistSort>("name")
  const [fullOnly, setFullOnly] = useState(false)
  const [status, setStatus] = useState("")
  const [acks, setAcks] = useState<Record<string, boolean>>({})
  const [ackErrors, setAckErrors] = useState<Record<string, boolean>>({})
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState<string | null>(null)
  const focusAfter = useRef<number | null>(null)
  // A refusal that re-reads the page: focus stays on that person's button, else their heading.
  const focusRow = useRef<string | null>(null)
  const listHeading = useRef<HTMLHeadingElement>(null)

  const shown = useMemo(() => filterCandidates(sortCandidates(rows, sort), fullOnly), [rows, sort, fullOnly])

  // After an addition the list comes back without that person: focus the card now at its place.
  useEffect(() => {
    const rowId = focusRow.current
    if (rowId) {
      focusRow.current = null
      focusFirstAvailable([() => document.getElementById(`assist-add-${rowId}`), () => document.getElementById(`assist-name-${rowId}`), listHeading.current])
      return
    }
    const index = focusAfter.current
    if (index === null) return
    focusAfter.current = null
    const heading = (i: number) => () => (shown[i] ? document.getElementById(`assist-name-${shown[i].volunteerId}`) : null)
    focusFirstAvailable([heading(index), heading(index - 1), listHeading.current])
  }, [shown])

  function say(count: number) {
    announce(setStatus, count === 0 ? "Aucune personne affichée." : `${plural(count, "personne affichée", "personnes affichées")}.`)
  }
  function chooseSort(next: AssistSort) {
    setSort(next)
    say(shown.length)
  }
  function toggleFullOnly(next: boolean) {
    setFullOnly(next)
    say(filterCandidates(rows, next).length)
  }

  async function add(row: CandidateRow, index: number) {
    if (busy) { announce(setStatus, "Un ajout est en cours : attendez sa réponse."); return }
    const name = spokenName(row)
    if (row.ackKey && !acks[row.volunteerId]) {
      flushSync(() => setAckErrors((e) => ({ ...e, [row.volunteerId]: true })))
      document.getElementById(`assist-ack-${row.volunteerId}`)?.focus()
      return
    }
    setBusy(row.volunteerId)
    setErrors((e) => ({ ...e, [row.volunteerId]: "" }))
    let error: string | null = null
    try {
      const res = await fetch("/api/admin/registrations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventId, volunteerId: row.volunteerId, shiftIds: [shift.id], ...(row.ackKey ? { availabilityAck: [row.ackKey] } : {}) }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        error = typeof data?.error === "string" ? data.error : "L'ajout n'a pas abouti."
        // The answer or the shift changed meanwhile: the page is read again, with the new state.
        if (data?.code === "availability") { focusRow.current = row.volunteerId; startTransition(() => router.refresh()) }
      }
    } catch {
      error = NETWORK_ERROR
    }
    setBusy(null)
    if (error) {
      setErrors((e) => ({ ...e, [row.volunteerId]: error! }))
      return
    }
    announce(setStatus, `${name} est maintenant sur ${shift.name}.`)
    focusAfter.current = index
    startTransition(() => router.refresh())
  }

  const explanationId = "assist-sort-explanation"
  return (
    <section aria-labelledby="assist-list-heading" className="space-y-4">
      <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
        <div>
          <p id="assist-sort-label" className="text-xs font-medium text-gray-700 mb-1">Trier</p>
          <div role="group" aria-labelledby="assist-sort-label" className="flex">
            {([["name", "Par nom"], ["spread", "Pour répartir la charge"]] as const).map(([value, label]) => (
              <button
                key={value}
                type="button"
                aria-pressed={sort === value}
                aria-describedby={value === "spread" && sort === "spread" ? explanationId : undefined}
                onClick={() => chooseSort(value)}
                className={`min-h-11 sm:min-h-9 border border-gray-500 px-3 py-1.5 text-sm font-medium first:rounded-l-xl last:rounded-r-xl -ml-px first:ml-0 ${sort === value ? "bg-blue-50 text-blue-800 border-blue-600 relative z-10" : "bg-white text-gray-800 hover:bg-gray-50"} forced-colors:aria-pressed:bg-[Highlight] ${focusRing} focus-visible:relative focus-visible:z-20`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <label className="flex min-h-11 items-center gap-2 text-sm text-gray-800 cursor-pointer">
          <input type="checkbox" checked={fullOnly} onChange={(e) => toggleFullOnly(e.target.checked)} className="h-5 w-5 accent-blue-600" />
          Disponibles sur tout le créneau seulement
        </label>
      </div>
      {sort === "spread" && <p id={explanationId} className="max-w-[75ch] text-sm text-gray-700">{SPREAD_SORT_EXPLANATION}</p>}
      <p role="status" className={status ? "text-sm text-gray-800" : "sr-only"}>{status}</p>

      <h2 id="assist-list-heading" ref={listHeading} tabIndex={-1} className="text-sm font-semibold text-gray-900 rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600">
        Personnes à affecter ({shown.length})
      </h2>
      {shown.length === 0 ? (
        <p className="text-sm text-gray-700 bg-white border border-gray-200 rounded-xl p-6 text-center">
          {rows.length === 0 ? "Personne à proposer pour ce créneau." : "Personne n'est disponible sur tout le créneau : décochez « Disponibles sur tout le créneau seulement » pour voir tout le monde."}
        </p>
      ) : (
        <ul role="list" className="space-y-3">
          {shown.map((row, index) => (
            <CandidateCard
              key={row.volunteerId}
              row={row}
              busy={busy === row.volunteerId}
              acked={!!acks[row.volunteerId]}
              ackError={!!ackErrors[row.volunteerId]}
              error={errors[row.volunteerId] || null}
              onAck={(v) => { setAcks((a) => ({ ...a, [row.volunteerId]: v })); if (v) setAckErrors((e) => ({ ...e, [row.volunteerId]: false })) }}
              onAdd={() => void add(row, index)}
            />
          ))}
        </ul>
      )}
    </section>
  )
}

function CandidateCard({ row, busy, acked, ackError, error, onAck, onAdd }: {
  row: CandidateRow
  busy: boolean
  acked: boolean
  ackError: boolean
  error: string | null
  onAck: (v: boolean) => void
  onAdd: () => void
}) {
  const id = row.volunteerId
  const name = spokenName(row)
  const detail = fitDetail(row.fit)
  const [firstWorkload, ...otherWorkload] = row.workload
  return (
    <li className="bg-white border border-gray-200 rounded-xl p-4 space-y-2" data-assist-row={id}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h3 id={`assist-name-${id}`} tabIndex={-1} className="text-base font-semibold text-gray-900 rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600">
          {row.firstName} {row.lastName}
          {/* Two people of the same name (#1146, lot B): told apart by their email, inside the heading. */}
          {row.sameNameHint && <><span className="sr-only">, </span><span className="block text-sm font-normal text-gray-700 break-all">{row.sameNameHint}</span></>}
        </h3>
        <span className={`inline-block rounded-full border border-transparent px-2 py-0.5 text-xs font-medium ${FIT_BADGE[row.fit.state]}`}>{FIT_LABELS[row.fit.state]}</span>
      </div>
      {detail && <p id={`assist-detail-${id}`} className="text-sm text-gray-700">{detail}</p>}
      {row.reviewNeeded && <p className="text-sm text-[#92400e]">À revoir : cette réponse vient de la fusion de deux fiches qui avaient répondu différemment.</p>}
      <ul role="list" className="text-sm text-gray-700 space-y-0.5">
        <li>{committedHoursText(row.minutes)}{row.minutes.sameDay > 0 ? `, dont ${fmtDuration(row.minutes.sameDay)} ${row.sameDayLabel}` : ""}.</li>
        {row.backToBack.length > 0 && <li>Enchaîne sans pause avec {row.backToBack.join(", ")}.</li>}
        {row.overlaps.length > 0 && <li>Chevauche {row.overlaps.join(", ")}.</li>}
      </ul>
      {!row.eligible ? (
        <div className="text-sm text-red-800">
          <p><strong className="font-semibold">Ajout impossible :</strong> {firstWorkload}</p>
          {otherWorkload.length > 0 && <ul role="list" className="mt-1 space-y-0.5">{otherWorkload.map((m) => <li key={m}>{m}</li>)}</ul>}
        </div>
      ) : (
        <>
          {row.workload.length > 0 && (
            <div className="text-sm text-amber-950 bg-amber-50 border border-amber-300 rounded-lg px-3 py-2">
              <p className="font-medium">Si vous l&apos;ajoutez, cette personne aura :</p>
              <ul role="list" className="mt-1 space-y-0.5">{row.workload.map((m) => <li key={m}>{m}</li>)}</ul>
              <p className="mt-1">L&apos;ajout reste possible.</p>
            </div>
          )}
          {row.ackKey && (
            <div>
              <label className="flex min-h-11 items-start gap-2 py-1 text-sm text-gray-900 cursor-pointer">
                <input
                  id={`assist-ack-${id}`}
                  type="checkbox"
                  checked={acked}
                  onChange={(e) => onAck(e.target.checked)}
                  aria-invalid={ackError || undefined}
                  aria-describedby={[ackError && `assist-ack-error-${id}`, detail && `assist-detail-${id}`].filter(Boolean).join(" ") || undefined}
                  className="mt-0.5 h-6 w-6 shrink-0 accent-blue-600"
                />
                <span>{ackLabel(row.firstName)}{row.sameNameHint && <span className="sr-only">{` (${row.sameNameHint})`}</span>}</span>
              </label>
              {ackError && <p id={`assist-ack-error-${id}`} className="text-sm text-red-700">Cochez cette case pour ajouter {name} malgré ses disponibilités.</p>}
            </div>
          )}
          <button
            id={`assist-add-${id}`}
            type="button"
            onClick={onAdd}
            aria-disabled={busy || undefined}
            aria-describedby={error ? `assist-error-${id}` : undefined}
            className={`min-h-11 rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 ${busy ? "opacity-60 cursor-wait" : ""} ${focusRing}`}
          >
            {busy ? "Ajout en cours…" : "Ajouter à ce créneau"}{" "}<span className="sr-only">: {name}</span>
          </button>
          {error && <p id={`assist-error-${id}`} role="alert" className="text-sm text-red-700">{error}</p>}
        </>
      )}
    </li>
  )
}
