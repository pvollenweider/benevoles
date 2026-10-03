"use client"

// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { useState, useId } from "react"
import FormStatus from "@/components/FormStatus"
import { useSubmit } from "@/lib/use-submit"
import ModalShell from "../ModalShell"

// ── "Rendre responsable" modal ───────────────────────────────────────────────
export default function MakeLeaderModal({
  eventId, volunteerName, volunteerEmail, roleOptions, defaultRole, onClose, onDone,
}: {
  eventId: string
  volunteerName: string
  volunteerEmail: string | null
  roleOptions: string[]
  defaultRole: string
  onClose: () => void
  onDone: (roleName: string) => void
}) {
  const roleId = useId()
  const emailId = useId()
  const [roleName, setRoleName] = useState(defaultRole)
  const [email, setEmail] = useState(volunteerEmail ?? "")
  const { submit: run, busy: saving, error, fail, isInvalid } = useSubmit()

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) { fail("Indiquez une adresse email complète.", "email", document.getElementById(emailId)); return }
    const outcome = await run(() => fetch(`/api/admin/events/${eventId}/sector-leaders`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ roleName, name: volunteerName, email: email.trim() }),
    }), { silent: true })
    if (!outcome.ok) { const onEmail = outcome.status === 400 || outcome.status === 409; fail(outcome.error, onEmail ? "email" : undefined, onEmail ? document.getElementById(emailId) : null); return }
    onDone(roleName)
  }

  return (
    <ModalShell title={`Rendre ${volunteerName} responsable`} busy={saving} onClose={() => { if (!saving) onClose() }}>
      <form onSubmit={submit} noValidate className="space-y-4">
        <div>
          <label htmlFor={roleId} className="block text-sm text-gray-700 mb-1">Poste</label>
          {roleOptions.length > 1 ? (
            <select
              id={roleId}
              value={roleName}
              onChange={(e) => setRoleName(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm bg-white"
            >
              {roleOptions.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          ) : (
            <input id={roleId} type="text" value={roleName} readOnly className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm bg-gray-50 text-gray-700" />
          )}
          {roleOptions.length > 1 && (
            <p className="text-xs text-gray-600 mt-1">{volunteerName} est inscrit·e sur plusieurs postes — choisissez lequel.</p>
          )}
        </div>
        <div>
          <label htmlFor={emailId} className="block text-sm text-gray-700 mb-1">Email *</label>
          <input
            id={emailId}
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            aria-invalid={isInvalid("email")}
            aria-describedby={isInvalid("email") ? `${emailId}-error` : undefined}
            autoComplete="off"
            className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
          />
          {!volunteerEmail && (
            <p className="text-xs text-amber-800 mt-1">Aucun email enregistré pour ce bénévole — le lien responsable en a besoin.</p>
          )}
        </div>
        <FormStatus error={error} errorId={`${emailId}-error`} />
        <div className="flex justify-end gap-2">
          <button type="button" onClick={() => { if (!saving) onClose() }} aria-disabled={saving || undefined} className="text-sm text-gray-600 px-4 py-2 rounded-full hover:bg-gray-50 transition-colors">
            Annuler
          </button>
          <button
            type="submit"
            aria-disabled={saving || undefined}
            className="bg-blue-600 text-white px-4 py-2 rounded-full text-sm font-medium hover:bg-blue-700 aria-disabled:opacity-80 aria-disabled:cursor-wait transition-colors"
          >
            {saving ? "Envoi…" : "Rendre responsable"}
          </button>
        </div>
      </form>
    </ModalShell>
  )
}
