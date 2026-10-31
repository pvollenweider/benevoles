"use client"

// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { useEffect, useState } from "react"
import { flushSync } from "react-dom"
import { announce } from "@/lib/announce"
import { ackLabel, type FitState } from "@/lib/availability-assist"
import { de } from "@/lib/french-elision"
import type { PersonFit } from "@/lib/availability-assist-data"

/**
 * The availability acknowledgement inside an organiser's confirmation dialog (#1146, lot B):
 * accepting a request, « Rétablir », validating a swap. When the dialog opens, each person's fit for
 * the shift they would hold is read (GET …/availability/fit); a person who said they are not
 * available then needs the box ticked before the action (owner decision 6). The server checks it
 * again under its locks and answers 409 « availability » when the answer changed meanwhile: the
 * dialog then shows the server's fit, and the box must be ticked again.
 *
 * Accessibility review (2026-10-30): the fit line is in the dialog's reading order and describes its
 * box; when a box is needed, one polite status region says so (the dialog's description was read
 * before the fit arrived, focus stays on Annuler); the box's error is tied to it (aria-invalid,
 * described by error then fit), never an alert, and focus moves to the first missing box.
 */

export type AckVerb = "Accepter" | "Rétablir" | "Valider"

/** One person in the dialog, and the shift they would hold after the action. */
export type AckPerson = { volunteerId: string; shiftId: string; firstName: string; fullName: string }

/** A 409 « availability » refusal's item, as the routes send it. */
export type AckRefusalItem = { volunteerId?: string; shiftId: string; key: string; state: FitState; label: string; detail: string }

const rowOf = (p: { volunteerId?: string; shiftId: string }) => `${p.volunteerId ?? ""}|${p.shiftId}`

const ACTION: Record<AckVerb, string> = { Accepter: "accepter la demande", Rétablir: "rétablir l'inscription", Valider: "valider l'échange" }
const BEFORE: Record<AckVerb, string> = { Accepter: "avant d'accepter la demande", Rétablir: "avant de rétablir l'inscription", Valider: "avant de valider l'échange" }

/**
 * The fits of the people in the dialog, read once it opens; `served` overrides them with what the
 * server sent in a refusal. An answer for other people or shifts (the dialog changed) is dropped.
 */
