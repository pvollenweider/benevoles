"use client"

// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { useEffect, useId, useRef, useState } from "react"
import { flushSync } from "react-dom"
import { useRouter } from "next/navigation"
import ConfirmActionModal from "../ConfirmActionModal"
import { restoreRecap } from "@/lib/action-recap"
import type { RecentCancellation } from "@/lib/registration-restore"
import { AvailabilityAckFields, useAvailabilityAck } from "../AvailabilityAck"
import { OVERRIDE_CONFIRM_LABEL, shiftOverrideOf, shiftOverrideWarning, type ShiftOverrideBody } from "@/lib/shift-override"

/**
 * « Annulations récentes » (#809): a place or a request cancelled by mistake, or from a personal
 * link someone else used, put back with « Rétablir » while the shift hasn't started and the spot
 * is free. The rules are `recentCancellations` and `planRestore` (src/lib/registration-restore.ts).
 */
export default function RecentCancellations({ rows, eventId = "", availability = false }: {
  rows: RecentCancellation[]
  eventId?: string
  /** The event uses dated availability (#1146, lot B): « Rétablir » asks for the acknowledgement when needed. */
  availability?: boolean
}) {
  const router = useRouter()
  const headingRef = useRef<HTMLHeadingElement>(null)
  const checkboxId = useId()
  const [target, setTarget] = useState<RecentCancellation | null>(null)
  const [newLink, setNewLink] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState("")
  // A full or closed shift (AUTHZ-15): known from the page, so the dialog warns from the start; a
  // change meanwhile comes back from the server and the dialog warns again.
  const [override, setOverride] = useState<ShiftOverrideBody["shifts"] | null>(null)
  const [lateWarning, setLateWarning] = useState<{ text: string } | null>(null)
  // The message said just after the focus move: cleared if the section goes first (page reloaded).
  const announceTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => { if (announceTimer.current) clearTimeout(announceTimer.current) }, [])
  const people = target ? [{ volunteerId: target.volunteerId, shiftId: target.shiftId, firstName: target.volunteerName, fullName: target.volunteerName }] : []
  const ack = useAvailabilityAck(eventId, people, availability && !!target, "Rétablir")

  function open(row: RecentCancellation) {
    setStatus("")
    setNewLink(false)
    setError(null)
    setOverride(row.override ? [row.override] : null)
    setLateWarning(null)
    setTarget(row)
  }

  async function restore() {
    if (!target || busy) return
    if (!ack.check()) return
    const availabilityAck = ack.keys()
    setBusy(true)
    setError(null)
    let res: Response
    try {
      res = await fetch(`/api/admin/registrations/${target.id}/restore`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newLink, ...(availabilityAck.length > 0 ? { availabilityAck } : {}), ...(override ? { shiftOverride: override.map((n) => n.key) } : {}) }),
      })
    } catch {
      setBusy(false)
      setError("La connexion a échoué : rien n'a été fait. Réessayez.")
      return
    }
    const data = await res.json().catch(() => null)
    setBusy(false)
    // The answer changed meanwhile (#1146, lot B): the box says it, never the dialog's error too.
    if (res.status === 409 && ack.refused(data)) { setError(null); return }
    const toConfirm = res.status === 409 ? shiftOverrideOf(data) : null
    if (toConfirm) {
      setError(null)
      setOverride(toConfirm)
      setLateWarning({ text: `${shiftOverrideWarning(toConfirm)} Choisissez « ${OVERRIDE_CONFIRM_LABEL.restore} » pour confirmer.` })
      return
    }
    if (!res.ok) { setError(data?.error ?? "L'inscription n'a pas pu être rétablie."); return }
    const done = `Inscription de ${target.volunteerName} rétablie${newLink ? ", avec un nouveau lien personnel" : ""}.`
    // The row leaves the list: the focus goes to the section's heading, not back to a removed button.
    // The message comes just after, so a screen reader doesn't drop it for the focus change.
    flushSync(() => setTarget(null))
    headingRef.current?.focus()
    if (announceTimer.current) clearTimeout(announceTimer.current)
    announceTimer.current = setTimeout(() => setStatus(done), 150)
    router.refresh()
  }

  return (
    <section id="annulations" aria-labelledby="annulations-heading" className="space-y-3 scroll-mt-4">
      <h2 id="annulations-heading" ref={headingRef} tabIndex={-1} className="text-lg font-semibold text-gray-900 focus:outline-none">Annulations récentes</h2>
      <p className="text-sm text-gray-700">
        Une place ou une demande annulée par erreur, ou depuis un lien personnel utilisé par quelqu&apos;un d&apos;autre, peut être rétablie jusqu&apos;au début du créneau. Sur un créneau complet ou fermé, une confirmation est demandée.
      </p>
      <p role="status" className="text-sm font-medium text-green-800">{status}</p>
      {rows.length === 0 ? (
        <p className="text-sm text-gray-700">Aucune annulation à rétablir sur un créneau à venir.</p>
      ) : (
        <ul className="divide-y divide-gray-100 rounded-2xl border border-gray-200 bg-white">
          {rows.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3">
              <div className="min-w-0 text-sm">
                <p className="font-medium text-gray-900 break-words">{r.volunteerName}{r.previousStatus === "requested" ? " (demande)" : ""}</p>
                <p className="text-gray-800 break-words">{r.shift}</p>
                <p className="text-gray-700">{r.cancelled}</p>
              </div>
              {r.blocked ? (
                <p className="text-sm text-gray-700">{r.blocked}</p>
              ) : (
                <button
                  type="button"
                  onClick={() => open(r)}
                  className="min-h-11 rounded-lg border border-blue-700 px-3 py-1.5 text-sm font-medium text-blue-800 hover:bg-blue-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
                >
                  Rétablir{" "}<span className="sr-only">{`l'inscription de ${r.volunteerName}, ${r.shift}`}</span>
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {target && (
        <ConfirmActionModal
          recap={{
            ...restoreRecap({ name: target.volunteerName, shift: target.shift, hasEmail: target.hasEmail, previousStatus: target.previousStatus }),
            ...(override ? { warning: shiftOverrideWarning(override), confirmLabel: OVERRIDE_CONFIRM_LABEL.restore } : {}),
          }}
          lateWarning={lateWarning}
          busy={busy}
          error={error}
          onConfirm={() => void restore()}
          onCancel={() => setTarget(null)}
        >
          {availability && <AvailabilityAckFields prefix={`restore-${target.id}`} people={people} verb="Rétablir" state={ack} />}
          <div className="mt-4 flex items-start gap-2">
            <input
              id={checkboxId}
              type="checkbox"
              checked={newLink}
              onChange={(e) => setNewLink(e.target.checked)}
              aria-describedby={`${checkboxId}-hint`}
              className="mt-0.5 h-5 w-5 flex-shrink-0 accent-blue-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
            />
            <label htmlFor={checkboxId} className="text-sm text-gray-900">Le lien a été utilisé par quelqu&apos;un d&apos;autre : envoyer un nouveau lien</label>
          </div>
          <p id={`${checkboxId}-hint`} className="mt-1 ml-7 text-xs text-gray-700">
            Tous les liens personnels de cette personne pour l&apos;événement sont remplacés : l&apos;ancien n&apos;ouvre plus rien.
            {target.hasEmail ? " Le nouveau part avec l'email." : " Cette personne n'a pas d'adresse : elle ne recevra pas le nouveau lien."}
          </p>
        </ConfirmActionModal>
      )}
    </section>
  )
}
