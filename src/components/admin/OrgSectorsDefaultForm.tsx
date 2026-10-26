"use client"

// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { useState } from "react"
import { announce } from "@/lib/announce"
import { SECTORS_OPTION_LABEL } from "@/lib/sectors"

/**
 * Sectors for the next new events (#1147, beta), Paramètres (owners), like « Qui est inscrit »
 * (OrgRosterDefaultForm): the value the organisation's next new events start with, saved with its
 * button. Existing events never change. Shown while the organisation can adopt sectors, or while
 * the default is on (so it can be turned off); `available` false says it has no effect for now.
 */
export default function OrgSectorsDefaultForm({ initialValue, available }: { initialValue: boolean; available: boolean }) {
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
        body: JSON.stringify({ sectorsDefault: value }),
      })
      if (res.ok) announce(setStatus, "Paramètre enregistré.")
      else {
        const d = await res.json().catch(() => ({}))
        announce(setError, typeof d.error === "string" ? d.error : "Le paramètre n'a pas pu être enregistré. Réessayez.")
      }
    } catch {
      announce(setError, "Le paramètre n'a pas pu être enregistré. Vérifiez votre connexion, puis réessayez.")
    }
    setSaving(false)
  }

  return (
    <section aria-labelledby="org-sectors-default-title" className="bg-white border border-gray-200 rounded-2xl p-5 space-y-3" data-org-sectors-default="1">
      <h2 id="org-sectors-default-title" className="text-sm font-semibold text-gray-800">
        Secteurs <span className="ml-1 rounded-md bg-gray-100 px-1.5 py-0.5 text-[11px] font-medium text-gray-700">bêta</span>
      </h2>
      <div className="flex items-start gap-3">
        <input
          id="org-sectors-default"
          type="checkbox"
          checked={value}
          aria-describedby="org-sectors-default-hint"
          onChange={(e) => { setValue(e.target.checked); setStatus(""); setError("") }}
          className="mt-0.5 h-4 w-4"
        />
        <div>
          <label htmlFor="org-sectors-default" className="text-sm font-medium text-gray-700">{SECTORS_OPTION_LABEL} pour les nouveaux événements</label>
          <p id="org-sectors-default-hint" className="text-xs text-gray-600">
            Valeur de départ de l&apos;option dans chaque nouvel événement ; vos événements existants ne changent pas. Fonction en bêta.
            {!available && " Sans effet pour le moment : les secteurs ne sont pas ouverts à votre organisation (fonctions bêta)."}
          </p>
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
        {saving && <span className="text-sm text-gray-700">Enregistrement…</span>}
        <p role="status" className={status ? "text-sm text-green-800" : "sr-only"}>{status}</p>
      </div>
      <p role="alert" className={error ? "text-sm text-red-700" : "sr-only"}>{error}</p>
    </section>
  )
}
