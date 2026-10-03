"use client"

// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { useState } from "react"
import ConfirmActionModal from "../ConfirmActionModal"
import { acceptRequestRecap, refuseRequestRecap } from "@/lib/action-recap"
import { personName, shiftSpoken, type Registration } from "./types"

type Props = {
  /** The request being accepted or refused. */
  reg: Registration
  kind: "accept" | "refuse"
  /** Someone is waiting for this shift: a refusal frees the spot for them. */
  waitlist: boolean
  onCancel: () => void
  /** The decision is recorded; `startedAt` dates the action for the event log link. */
  onDecided: (startedAt: Date) => void
}

// ── Sign-up approval (#484): accept or refuse a request, with an optional message ──
export default function RequestDecisionModal({ reg, kind, waitlist, onCancel, onDecided }: Props) {
  const [decisionNote, setDecisionNote] = useState("")
  const [decisionBusy, setDecisionBusy] = useState(false)
  const [decisionError, setDecisionError] = useState<string | null>(null)

  async function runDecision() {
    if (decisionBusy) return
    const startedAt = new Date()
    setDecisionBusy(true)
    setDecisionError(null)
    let res: Response
    try {
      res = await fetch(`/api/admin/registrations/${reg.id}/decision`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(kind === "refuse" && decisionNote.trim() ? { decision: kind, note: decisionNote } : { decision: kind }),
      })
    } catch {
      setDecisionBusy(false)
      setDecisionError("La connexion a échoué : rien n'a été fait. Réessayez.")
      return
    }
    const data = await res.json().catch(() => null)
    setDecisionBusy(false)
    if (!res.ok) { setDecisionError(data?.error ?? "La décision n'a pas pu être enregistrée."); return }
    onDecided(startedAt)
  }

  return (
    <ConfirmActionModal
      recap={kind === "accept"
        ? acceptRequestRecap({ name: personName(reg), shift: shiftSpoken(reg), hasEmail: !!reg.volunteer.email })
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
    >
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
            className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
          />
          <p id="refusal-note-hint" className="text-xs text-gray-600 mt-1">Ajouté tel quel à l&apos;email. Sans message, l&apos;email ne donne aucune raison.</p>
        </div>
      )}
    </ConfirmActionModal>
  )
}
