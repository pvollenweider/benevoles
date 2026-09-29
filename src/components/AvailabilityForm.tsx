"use client"

// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { useState } from "react"
import AvailabilityFields from "./AvailabilityFields"
import { availabilityLabel, type AvailabilityPeriod } from "@/lib/availability"

type Props = { token: string; initialPeriods: string[]; initialNote: string | null }

/** « Mes disponibilités » on the personal page (#402): saved on demand, told when done. */
export default function AvailabilityForm({ token, initialPeriods, initialNote }: Props) {
  const [periods, setPeriods] = useState<AvailabilityPeriod[]>(initialPeriods as AvailabilityPeriod[])
  const [note, setNote] = useState(initialNote ?? "")
  const [saved, setSaved] = useState({ periods: initialPeriods, note: initialNote ?? "" })
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const dirty = periods.join(",") !== saved.periods.join(",") || note.trim() !== saved.note.trim()

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (saving) return
    setError(null)
    setMessage(null)
    // The button stays usable: pressing it with nothing changed says so instead of doing nothing.
    if (!dirty) { setMessage("Aucune modification à enregistrer."); return }
    setSaving(true)
    try {
      const res = await fetch(`/api/public/registrations/${token}/availability`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ availabilityPeriods: periods, availabilityNote: note.trim() || null }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setError(typeof data?.error === "string" ? data.error : "Enregistrement impossible. Réessaie plus tard."); return }
      setSaved({ periods, note: note.trim() })
      const label = availabilityLabel({ availabilityPeriods: periods, availabilityNote: note })
      setMessage(label ? `Disponibilités enregistrées : ${label}.` : "Disponibilités effacées.")
    } catch {
      setError("Enregistrement impossible. Réessaie plus tard.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={save} className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
      <div>
        <h2 className="text-sm font-semibold text-gray-900">Mes disponibilités</h2>
        <p className="text-xs text-gray-600 mt-0.5">Pour aider l&apos;organisation si elle doit te proposer un autre créneau. Tu choisis toujours tes créneaux toi-même.</p>
      </div>
      <AvailabilityFields periods={periods} note={note} voice="volunteer" onChange={(v) => { setPeriods(v.periods); setNote(v.note) }} />
      <div role="status" aria-live="polite" className={message ? "text-sm text-green-800" : "sr-only"}>{message}</div>
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      <button
        type="submit"
        aria-disabled={saving}
        className="text-sm font-medium px-4 py-2 rounded-lg border border-gray-300 text-gray-800 hover:bg-gray-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
      >
        {saving ? "Enregistrement…" : "Enregistrer mes disponibilités"}
      </button>
    </form>
  )
}
