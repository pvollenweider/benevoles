"use client"

// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { useEffect, useRef, useState } from "react"
import { flushSync } from "react-dom"
import { useRouter } from "next/navigation"
import ConfirmActionModal from "../ConfirmActionModal"
import { deadlineMoment } from "@/lib/cancel-deadline"
import { swapMission, swapWhen } from "@/lib/shift-swap-text"
import type { OrganiserSwap } from "@/lib/shift-swap-data"
import { AvailabilityAckFields, useAvailabilityAck } from "../AvailabilityAck"

/**
 * « Échanges de créneaux » (#1174, beta), on the registrations page: the swaps waiting for the
 * organisers' approval (each person's « cède … / reçoit … » on its own line, the deadline,
 * « Valider l'échange » or « Refuser » with a confirmation, as for a request), then those under way
 * (read only), then the latest ended ones in a disclosure. After a decision the dialog closes,
 * focus goes to the section's heading, the result is said just after and the page reloads.
 */

const STATE: Record<string, string> = {
  open: "En attente d'une proposition",
  offered: "Proposition en attente de réponse",
  approval: "À valider",
  applied: "Échange effectué",
  withdrawn: "Retiré par un bénévole",
  refused: "Refusé par l'organisation",
  expired: "Expiré",
  impossible: "Devenu impossible",
  cancelled: "Annulé (échanges désactivés)",
}

function Person({ name, gives, receives }: { name: string; gives: OrganiserSwap["requester"]["shift"]; receives?: OrganiserSwap["requester"]["shift"] }) {
  return (
    <p className="break-words text-sm text-gray-800">
      <span className="font-medium text-gray-900">{name}</span> : cède {swapMission(gives)}, {swapWhen(gives)}
      {receives && <>, reçoit {swapMission(receives)}, {swapWhen(receives)}</>}
    </p>
  )
}

