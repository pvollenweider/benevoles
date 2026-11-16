"use client"

// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { useEffect, useRef, useState } from "react"
import { flushSync } from "react-dom"
import { announce } from "@/lib/announce"
import { personalLimitsLines } from "@/lib/workload-personal"
import { personalFormFrom, personalValuesFromForm, type PersonalFormState } from "@/lib/workload-policy-form"
import type { PersonalField, PersonalLimits } from "@/lib/workload-policy"
import PersonalLimitsFields, { personalInputId } from "@/components/workload/PersonalLimitsFields"

type State = { available: false } | { available: true; event: Record<PersonalField, number>; mine: PersonalLimits | null; organisation: PersonalLimits | null }

const ID = "my-wl"
const focusRing = "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"

/**
 * « Mes limites » on the personal page (#1171, lot 2): the person may ask for limits stricter than
 * the event's, without any reason, and change or remove them; the organisation's own limits for
 * them are shown and stay (the stricter applies). Only while the event's protection is on. Neutral
 * style: nothing is wrong here.
 */
export default function MyWorkloadLimits({ token }: { token: string }) {
  const [state, setState] = useState<State | null>(null)
  const [form, setForm] = useState<PersonalFormState>(() => personalFormFrom(null))
  const [errors, setErrors] = useState<Map<string, string>>(new Map())
  const [error, setError] = useState("")
  const [findings, setFindings] = useState<string[]>([])
  const [status, setStatus] = useState("")
  const [busy, setBusy] = useState(false)
  const saveRef = useRef<HTMLButtonElement>(null)
  const url = `/api/public/registrations/${token}/workload-limits`

  useEffect(() => {
    let live = true
    fetch(url).then((r) => (r.ok ? r.json() : { available: false })).then((s: State) => {
      if (!live) return
      setState(s)
      if (s.available) setForm(personalFormFrom(s.mine))
    }).catch(() => { if (live) setState({ available: false }) })
    return () => { live = false }
  }, [url])

  if (!state) return null
  if (!state.available) {
    // Turned off while the page was open: said in place, never a section that vanishes under focus.
    return status ? <p role="status" tabIndex={-1} className="text-sm text-gray-700">La protection des pauses et de la charge n&apos;est plus active sur cet événement.</p> : null
  }

  async function send(method: "PUT" | "DELETE") {
    if (busy) return
    setBusy(true); setError(""); setFindings([])
    let res: Response | null = null
    try {
      res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: method === "PUT" ? JSON.stringify({ limits: personalValuesFromForm(form) }) : undefined })
    } catch { res = null }
    const data = res ? await res.json().catch(() => ({})) : {}
    setBusy(false)
    if (!res || !res.ok) {
      const problems: { field: string; message: string }[] = Array.isArray(data.problems) ? data.problems : []
      flushSync(() => { setErrors(new Map(problems.map((p) => [p.field, p.message]))); setFindings(Array.isArray(data.workload) ? data.workload : []) })
      const first = problems.find((p) => p.field.startsWith("personal"))
      if (first) document.getElementById(personalInputId(ID, first.field))?.focus()
      announce(setError, typeof data.error === "string" ? data.error : res ? "Tes limites n'ont pas pu être enregistrées. Réessaie." : "La connexion a échoué : rien n'a été enregistré. Réessaie.")
      return
    }
    // « Retirer mes limites » disappears: focus goes to « Enregistrer mes limites ».
    flushSync(() => {
      setState(data as State)
      if ((data as State).available) setForm(personalFormFrom((data as { mine: PersonalLimits | null }).mine))
      setErrors(new Map())
    })
    if (method === "DELETE") saveRef.current?.focus()
    announce(setStatus, method === "DELETE" ? "Tes limites sont retirées : celles de l'événement s'appliquent." : "Tes limites sont enregistrées.")
  }

  return (
    <section aria-labelledby={`${ID}-title`} className="bg-white border border-gray-200 rounded-2xl p-4 text-sm text-gray-800 space-y-3" data-my-workload-limits="1">
      <h2 id={`${ID}-title`} className="text-sm font-semibold text-gray-900">Mes limites</h2>
      <p>
        Tu peux demander moins que l&apos;événement, sans donner de raison : aucune mission ne pourra alors te faire dépasser tes limites. Laisse vide pour garder celle de l&apos;événement.
      </p>
      {state.organisation && (
        <div>
          <p className="font-medium">Fixées par l&apos;organisation (elle seule peut les changer) :</p>
          <ul role="list" className="list-disc pl-5">{personalLimitsLines(state.organisation).map((l) => <li key={l}>{l}</li>)}</ul>
        </div>
      )}
      <form noValidate onSubmit={(e) => { e.preventDefault(); void send("PUT") }} className="space-y-3">
        <PersonalLimitsFields idPrefix={ID} form={form} onChange={(next) => { setForm(next); setErrors(new Map()) }} errors={errors} event={state.event} />
        <div className="flex flex-wrap gap-2">
          <button ref={saveRef} type="submit" aria-disabled={busy || undefined} className={`min-h-11 sm:min-h-6 rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 ${busy ? "opacity-50" : ""} ${focusRing}`}>
            {busy ? "Enregistrement…" : "Enregistrer mes limites"}
          </button>
          {state.mine && (
            <button type="button" onClick={() => void send("DELETE")} aria-disabled={busy || undefined} className={`min-h-11 sm:min-h-6 px-3 py-2 text-sm font-medium text-red-700 hover:text-red-900 ${focusRing}`}>Retirer mes limites</button>
          )}
        </div>
      </form>
      <p role="alert" className={error ? "text-sm text-red-700" : "sr-only"}>{error}</p>
      {findings.length > 0 && (
        <ul role="list" className="list-disc pl-5 space-y-0.5">{findings.map((f) => <li key={f}>{f}</li>)}</ul>
      )}
      <p role="status" className={status ? "text-sm text-green-800" : "sr-only"}>{status}</p>
    </section>
  )
}
