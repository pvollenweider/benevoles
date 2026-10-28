"use client"

// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { useRef, useState } from "react"
import { flushSync } from "react-dom"
import { announce } from "@/lib/announce"
import ConfirmActionModal from "@/components/admin/ConfirmActionModal"
import WorkloadBenchmarks from "@/components/admin/WorkloadBenchmarks"
import WorkloadPolicyFields, { fieldInputId } from "@/components/admin/WorkloadPolicyFields"
import type { EventHorizon, WorkloadBenchmark, WorkloadPolicyValues } from "@/lib/workload-policy"
import {
  benchmarkAnnouncement, benchmarkFields, checkPolicyForm, policyFormFrom, policySummaryLines, policyValuesFromForm, problemsByField, SUGGESTED_LABELS,
  withBenchmark, withWarningSuggestions, WORKLOAD_NOT_COVERED, type PolicyFormState,
} from "@/lib/workload-policy-form"

type PersonFindings = { volunteerId: string; name: string; messages: string[] }

const ID = "event-wl"

/**
 * « Protection des pauses et de la charge » (#1171, beta), on the event's information page, like
 * the swaps card: its own route, apart from the autosaved event form. Every value is the
 * organiser's (empty = à compléter); the existing #465 warning settings can be filled in as
 * editable suggestions. The worked examples and the summary follow the fields (not live). « Aperçu »
 * judges the current programmes without saving; turning on or tightening is refused while one breaks
 * the limits, the people listed. Turning off asks first.
 */
