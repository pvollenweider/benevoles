"use client"

// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { useState } from "react"
import ConfirmActionModal from "../ConfirmActionModal"
import { acceptRequestRecap, refuseRequestRecap } from "@/lib/action-recap"
import { personName, shiftSpoken, type Registration } from "./types"
import { AvailabilityAckFields, useAvailabilityAck } from "../AvailabilityAck"
import { OVERRIDE_CONFIRM_LABEL, shiftOverrideOf, shiftOverrideWarning, type ShiftOverrideBody } from "@/lib/shift-override"

type Props = {
  eventId: string
  /** The request being accepted or refused. */
  reg: Registration
  kind: "accept" | "refuse"
  /** Someone is waiting for this shift: a refusal frees the spot for them. */
  waitlist: boolean
  onCancel: () => void
  /** The decision is recorded; `startedAt` dates the action for the event log link. */
  onDecided: (startedAt: Date) => void
  /**
   * The event uses dated availability (#1146, lot B): accepting asks for the acknowledgement when
   * the person said they are not available at the shift's hours.
   */
  availability?: boolean
}

// ── Sign-up approval (#484): accept or refuse a request, with an optional message ──
export default function RequestDecisionModal({ eventId, reg, kind, waitlist, onCancel, onDecided, availability = false }: Props) {
  const [decisionNote, setDecisionNote] = useState("")
  const [decisionBusy, setDecisionBusy] = useState(false)
  const [decisionError, setDecisionError] = useState<string | null>(null)
  const people = [{ volunteerId: reg.volunteer.id, shiftId: reg.shift.id, firstName: reg.volunteer.firstName, fullName: personName(reg) }]
  const ack = useAvailabilityAck(eventId, people, availability && kind === "accept", "Accepter")
  // A full or closed shift (AUTHZ-15): the server says so; the dialog then warns, and the next
  // confirm sends the confirmation's key.
  const [override, setOverride] = useState<ShiftOverrideBody["shifts"] | null>(null)
  const [overrideWarning, setOverrideWarning] = useState<{ text: string } | null>(null)

  async function runDecision() {
    if (decisionBusy) return
    if (kind === "accept" && !ack.check()) return
    const availabilityAck = kind === "accept" ? ack.keys() : []
    const startedAt = new Date()
    setDecisionBusy(true)
    setDecisionError(null)
    let res: Response
    try {
      res = await fetch(`/api/admin/registrations/${reg.id}/decision`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          decision: kind,
          ...(kind === "refuse" && decisionNote.trim() ? { note: decisionNote } : {}),
          ...(availabilityAck.length > 0 ? { availabilityAck } : {}),
          ...(kind === "accept" && override ? { shiftOverride: override.map((n) => n.key) } : {}),
        }),
      })
    } catch {
      setDecisionBusy(false)
      setDecisionError("La connexion a échoué : rien n'a été fait. Réessayez.")
      return
    }
    const data = await res.json().catch(() => null)
    setDecisionBusy(false)
    // The answer changed meanwhile (#1146, lot B): the box says it, never the dialog's error too.
    if (res.status === 409 && ack.refused(data)) { setDecisionError(null); return }
    const toConfirm = res.status === 409 ? shiftOverrideOf(data) : null
    if (toConfirm) {
      setDecisionError(null)
      setOverride(toConfirm)
      setOverrideWarning({ text: `${shiftOverrideWarning(toConfirm)} Choisissez « ${OVERRIDE_CONFIRM_LABEL.accept} » pour confirmer.` })
      return
    }
    if (!res.ok) { setDecisionError(data?.error ?? "La décision n'a pas pu être enregistrée."); return }
    onDecided(startedAt)
  }

  return (
    <ConfirmActionModal
      recap={kind === "accept"
        ? { ...acceptRequestRecap({ name: personName(reg), shift: shiftSpoken(reg), hasEmail: !!reg.volunteer.email }), ...(override ? { warning: shiftOverrideWarning(override), confirmLabel: OVERRIDE_CONFIRM_LABEL.accept } : {}) }
        : refuseRequestRecap({
          name: personName(reg),
          shift: shiftSpoken(reg),
          hasEmail: !!reg.volunteer.email,
          waitlist,
        })}
      busy={decisionBusy}
      error={decisionError}
      onConfirm={() => void runDecision()}
      onCancel={onCancel}
      lateWarning={overrideWarning}
    >
      {kind === "accept" && availability && <AvailabilityAckFields prefix={`decision-${reg.id}`} people={people} verb="Accepter" state={ack} />}
      {kind === "refuse" && reg.volunteer.email && (
        <div className="mt-4">
          <label htmlFor="refusal-note" className="block text-sm text-gray-800 mb-1">Message à la personne (facultatif)</label>
          <textarea
            id="refusal-note"
            value={decisionNote}
            onChange={(e) => setDecisionNote(e.target.value)}
            maxLength={1000}
            rows={3}
            aria-describedby="refusal-note-hint"
            className="w-full border border-gray-500 rounded-lg px-3 py-1.5 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
          />
          <p id="refusal-note-hint" className="text-xs text-gray-600 mt-1">Ajouté tel quel à l&apos;email. Sans message, l&apos;email ne donne aucune raison.</p>
        </div>
      )}
    </ConfirmActionModal>
  )
}
