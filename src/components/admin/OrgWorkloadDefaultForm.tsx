"use client"

// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { useRef, useState } from "react"
import { flushSync } from "react-dom"
import { announce } from "@/lib/announce"
import WorkloadPolicyFields, { fieldInputId } from "@/components/admin/WorkloadPolicyFields"
import type { WorkloadPolicyValues } from "@/lib/workload-policy"
import { checkPolicyForm, policyFormFrom, problemsByField, SUGGESTED_LABELS, withWarningSuggestions, type PolicyFormState } from "@/lib/workload-policy-form"

const ID = "org-wl"

/**
 * Breaks and workload protection for the next new events (#1171, beta), Paramètres (owners): the
 * values copied to each new event (never a live inheritance), and whether it starts protected.
 * Existing events never change. Saved with its button, so a checkbox, not a switch.
 */
export default function OrgWorkloadDefaultForm({ initial }: { initial: { enabled: boolean; values: WorkloadPolicyValues } | null }) {
  const [enabled, setEnabled] = useState(initial?.enabled ?? false)
  const [form, setForm] = useState<PolicyFormState>(() => policyFormFrom(initial?.values))
  const [stored, setStored] = useState(initial !== null)
  const [errors, setErrors] = useState<Map<string, string>>(new Map())
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState("")
  const [error, setError] = useState("")
  const submitRef = useRef<HTMLButtonElement>(null)

  async function patch(value: unknown): Promise<{ ok: boolean; data: Record<string, unknown> }> {
    const res = await fetch("/api/admin/settings/organization", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ workloadPolicyDefault: value }) })
    return { ok: res.ok, data: await res.json().catch(() => ({})) }
  }

  async function save() {
    if (saving) return
    setStatus(""); setError("")
    const local = checkPolicyForm(form)
    if (!local.ok) {
      // Committed before the focus moves, so the field is read with its error.
      flushSync(() => setErrors(problemsByField(local.problems)))
      const first = local.problems[0]
      document.getElementById(fieldInputId(ID, first.field))?.focus()
      return
    }
    setSaving(true)
    try {
      const { ok, data } = await patch({ enabled, values: local.values })
      if (ok) {
        setErrors(new Map())
        setStored(true)
        announce(setStatus, enabled ? "Enregistré : les nouveaux événements commenceront protégés, avec ces limites." : "Enregistré : les nouveaux événements recevront ces limites, protection désactivée.")
      } else announce(setError, typeof data.error === "string" ? data.error : "Le paramètre n'a pas pu être enregistré. Réessayez.")
    } catch {
      announce(setError, "Le paramètre n'a pas pu être enregistré. Vérifiez votre connexion, puis réessayez.")
    }
    setSaving(false)
  }

  async function remove() {
    if (saving) return
    setSaving(true)
    setStatus(""); setError("")
    try {
      const { ok, data } = await patch(null)
      if (ok) {
        // « Retirer ces valeurs » disappears: focus goes to « Enregistrer ».
        flushSync(() => {
          setStored(false)
          setEnabled(false)
          setForm(policyFormFrom(null))
          setErrors(new Map())
        })
        submitRef.current?.focus()
        announce(setStatus, "Valeurs retirées : les nouveaux événements commenceront sans protection.")
      } else announce(setError, typeof data.error === "string" ? data.error : "Le paramètre n'a pas pu être enregistré. Réessayez.")
    } catch {
      announce(setError, "Le paramètre n'a pas pu être enregistré. Vérifiez votre connexion, puis réessayez.")
    }
    setSaving(false)
  }

  return (
    <section aria-labelledby="org-wl-title" className="bg-white border border-gray-200 rounded-2xl p-5 space-y-3" data-org-workload-default="1">
      <h2 id="org-wl-title" className="text-sm font-semibold text-gray-800">
        Protection des pauses et de la charge <span className="ml-1 rounded-md bg-gray-100 px-1.5 py-0.5 text-[11px] font-medium text-gray-700">bêta</span>
      </h2>
      <p className="text-xs text-gray-600">Les limites que reçoit chaque nouvel événement, recopiées à sa création : les événements existants ne changent pas. Chaque événement garde ensuite les siennes.</p>
      <form noValidate onSubmit={(e) => { e.preventDefault(); void save() }} className="space-y-3">
        <label htmlFor="org-wl-enabled" className="flex min-h-11 cursor-pointer items-start gap-3">
          <input id="org-wl-enabled" type="checkbox" checked={enabled} onChange={(e) => { setEnabled(e.target.checked); setStatus(""); setError("") }} className="mt-0.5 h-5 w-5 shrink-0" />
          <span className="text-sm font-medium text-gray-700">Activer la protection sur les nouveaux événements</span>
        </label>
        <div>
          <button type="button" onClick={() => { setForm(withWarningSuggestions(form)); announce(setStatus, `Rempli avec les réglages d'avertissement existants : ${SUGGESTED_LABELS.join(", ")}.`) }} aria-describedby="org-wl-suggest-note" className="min-h-11 sm:min-h-6 rounded-xl border border-blue-600 px-3 py-1.5 text-sm font-medium text-blue-700 hover:bg-blue-50">
            Reprendre les réglages d&apos;avertissement existants
          </button>
          <p id="org-wl-suggest-note" className="mt-1 text-xs text-gray-600">Ce sont les seuils des alertes « Charge élevée », ni des seuils légaux ni des recommandations.</p>
        </div>
        <WorkloadPolicyFields idPrefix={ID} form={form} onChange={(next) => { setForm(next); setErrors(new Map()) }} errors={errors} />
        <div className="flex flex-wrap gap-2">
          <button ref={submitRef} type="submit" aria-disabled={saving || undefined} className={`min-h-11 sm:min-h-6 rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 ${saving ? "opacity-50" : ""}`}>
            {saving ? "Enregistrement…" : "Enregistrer"}
          </button>
          {stored && (
            <button type="button" onClick={() => void remove()} aria-disabled={saving || undefined} className={`min-h-11 sm:min-h-6 px-3 py-2 text-sm font-medium text-red-700 hover:text-red-900 ${saving ? "opacity-50" : ""}`}>
              Retirer ces valeurs
            </button>
          )}
        </div>
      </form>
      <p role="status" className={status ? "text-sm text-green-800" : "sr-only"}>{status}</p>
      <p role="alert" className={error ? "text-sm text-red-700" : "sr-only"}>{error}</p>
    </section>
  )
}
