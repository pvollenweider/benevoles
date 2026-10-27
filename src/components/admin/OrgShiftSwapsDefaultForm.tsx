"use client"

// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { useState } from "react"
import { announce } from "@/lib/announce"
import { SWAPS_OPTION_LABEL } from "@/lib/shift-swap-text"

/**
 * Shift swaps for the next new events (#1174, beta), Paramètres (owners), like the sectors default
 * (OrgSectorsDefaultForm): the value the organisation's next new events start with, saved with its
 * button. Existing events never change. Shown while the organisation can adopt swaps. The whole
 * label row is the checkbox's target.
 */
export default function OrgShiftSwapsDefaultForm({ initialValue }: { initialValue: boolean }) {
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
        body: JSON.stringify({ shiftSwapsDefault: value }),
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
    <section aria-labelledby="org-swaps-default-title" className="bg-white border border-gray-200 rounded-2xl p-5 space-y-3" data-org-swaps-default="1">
      <h2 id="org-swaps-default-title" className="text-sm font-semibold text-gray-800">
        Échanges de créneaux <span className="ml-1 rounded-md bg-gray-100 px-1.5 py-0.5 text-[11px] font-medium text-gray-700">bêta</span>
      </h2>
      <label htmlFor="org-swaps-default" className="flex min-h-11 cursor-pointer items-start gap-3">
        <input
          id="org-swaps-default"
          type="checkbox"
          checked={value}
          aria-labelledby="org-swaps-default-label"
          aria-describedby="org-swaps-default-hint"
          onChange={(e) => { setValue(e.target.checked); setStatus(""); setError("") }}
          className="mt-0.5 h-5 w-5 shrink-0"
        />
        <span>
          <span id="org-swaps-default-label" className="block text-sm font-medium text-gray-700">{SWAPS_OPTION_LABEL} pour les nouveaux événements</span>
          <span id="org-swaps-default-hint" className="block text-xs text-gray-600">
            Valeur de départ de l&apos;option dans chaque nouvel événement ; vos événements existants ne changent pas. Fonction en bêta.
          </span>
        </span>
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={save}
          aria-disabled={saving || undefined}
          className="bg-blue-600 text-white text-sm font-medium px-4 py-2 min-h-11 rounded-xl hover:bg-blue-700 aria-disabled:opacity-50 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
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