export default function ShiftSwapsPanel({ eventId, requests, timeZone, availability = false }: {
  eventId: string
  requests: OrganiserSwap[]
  timeZone: string
  /** The event uses dated availability (#1146, lot B): validating asks for the acknowledgement when a person said they are not available for the shift they receive. */
  availability?: boolean
}) {
  const router = useRouter()
  const headingRef = useRef<HTMLHeadingElement>(null)
  const [target, setTarget] = useState<{ swap: OrganiserSwap; approve: boolean } | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState("")
  const [conflict, setConflict] = useState("")
  // The result said just after the focus move: cleared if the panel goes first (page reloaded).
  const announceTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => { if (announceTimer.current) clearTimeout(announceTimer.current) }, [])
  // Each person and the shift they would receive.
  const swapPeople = (r: OrganiserSwap) => (r.counterpart
    ? [
      { volunteerId: r.requester.volunteerId, shiftId: r.counterpart.shift.id, firstName: r.requester.name, fullName: r.requester.name },
      { volunteerId: r.counterpart.volunteerId, shiftId: r.requester.shift.id, firstName: r.counterpart.name, fullName: r.counterpart.name },
    ]
    : [])
  const people = target?.approve ? swapPeople(target.swap) : []
  const ack = useAvailabilityAck(eventId, people, availability && !!target?.approve && people.length > 0, "Valider")

  const toApprove = requests.filter((r) => r.status === "approval")
  const underway = requests.filter((r) => r.status === "open" || r.status === "offered")
  const ended = requests.filter((r) => !["open", "offered", "approval"].includes(r.status))

  async function decide() {
    if (!target || busy) return
    if (target.approve && !ack.check()) return
    const availabilityAck = target.approve ? ack.keys() : []
    setBusy(true)
    setError(null)
    let res: Response
    try {
      res = await fetch(`/api/admin/events/${eventId}/swaps/${target.swap.requestId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ approve: target.approve, revision: target.swap.revision, ...(availabilityAck.length > 0 ? { availabilityAck } : {}) }),
      })
    } catch {
      setBusy(false)
      setError("La connexion a échoué : rien n'a été fait. Réessayez.")
      return
    }
    const data = await res.json().catch(() => null)
    setBusy(false)
    // A received shift outside declared availability (#1146, lot B): the request still waits, the
    // dialog stays open with the box to tick, never the dialog's error too.
    if (res.status === 409 && ack.refused(data)) { setError(null); return }
    const names = `${target.swap.requester.name} et ${target.swap.counterpart?.name ?? "l'autre bénévole"}`
    const done = res.ok
      ? (data?.status === "applied" ? `Échange validé et effectué entre ${names}. Ils sont prévenus par email.` : `Échange refusé entre ${names}. Ils sont prévenus par email.`)
      : (data?.error ?? "L'échange n'a pas pu être traité.")
    if (!res.ok && res.status !== 409) { setError(done); return }
    // The item leaves the list (applied, refused, or settled meanwhile: a conflict): focus to the
    // heading, the message just after (an alert for a conflict, never as a success), then reload.
    flushSync(() => setTarget(null))
    headingRef.current?.focus()
    if (announceTimer.current) clearTimeout(announceTimer.current)
    announceTimer.current = setTimeout(() => (res.ok ? setStatus(done) : setConflict(done)), 150)
    router.refresh()
  }

  const nameSuffix = (r: OrganiserSwap) => <span className="sr-only">, {r.requester.name} et {r.counterpart?.name ?? "l'autre bénévole"}</span>

  return (
    <section id="echanges" aria-labelledby="echanges-heading" className="space-y-3 scroll-mt-4" data-swaps-panel="1">
      <h2 id="echanges-heading" ref={headingRef} tabIndex={-1} className="text-lg font-semibold text-gray-900 focus:outline-none">
        Échanges de créneaux <span className="ml-1 rounded-md bg-gray-100 px-1.5 py-0.5 text-xs font-medium text-gray-700">bêta</span>
      </h2>
      <p className="text-sm text-gray-700">Deux bénévoles confirmés sur le même poste, ou sur deux postes du même secteur, peuvent échanger leurs créneaux. Un échange qui touche un créneau sur validation, ou tous si l&apos;événement le demande, attend ici votre accord : rien ne change avant.</p>
      <p role="status" className="text-sm font-medium text-green-800">{status}</p>
      <p role="alert" className={conflict ? "text-sm text-red-800" : "sr-only"}>{conflict}</p>

      <h3 className="text-sm font-semibold text-gray-900">À valider</h3>
      {toApprove.length === 0 ? (
        <p className="text-sm text-gray-700">Aucun échange n&apos;attend votre validation.</p>
      ) : (
        <ul role="list" className="divide-y divide-gray-100 rounded-2xl border border-gray-200 bg-white">
          {toApprove.map((r) => (
            <li key={r.requestId} className="space-y-2 px-4 py-3">
              <Person name={r.requester.name} gives={r.requester.shift} receives={r.counterpart?.shift} />
              {r.counterpart && <Person name={r.counterpart.name} gives={r.counterpart.shift} receives={r.requester.shift} />}
              <p className="text-sm text-gray-700">À valider avant le {deadlineMoment(new Date(r.deadline), timeZone)}.</p>
              <div className="flex flex-col gap-2 sm:flex-row">
                <button type="button" onClick={() => { setError(null); setStatus(""); setConflict(""); setTarget({ swap: r, approve: true }) }}
                  className="min-h-11 rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600">
                  Valider l&apos;échange{nameSuffix(r)}
                </button>
                <button type="button" onClick={() => { setError(null); setStatus(""); setConflict(""); setTarget({ swap: r, approve: false }) }}
                  className="min-h-11 rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-800 hover:bg-gray-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600">
                  Refuser{nameSuffix(r)}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <h3 className="text-sm font-semibold text-gray-900">En cours</h3>
      {underway.length === 0 ? (
        <p className="text-sm text-gray-700">Aucune demande d&apos;échange en cours.</p>
      ) : (
        <ul role="list" className="divide-y divide-gray-100 rounded-2xl border border-gray-200 bg-white">
          {underway.map((r) => (
            <li key={r.requestId} className="space-y-1 px-4 py-3">
              <p className="text-xs font-medium text-gray-700">{STATE[r.status]}</p>
              <Person name={r.requester.name} gives={r.requester.shift} receives={r.counterpart?.shift} />
              {r.counterpart && <Person name={r.counterpart.name} gives={r.counterpart.shift} receives={r.requester.shift} />}
            </li>
          ))}
        </ul>
      )}

      {ended.length > 0 && (
        <details className="rounded-2xl border border-gray-200 bg-white">
          <summary className="flex min-h-11 cursor-pointer items-center px-4 text-sm font-medium text-gray-900 rounded-2xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600">
            Terminés récemment ({ended.length})
          </summary>
          <ul role="list" className="divide-y divide-gray-100 border-t border-gray-100">
            {ended.map((r) => (
              <li key={r.requestId} className="space-y-1 px-4 py-3">
                <p className="text-xs font-medium text-gray-700">{STATE[r.status]}{r.endMessage ? ` : ${r.endMessage}` : ""}</p>
                <Person name={r.requester.name} gives={r.requester.shift} receives={r.counterpart?.shift} />
                {r.counterpart && <Person name={r.counterpart.name} gives={r.counterpart.shift} receives={r.requester.shift} />}
              </li>
            ))}
          </ul>
        </details>
      )}

      {target && (
        <ConfirmActionModal
          recap={{
            title: target.approve ? "Valider cet échange ?" : "Refuser cet échange ?",
            lead: target.approve
              ? "Toutes les règles d'inscription sont vérifiées à nouveau, puis les deux créneaux sont échangés."
              : "Les deux personnes gardent leur créneau.",
            lines: [
              `${target.swap.requester.name} cède ${swapMission(target.swap.requester.shift)}, ${swapWhen(target.swap.requester.shift)}.`,
              ...(target.swap.counterpart ? [`${target.swap.counterpart.name} cède ${swapMission(target.swap.counterpart.shift)}, ${swapWhen(target.swap.counterpart.shift)}.`] : []),
              "Les deux personnes sont prévenues par email.",
              "L'action est journalisée : vous la retrouverez dans le journal de l'événement.",
            ],
            confirmLabel: target.approve ? "Valider l'échange" : "Refuser l'échange",
            danger: !target.approve,
          }}
          busy={busy}
          error={error}
          onConfirm={() => void decide()}
          onCancel={() => setTarget(null)}
        >
          {target.approve && availability && people.length > 0 && <AvailabilityAckFields prefix={`swap-${target.swap.requestId}`} people={people} verb="Valider" state={ack} />}
        </ConfirmActionModal>
      )}
    </section>
  )
}
