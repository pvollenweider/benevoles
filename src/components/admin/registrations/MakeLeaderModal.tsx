"use client"

// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { useState, useId } from "react"
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
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    const res = await fetch(`/api/admin/events/${eventId}/sector-leaders`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ roleName, name: volunteerName, email }),
    })
    setSaving(false)
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      setError(typeof data?.error === "string" ? data.error : "Une erreur est survenue.")
      return
    }
    onDone(roleName)
  }

  return (
    <ModalShell title={`Rendre ${volunteerName} responsable`} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
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
            <p className="text-xs text-gray-400 mt-1">{volunteerName} est inscrit·e sur plusieurs postes — choisissez lequel.</p>
          )}
        </div>
        <div>
          <label htmlFor={emailId} className="block text-sm text-gray-700 mb-1">Email *</label>
          <input
            id={emailId}
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm"
          />
          {!volunteerEmail && (
            <p className="text-xs text-amber-600 mt-1">Aucun email enregistré pour ce bénévole — le lien responsable en a besoin.</p>
          )}
        </div>
        {error && (
          <p role="alert" className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
        )}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="text-sm text-gray-600 px-4 py-2 rounded-full hover:bg-gray-50 transition-colors">
            Annuler
          </button>
          <button
            type="submit"
            disabled={saving}
            className="bg-blue-600 text-white px-4 py-2 rounded-full text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {saving ? "Envoi…" : "Rendre responsable"}
          </button>
        </div>
      </form>
    </ModalShell>
  )
}