export default function EventWorkloadPolicyCard({ eventId, initialEnabled, initialValues, initialIncomplete, initialFindings, timeZone, horizon }: {
  eventId: string
  initialEnabled: boolean
  initialValues: WorkloadPolicyValues | null
  /** Enabled with a stored policy that does not read: nothing new is accepted. */
  initialIncomplete: boolean
  initialFindings: PersonFindings[]
  timeZone: string
  /** The event's service days when the page was loaded (the days-off example). */
  horizon: EventHorizon
}) {
  const [enabled, setEnabled] = useState(initialEnabled)
  const [incomplete, setIncomplete] = useState(initialIncomplete)
  const [form, setForm] = useState<PolicyFormState>(() => policyFormFrom(initialValues))
  const [errors, setErrors] = useState<Map<string, string>>(new Map())
  const [busy, setBusy] = useState<"preview" | "save" | "off" | null>(null)
  const [status, setStatus] = useState("")
  const [error, setError] = useState("")
  // The people listed under the last answer: the current findings, a preview's, or a refusal's.
  const [people, setPeople] = useState<{ title: string; list: PersonFindings[] } | null>(
    initialFindings.length > 0 ? { title: "Programmes qui dépassent les limites aujourd'hui", list: initialFindings } : null,
  )
  const [confirmOff, setConfirmOff] = useState(false)
  const [offError, setOffError] = useState<string | null>(null)
  const submitRef = useRef<HTMLButtonElement>(null)

  const checked = checkPolicyForm(form)
  const summary = checked.ok ? policySummaryLines(checked.values) : []

  function change(next: PolicyFormState) {
    setForm(next)
    // A field typed again is no longer flagged until the next check.
    if (errors.size > 0) {
      const again = new Map(errors)
      if (next.serviceDayStart !== form.serviceDayStart) again.delete("serviceDayStart")
      for (const key of Object.keys(next) as (keyof PolicyFormState)[]) if (key !== "serviceDayStart" && key !== "offDay" && next[key] !== form[key]) again.delete(key)
      if (next.offDay.apply !== form.offDay.apply) again.delete("offDay")
      if (next.offDay.apply !== form.offDay.apply || next.offDay.minOffDays !== form.offDay.minOffDays || next.offDay.windowDays !== form.offDay.windowDays) {
        again.delete("offDayMinOffDays")
        again.delete("offDayWindowDays")
      }
      setErrors(again)
    }
  }

  /** Shows the problems under their fields and focuses the first one; true when there were none. */
  function showProblems(problems: { field: string; message: string }[]): boolean {
    if (problems.length === 0) return true
    const byField = problemsByField(problems as Parameters<typeof problemsByField>[0])
    // Committed before the focus moves, so the field is read with its error.
    flushSync(() => setErrors(new Map(byField)))
    const first = problems.find((p) => p.field !== "version" && p.field !== "timeZone")
    if (first) document.getElementById(fieldInputId(ID, first.field))?.focus()
    else announce(setError, problems[0].message)
    return false
  }

  function fillSuggestions() {
    setForm(withWarningSuggestions(form))
    announce(setStatus, `Rempli avec les réglages d'avertissement existants : ${SUGGESTED_LABELS.join(", ")}. Vérifiez-les et complétez les autres.`)
  }

  function applyBenchmark(b: WorkloadBenchmark) {
    setForm(withBenchmark(form, b))
    if (errors.size > 0) {
      const again = new Map(errors)
      for (const key of benchmarkFields(b)) again.delete(key)
      setErrors(again)
    }
    announce(setStatus, benchmarkAnnouncement(b))
  }

  async function send(path: string, method: string, body: unknown) {
    const res = await fetch(path, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
    const data = await res.json().catch(() => ({}))
    return { res, data }
  }

  async function preview() {
    if (busy) return
    setStatus(""); setError("")
    const local = checkPolicyForm(form)
    if (!local.ok) { showProblems(local.problems); return }
    setBusy("preview")
    try {
      const { res, data } = await send(`/api/admin/events/${eventId}/workload-policy/preview`, "POST", { values: local.values })
      setBusy(null)
      if (!res.ok) {
        if (Array.isArray(data.problems) && !showProblems(data.problems)) return
        announce(setError, typeof data.error === "string" ? data.error : "L'aperçu n'a pas pu être calculé. Réessayez.")
        return
      }
      const list: PersonFindings[] = Array.isArray(data.findings) ? data.findings : []
      setPeople(list.length > 0 ? { title: "Aperçu : programmes qui dépasseraient ces limites", list } : null)
      announce(setStatus, list.length === 0
        ? "Aperçu : aucun programme actuel ne dépasse ces limites. Rien n'est encore activé."
        : `Aperçu : ${list.length} ${list.length > 1 ? "personnes dépasseraient" : "personne dépasserait"} ces limites. Rien n'est encore activé.`)
    } catch {
      setBusy(null)
      announce(setError, "La connexion a échoué : réessayez.")
    }
  }

  async function save() {
    if (busy) return
    setStatus(""); setError("")
    const local = checkPolicyForm(form)
    if (!local.ok) { showProblems(local.problems); return }
    setBusy("save")
    try {
      const { res, data } = await send(`/api/admin/events/${eventId}/workload-policy`, "PUT", { enabled: true, values: policyValuesFromForm(form) })
      setBusy(null)
      if (res.ok) {
        const wasOn = enabled
        setEnabled(true)
        setIncomplete(false)
        setErrors(new Map())
        setPeople(null)
        announce(setStatus, wasOn ? "Limites enregistrées." : "Protection activée : toute affectation qui dépasse ces limites est désormais refusée.")
        return
      }
      if (res.status === 400 && Array.isArray(data.problems) && !showProblems(data.problems)) return
      if (res.status === 409 && Array.isArray(data.findings)) {
        setPeople({ title: "Programmes à modifier d'abord", list: data.findings })
      }
      announce(setError, typeof data.error === "string" ? data.error : "Les limites n'ont pas pu être enregistrées. Réessayez.")
    } catch {
      setBusy(null)
      announce(setError, "La connexion a échoué : rien n'a été enregistré. Réessayez.")
    }
  }

  async function switchOff() {
    setBusy("off")
    setOffError(null)
    try {
      const { res, data } = await send(`/api/admin/events/${eventId}/workload-policy`, "PUT", { enabled: false })
      setBusy(null)
      if (!res.ok) { setOffError(typeof data.error === "string" ? data.error : "La protection n'a pas pu être désactivée. Réessayez."); return }
      // The opener (« Désactiver la protection ») disappears: focus goes to « Activer la protection ».
      flushSync(() => {
        setEnabled(false)
        setIncomplete(false)
        setPeople(null)
        setConfirmOff(false)
      })
      submitRef.current?.focus()
      announce(setStatus, "Protection désactivée : les limites sont gardées, mais plus rien n'est refusé à cause d'elles.")
    } catch {
      setBusy(null)
      setOffError("La connexion a échoué : rien n'a été fait. Réessayez.")
    }
  }

  return (
    <section id="protection-charge" aria-labelledby="event-wl-title" className="bg-white border border-gray-200 rounded-2xl p-5 space-y-4 scroll-mt-6" data-event-workload="1">
      <div className="space-y-1">
        <h2 id="event-wl-title" className="text-base font-semibold text-gray-900">
          Protection des pauses et de la charge <span className="ml-1 rounded-md bg-gray-100 px-1.5 py-0.5 text-xs font-medium text-gray-700">bêta</span>
        </h2>
        <p className="text-sm text-gray-800" data-workload-state="1">
          <span className="font-medium">{enabled ? (incomplete ? "Activée, mais incomplète" : "Activée") : "Désactivée"}</span>
          {enabled && incomplete && " : plus aucune inscription n'est acceptée tant que toutes les limites ne sont pas renseignées."}
          {enabled && !incomplete && " : toute affectation qui dépasse ces limites est refusée."}
        </p>
        {people && people.list.length > 0 && (
          <p className="text-sm text-gray-800">
            <a href="#event-wl-people" className="font-medium text-blue-700 underline underline-offset-2 hover:text-blue-900 rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600">
              {people.list.length} {people.list.length > 1 ? "programmes à revoir" : "programme à revoir"}
            </a>, listés sous les limites.
          </p>
        )}
        <p className="text-xs text-gray-600">
          Vous choisissez chaque limite. Aucune valeur n&apos;est imposée, et un champ vide ne veut jamais dire « sans limite » : la protection ne s&apos;active qu&apos;une fois tout rempli. Heures lues dans le fuseau {timeZone}.
        </p>
      </div>

      <div>
        <button
          type="button"
          onClick={fillSuggestions}
          aria-describedby="event-wl-suggest-note"
          className="min-h-11 sm:min-h-6 rounded-xl border border-blue-600 px-3 py-1.5 text-sm font-medium text-blue-700 hover:bg-blue-50"
        >
          Reprendre les réglages d&apos;avertissement existants
        </button>
        <p id="event-wl-suggest-note" className="mt-1 text-xs text-gray-600">
          Remplit 6 h sans vraie pause, une pause de 30 min et 8 h par journée : ce sont les seuils des alertes « Charge élevée » de l&apos;application, ni des seuils légaux ni des recommandations. Modifiez-les si besoin.
        </p>
      </div>

      <WorkloadBenchmarks onUse={applyBenchmark} />

      <form noValidate onSubmit={(e) => { e.preventDefault(); void save() }} className="space-y-4">
        <WorkloadPolicyFields idPrefix={ID} form={form} onChange={change} errors={errors} horizon={horizon} />

        {summary.length > 0 && (
          <div className="rounded-xl bg-gray-50 border border-gray-200 px-3 py-2 text-sm text-gray-800">
            <h3 className="text-sm font-semibold text-gray-900">En résumé</h3>
            <ul role="list" className="mt-1 list-disc pl-5 space-y-0.5">
              {summary.map((line) => <li key={line}>{line}</li>)}
            </ul>
            <p className="mt-1 text-xs text-gray-600">{WORKLOAD_NOT_COVERED}</p>
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => void preview()} aria-disabled={busy !== null || undefined} className={`min-h-11 sm:min-h-6 rounded-xl border border-blue-600 px-4 py-2 text-sm font-medium text-blue-700 hover:bg-blue-50 ${busy ? "opacity-50" : ""}`}>
            {busy === "preview" ? "Calcul de l'aperçu…" : "Aperçu"}
          </button>
          <button ref={submitRef} type="submit" aria-disabled={busy !== null || undefined} className={`min-h-11 sm:min-h-6 rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 ${busy ? "opacity-50" : ""}`}>
            {busy === "save" ? "Enregistrement…" : enabled ? "Enregistrer les limites" : "Activer la protection"}
          </button>
          {enabled && (
            <button type="button" onClick={() => { if (!busy) { setOffError(null); setConfirmOff(true) } }} aria-disabled={busy !== null || undefined} className={`min-h-11 sm:min-h-6 px-3 py-2 text-sm font-medium text-red-700 hover:text-red-900 ${busy ? "opacity-50" : ""}`}>
              Désactiver la protection
            </button>
          )}
        </div>
      </form>

      <p role="status" className={status ? "text-sm text-green-800" : "sr-only"}>{status}</p>
      <p role="alert" className={error ? "text-sm text-red-700" : "sr-only"}>{error}</p>

      {people && (
        <div className="space-y-2" data-workload-people="1">
          <h3 id="event-wl-people" tabIndex={-1} className="text-sm font-semibold text-gray-900 scroll-mt-6 focus:outline-none">{people.title}</h3>
          <ul role="list" className="space-y-2">
            {people.list.map((p) => (
              <li key={p.volunteerId} className="rounded-xl border border-gray-200 px-3 py-2 text-sm">
                <p className="font-medium text-gray-900">{p.name}</p>
                <ul role="list" className="mt-0.5 list-disc pl-5 text-gray-700 space-y-0.5">
                  {p.messages.map((m) => <li key={m}>{m}</li>)}
                </ul>
              </li>
            ))}
          </ul>
        </div>
      )}

      {confirmOff && (
        <ConfirmActionModal
          recap={{
            title: "Désactiver la protection des pauses et de la charge ?",
            lead: "Plus aucune inscription, aucun ajout ni aucun échange ne sera refusé à cause de ces limites.",
            lines: ["Les limites restent enregistrées : vous pourrez la réactiver.", "L'action est journalisée : vous la retrouverez dans le journal de l'événement."],
            confirmLabel: "Désactiver la protection",
            cancelLabel: "Garder la protection",
            danger: true,
          }}
          busy={busy === "off"}
          error={offError}
          onConfirm={() => void switchOff()}
          onCancel={() => setConfirmOff(false)}
        />
      )}
    </section>
  )
}
