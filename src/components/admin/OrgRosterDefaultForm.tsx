"use client"

// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { useState } from "react"
import { announce } from "@/lib/announce"
import { ROSTER_ORG_DEFAULT_HINT, ROSTER_ORG_DEFAULT_LABEL } from "@/lib/shift-roster-text"

/**
 * « Qui est inscrit » (#1068), Paramètres (owners): the value the organisation's next new events
 * start with. Saved with its button; existing events never change. The result is said by the
 * status line, a failure by the alert, both mounted from the first render.
 */
export default function OrgRosterDefaultForm({ initialValue }: { initialValue: boolean }) {
  const [value, setValue] = useState(initialValue)
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState("")
  const [error, setError] = useState("")

  async function save() {
    if (saving) return
    setSaving(true)
    setStatus("")
    setError("")
    try {
      const res = await fetch("/api/admin/settings/organization", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shiftRosterDefault: value }),
      })
      if (res.ok) announce(setStatus, "Réglage enregistré.")
      else {
        const d = await res.json().catch(() => ({}))
        announce(setError, typeof d.error === "string" ? d.error : "Le réglage n'a pas pu être enregistré. Réessayez.")
      }
    } catch {
      announce(setError, "Le réglage n'a pas pu être enregistré. Vérifiez votre connexion, puis réessayez.")
    }
    setSaving(false)
  }

  return (
    <section aria-labelledby="org-roster-default-title" className="bg-white border border-gray-200 rounded-2xl p-5 space-y-3">
      <h2 id="org-roster-default-title" className="text-sm font-semibold text-gray-800">Qui est inscrit</h2>
      <div className="flex items-start gap-3">
        <input
          id="org-roster-default"
          type="checkbox"
          checked={value}
          aria-describedby="org-roster-default-hint"
          onChange={(e) => { setValue(e.target.checked); setStatus("") }}
          className="mt-0.5 h-4 w-4"
        />
        <div>
          <label htmlFor="org-roster-default" className="text-sm font-medium text-gray-700">{ROSTER_ORG_DEFAULT_LABEL}</label>
          <p id="org-roster-default-hint" className="text-xs text-gray-600">{ROSTER_ORG_DEFAULT_HINT}</p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={save}
          aria-disabled={saving || undefined}
          className="bg-blue-600 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-blue-700 aria-disabled:opacity-50 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
        >
          Enregistrer
        </button>
        {/* Visible only: the result is said once by the status line (DESIGN.md). */}
        {saving && <span className="text-sm text-gray-700">Enregistrement…</span>}
        <p role="status" className={status ? "text-sm text-green-800" : "sr-only"}>{status}</p>
      </div>
      <p role="alert" className={error ? "text-sm text-red-700" : "sr-only"}>{error}</p>
    </section>
  )
}