export function useAvailabilityAck(eventId: string, people: AckPerson[], enabled: boolean, verb: AckVerb) {
  const query = enabled ? people.map(rowOf).join(",") : ""
  const [fetched, setFetched] = useState<{ query: string; fits: Record<string, PersonFit> } | null>(null)
  const [served, setServed] = useState<{ query: string; fits: Record<string, PersonFit> } | null>(null)
  const [acked, setAcked] = useState<Set<string>>(new Set())
  const [errors, setErrors] = useState<Record<string, "missing" | "changed">>({})
  const [status, setStatus] = useState("")
  // The dialog closed (or now concerns other people or shifts): nothing ticked or marked carries
  // over to the next opening (independent review, P3); keys already bind a tick to its answer.
  const [seenQuery, setSeenQuery] = useState(query)
  if (seenQuery !== query) {
    setSeenQuery(query)
    setAcked(new Set())
    setErrors({})
    setServed(null)
  }

  useEffect(() => {
    if (!query) return
    let current = true
    Promise.all(people.map((p) =>
      fetch(`/api/admin/events/${eventId}/availability/fit?${new URLSearchParams({ volunteerId: p.volunteerId, shiftId: p.shiftId })}`)
        .then((res) => (res.ok ? res.json() : null))
        .catch(() => null)
        .then((data: { inUse: boolean; fits: PersonFit[] } | null) => [rowOf(p), data?.fits?.find((f) => f.shiftId === p.shiftId) ?? null] as const),
    )).then((rows) => {
      if (!current) return
      const fits = Object.fromEntries(rows.filter((r): r is readonly [string, PersonFit] => r[1] !== null))
      setFetched({ query, fits })
      const needed = people.filter((p) => fits[rowOf(p)]?.ackKey)
      if (needed.length > 0) {
        announce(setStatus, `${needed.map((p) => `${p.fullName} : ${fits[rowOf(p)].label.toLowerCase()}`).join(" ; ")}. Une confirmation est demandée ${BEFORE[verb]}.`)
      }
    })
    return () => { current = false }
    // The read depends on the people and shifts only (`people` is rebuilt on each render).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, eventId])

  const fits: Record<string, PersonFit> = {
    ...(fetched && fetched.query === query ? fetched.fits : {}),
    ...(served && served.query === query ? served.fits : {}),
  }
  const loading = query !== "" && fetched?.query !== query

  function toggle(key: string, row: string, on: boolean) {
    setAcked((a) => { const next = new Set(a); if (on) next.add(key); else next.delete(key); return next })
    if (on) setErrors((e) => { const next = { ...e }; delete next[row]; return next })
  }

  const focusRow = (row: string) => document.querySelector<HTMLInputElement>(`input[data-ack-row="${CSS.escape(row)}"]`)?.focus()

  /** Before sending: true when every needed box is ticked; otherwise marks and focuses the first. */
  function check(): boolean {
    const missing = people.map(rowOf).filter((row) => fits[row]?.ackKey && !acked.has(fits[row].ackKey!))
    if (missing.length === 0) return true
    flushSync(() => setErrors(Object.fromEntries(missing.map((row) => [row, "missing" as const]))))
    focusRow(missing[0])
    return false
  }

  /** The keys to send: the boxes ticked for the fits shown now. */
  const keys = () => people.map((p) => fits[rowOf(p)]?.ackKey).filter((k): k is string => !!k && acked.has(k))

  /**
   * A 409 « availability »: the server's fits replace ours; a box whose key changed is unticked
   * (its key is no longer in `acked`) and says why. Returns false when the body is not one.
   */
  function refused(data: unknown): boolean {
    const body = data as { code?: unknown; outside?: unknown } | null
    if (body?.code !== "availability" || !Array.isArray(body.outside)) return false
    const items = body.outside as AckRefusalItem[]
    const single = people.length === 1 ? people[0] : null
    const next: Record<string, PersonFit> = {}
    const marks: Record<string, "missing" | "changed"> = {}
    for (const o of items) {
      const row = rowOf({ volunteerId: o.volunteerId ?? single?.volunteerId, shiftId: o.shiftId })
      next[row] = { shiftId: o.shiftId, state: o.state, label: o.label, detail: o.detail, ackKey: o.key }
      // « changed » only when a different key was shown: a fit never read (still loading, failed) is just missing.
      marks[row] = !fits[row]?.ackKey || fits[row].ackKey === o.key ? "missing" : "changed"
    }
    flushSync(() => {
      setServed({ query, fits: { ...(served?.query === query ? served.fits : {}), ...next } })
      setErrors(marks)
    })
    const first = people.map(rowOf).find((row) => marks[row])
    if (first) focusRow(first)
    return true
  }

  return { fits, loading, acked, errors, status, toggle, check, keys, refused }
}

/**
 * Each person's fit line and, when they said they are not available then, the box. `prefix` keeps
 * ids unique per dialog. With two people (a swap) each line names the person and « le créneau
 * reçu ».
 */
export function AvailabilityAckFields({ prefix, people, verb, state }: {
  prefix: string
  people: AckPerson[]
  verb: AckVerb
  state: ReturnType<typeof useAvailabilityAck>
}) {
  const many = people.length > 1
  return (
    <div className="mt-4 space-y-3">
      {/* Always mounted, empty until a box is needed: the arrival of the fit is said once. */}
      <p role="status" className="sr-only">{state.status}</p>
      {people.map((p, n) => {
        const row = rowOf(p)
        const fit = state.fits[row]
        const fitId = `${prefix}-fit-${n}`
        const errorId = `${prefix}-ack-error-${n}`
        const error = state.errors[row]
        const who = many ? ` par ${p.fullName} pour le créneau reçu` : ""
        if (!fit) {
          // A failed read shows that it was not checked; the server checks again anyway.
          return <p key={row} id={fitId} className="text-sm text-gray-700">{state.loading ? `Vérification des disponibilités${many ? ` ${de(p.fullName)}` : ""}…` : `Disponibilités${many ? ` ${de(p.fullName)}` : ""} non vérifiées : elles le sont à la confirmation.`}</p>
        }
        const key = fit.ackKey
        return (
          <div key={row}>
            <p id={fitId} className="text-sm text-gray-700">Disponibilités indiquées{who} : <span className="font-medium text-gray-900">{fit.label}.</span>{fit.detail ? ` ${fit.detail}` : ""}</p>
            {key && (
              <>
                <label className="mt-1 flex min-h-11 items-start gap-2 py-1 text-sm text-gray-900 cursor-pointer">
                  <input
                    id={`${prefix}-ack-${n}`}
                    data-ack-row={row}
                    type="checkbox"
                    checked={state.acked.has(key)}
                    onChange={(e) => state.toggle(key, row, e.target.checked)}
                    aria-invalid={error ? true : undefined}
                    aria-describedby={[error && errorId, fitId].filter(Boolean).join(" ")}
                    className="mt-0.5 h-6 w-6 shrink-0 accent-blue-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
                  />
                  <span>{ackLabel(many ? p.fullName : p.firstName, verb)}</span>
                </label>
                {error && (
                  <p id={errorId} className="text-sm text-red-700">
                    {error === "changed" ? `Les disponibilités ${de(p.fullName)} ont changé entre-temps. ` : ""}Cochez cette case pour {ACTION[verb]} malgré ses disponibilités : rien n&apos;a encore été fait.
                  </p>
                )}
              </>
            )}
          </div>
        )
      })}
    </div>
  )
}
