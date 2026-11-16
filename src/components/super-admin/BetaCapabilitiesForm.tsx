"use client"

// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { useState } from "react"
import { announce } from "@/lib/announce"
import { NETWORK_ERROR } from "@/lib/use-submit"
import FormStatus from "@/components/FormStatus"

type Capability = { id: string; label: string; description: string; shipped: boolean }

/**
 * « Fonctions bêta » (#1168): the capabilities the operator opens for trial. One native checkbox
 * per capability shipped in this version, saved together; a capability not shipped yet is only
 * named, outside the group, never offered. The result is said once by the status line.
 */
export default function BetaCapabilitiesForm({ capabilities, initialOpen }: { capabilities: Capability[]; initialOpen: string[] }) {
  const [open, setOpen] = useState<string[]>(initialOpen)
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState("")
  const [error, setError] = useState("")
  const shipped = capabilities.filter((c) => c.shipped)
  const notShipped = capabilities.filter((c) => !c.shipped)

  async function save() {
    if (saving) return
    setSaving(true)
    setStatus("")
    setError("")
    try {
      const res = await fetch("/api/super-admin/beta-capabilities", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ open }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok && Array.isArray(data.open)) {
        setOpen(data.open)
        announce(setStatus, "Fonctions ouvertes enregistrées.")
      } else {
        announce(setError, typeof data.error === "string" ? data.error : "Le changement n'a pas pu être enregistré.")
      }
    } catch {
      announce(setError, NETWORK_ERROR)
    }
    setSaving(false)
  }

  return (
    <section aria-labelledby="beta-open-title" className="bg-white border border-gray-200 rounded-2xl p-4 space-y-3">
      <h2 id="beta-open-title" className="text-base font-semibold text-gray-900">Fonctions ouvertes à l&apos;essai</h2>
      <p id="beta-close-note" className="text-sm text-gray-800">
        Une fonction ouverte peut être adoptée par les organisations qui participent à la bêta. Fermer une fonction bloque seulement les nouvelles adoptions : les événements qui l&apos;utilisent déjà la gardent.
      </p>
      {shipped.length > 0 && (
        <fieldset aria-describedby="beta-close-note" className="space-y-2">
          <legend className="text-sm font-medium text-gray-900">Ouvertes aux organisations participantes</legend>
          {shipped.map((c) => (
            <div key={c.id} className="flex items-start gap-3 min-h-6">
              <input
                id={`beta-cap-${c.id}`}
                type="checkbox"
                name="open"
                value={c.id}
                checked={open.includes(c.id)}
                aria-describedby={`beta-cap-${c.id}-desc`}
                onChange={(e) => { setOpen((cur) => (e.target.checked ? [...cur, c.id] : cur.filter((id) => id !== c.id))); setStatus(""); setError("") }}
                className="mt-0.5 h-4 w-4"
              />
              <div>
                <label htmlFor={`beta-cap-${c.id}`} className="text-sm font-medium text-gray-800">{c.label}</label>
                <p id={`beta-cap-${c.id}-desc`} className="text-xs text-gray-600">{c.description}</p>
              </div>
            </div>
          ))}
        </fieldset>
      )}
      {notShipped.length > 0 && (
        <p className="text-sm text-gray-700">Pas encore disponible dans cette version : {notShipped.map((c) => c.label).join(", ")}.</p>
      )}
      {shipped.length > 0 && (
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => void save()}
            aria-disabled={saving || undefined}
            aria-describedby={error ? "beta-open-error" : undefined}
            className="bg-blue-600 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-blue-700 aria-disabled:opacity-50 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
          >
            Enregistrer
          </button>
          {saving && <span className="text-sm text-gray-700">Enregistrement…</span>}
        </div>
      )}
      <FormStatus status={status} error={error} errorId="beta-open-error" />
    </section>
  )
}
