"use client"

// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { useEffect, useRef, useState } from "react"
import { flushSync } from "react-dom"
import { announce } from "@/lib/announce"
import { requestJson } from "@/lib/use-submit"
import { personalLimitsLines, type PersonalLayers } from "@/lib/workload-personal"
import { personalFormFrom, personalValuesFromForm, type PersonalFormState } from "@/lib/workload-policy-form"
import type { PersonalField, PersonalLimits } from "@/lib/workload-policy"
import PersonalLimitsFields, { personalInputId } from "@/components/workload/PersonalLimitsFields"

type Row = { volunteerId: string; name: string; layers: PersonalLayers }
type Person = { volunteerId: string; name: string }
type Problem = { field: string; message: string }

const ID = "event-wl-person"
const focusRing = "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
const secondary = `min-h-11 sm:min-h-6 rounded-xl border border-blue-600 px-3 py-1.5 text-sm font-medium text-blue-700 hover:bg-blue-50 ${focusRing}`

/**
 * « Limites personnelles » on the event's protection card (#1171, lot 2): limits stricter than the
 * event's for one person, without any reason. The organisation's layer only: what the person asked
 * for from their link stays, and the stricter of the two applies (Codex). Its own form, after the
 * card's (never nested). Focus: the form's first field on open, back to its opener on close; after a
 * removal, the next person's « Modifier », or « Ajouter des limites… ». Outcomes in the card's status.
 */
export default function PersonalLimitsEditor({ eventId, event }: { eventId: string; event: Record<PersonalField, number> }) {
  const [rows, setRows] = useState<Row[] | null>(null)
  const [people, setPeople] = useState<Person[]>([])
  const [editing, setEditing] = useState<{ volunteerId: string | null; name: string | null } | null>(null)
  const [chosen, setChosen] = useState("")
  const [form, setForm] = useState<PersonalFormState>(() => personalFormFrom(null))
  const [errors, setErrors] = useState<Map<string, string>>(new Map())
  const [error, setError] = useState("")
  const [findings, setFindings] = useState<string[]>([])
  const [status, setStatus] = useState("")
  const [busy, setBusy] = useState(false)
  const addRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    let live = true
    void requestJson<{ limits: Row[]; people: Person[] }>(() => fetch(`/api/admin/events/${eventId}/workload-limits`)).then((o) => {
      if (!live) return
      if (o.ok) { setRows(o.data.limits); setPeople(o.data.people) } else setRows([])
    })
    return () => { live = false }
  }, [eventId])

  function open(row: Row | null) {
    if (busy) return
    flushSync(() => {
      setEditing(row ? { volunteerId: row.volunteerId, name: row.name } : { volunteerId: null, name: null })
      setChosen(row?.volunteerId ?? "")
      setForm(personalFormFrom(row?.layers.admin ?? null))
      setErrors(new Map()); setError(""); setFindings([])
    })
    document.getElementById(row ? personalInputId(ID, "personalMaxContinuousMinutes") : `${ID}-who`)?.focus()
  }

  function close(focusId: string | null) {
    flushSync(() => { setEditing(null); setErrors(new Map()); setError(""); setFindings([]) })
    ;(focusId ? document.getElementById(focusId) : addRef.current)?.focus()
  }

  async function save() {
    if (busy || !editing) return
    const volunteerId = editing.volunteerId ?? chosen
    if (!volunteerId) {
      flushSync(() => setErrors(new Map([["who", "Choisissez une personne."]])))
      document.getElementById(`${ID}-who`)?.focus()
      return
    }
    setBusy(true); setError(""); setFindings([])
    let res: Response | null = null
    try {
      res = await fetch(`/api/admin/events/${eventId}/workload-limits/${volunteerId}`, {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ limits: personalValuesFromForm(form) }),
      })
    } catch { res = null }
    const data = res ? await res.json().catch(() => ({})) : {}
    setBusy(false)
    if (!res || !res.ok) {
      // Problems go under their fields; the findings of a refusal are listed after the alert.
      const problems: Problem[] = Array.isArray(data.problems) ? data.problems : []
      flushSync(() => { setErrors(new Map(problems.map((p) => [p.field, p.message]))); setFindings(Array.isArray(data.workload) ? data.workload : []) })
      const first = problems.find((p) => p.field.startsWith("personal"))
      if (first) document.getElementById(personalInputId(ID, first.field))?.focus()
      announce(setError, typeof data.error === "string" ? data.error : res ? "Les limites n'ont pas pu être enregistrées. Réessayez." : "La connexion a échoué : rien n'a été enregistré. Réessayez.")
      return
    }
    const outcome = { data: data as { layers: PersonalLayers } }
    const name = editing.name ?? people.find((p) => p.volunteerId === volunteerId)?.name ?? ""
    // Committed before the focus moves: a person just added has no « Modifier » until then.
    flushSync(() => setRows((prev) => {
      const others = (prev ?? []).filter((r) => r.volunteerId !== volunteerId)
      return [...others, { volunteerId, name, layers: outcome.data.layers }].sort((a, b) => a.name.localeCompare(b.name, "fr"))
    }))
    close(`${ID}-edit-${volunteerId}`)
    announce(setStatus, `Limites de ${name} enregistrées.`)
  }

  async function remove(row: Row, index: number) {
    if (busy) return
    setBusy(true)
    const outcome = await requestJson<{ layers: PersonalLayers }>(() => fetch(`/api/admin/events/${eventId}/workload-limits/${row.volunteerId}`, { method: "DELETE" }), "Les limites n'ont pas pu être retirées. Réessayez.")
    setBusy(false)
    if (!outcome.ok) { announce(setError, outcome.error); return }
    const left = outcome.data.layers
    const list = rows ?? []
    const next = left.volunteer ? list.map((r) => (r.volunteerId === row.volunteerId ? { ...r, layers: left } : r)) : list.filter((r) => r.volunteerId !== row.volunteerId)
    const neighbour = left.volunteer ? row : list.filter((r) => r.volunteerId !== row.volunteerId)[index] ?? list.filter((r) => r.volunteerId !== row.volunteerId)[index - 1]
    flushSync(() => setRows(next))
    ;(neighbour ? document.getElementById(`${ID}-edit-${neighbour.volunteerId}`) : addRef.current)?.focus()
    announce(setStatus, left.volunteer
      ? `Limites fixées pour ${row.name} retirées. Celles que la personne a demandées restent.`
      : `Limites de ${row.name} retirées : celles de l'événement s'appliquent.`)
  }

  const without = people.filter((p) => !(rows ?? []).some((r) => r.volunteerId === p.volunteerId && r.layers.admin))
  const whoError = errors.get("who")
  const layerLines = (title: string, limits: PersonalLimits | null) => limits && (
    <li>
      <span className="font-medium">{title} :</span>
      <ul role="list" className="list-disc pl-5">{personalLimitsLines(limits).map((l) => <li key={l}>{l}</li>)}</ul>
    </li>
  )

  return (
    <section aria-labelledby={`${ID}-title`} className="space-y-3" data-personal-limits="1">
      <h3 id={`${ID}-title`} className="text-sm font-semibold text-gray-900">Limites personnelles</h3>
      <p className="text-xs text-gray-600">
        Une limite plus stricte pour une personne, sans motif à donner, jamais moins stricte que celle de l&apos;événement. Laissez vide pour garder la limite de l&apos;événement. Une personne peut aussi demander des limites depuis son lien personnel : vous ne pouvez pas les assouplir, la plus stricte s&apos;applique.
      </p>
      {rows === null ? (
        <p className="text-sm text-gray-600">Chargement…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-gray-700">Aucune limite personnelle pour l&apos;instant.</p>
      ) : (
        <ul role="list" className="space-y-2">
          {rows.map((r, i) => (
            <li key={r.volunteerId} className="rounded-xl border border-gray-200 px-3 py-2 text-sm">
              <p className="font-medium text-gray-900 [overflow-wrap:anywhere]">{r.name}</p>
              <ul role="list" className="mt-0.5 space-y-1 text-gray-700">
                {layerLines("Fixées par l'organisation", r.layers.admin)}
                {layerLines("Demandées par la personne", r.layers.volunteer)}
              </ul>
              <div className="mt-1 flex flex-wrap gap-3">
                <button id={`${ID}-edit-${r.volunteerId}`} type="button" onClick={() => open(r)} aria-disabled={busy || undefined} className={`text-xs font-medium text-blue-700 hover:text-blue-900 min-h-6 rounded-md ${busy ? "opacity-50" : ""} ${focusRing}`}>
                  Modifier{" "}<span className="sr-only">{`les limites de ${r.name}`}</span>
                </button>
                {r.layers.admin && (
                  <button type="button" onClick={() => void remove(r, i)} aria-disabled={busy || undefined} className={`text-xs font-medium text-red-700 hover:text-red-900 min-h-6 rounded-md ${focusRing}`}>
                    Retirer{" "}<span className="sr-only">{`les limites fixées pour ${r.name}`}</span>
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {editing ? (
        <form noValidate onSubmit={(e) => { e.preventDefault(); void save() }} onKeyDown={(e) => { if (e.key === "Escape") { e.stopPropagation(); close(editing.volunteerId ? `${ID}-edit-${editing.volunteerId}` : null) } }} className="rounded-xl border border-gray-200 px-3 py-2 space-y-3">
          {editing.volunteerId ? (
            <p className="text-sm text-gray-900">Personne : <span className="font-medium">{editing.name}</span></p>
          ) : (
            <div>
              <label htmlFor={`${ID}-who`} className="block text-xs font-medium text-gray-700 mb-1">Personne</label>
              <select id={`${ID}-who`} value={chosen} onChange={(e) => { setChosen(e.target.value); setErrors((m) => { const n = new Map(m); n.delete("who"); return n }) }} aria-invalid={whoError ? true : undefined} aria-describedby={whoError ? `${ID}-who-error` : undefined} className="input max-w-80">
                <option value="">Choisir une personne</option>
                {without.map((p) => <option key={p.volunteerId} value={p.volunteerId}>{p.name}</option>)}
              </select>
              {whoError && <p id={`${ID}-who-error`} className="mt-1 text-sm text-red-700">{whoError}</p>}
            </div>
          )}
          <PersonalLimitsFields idPrefix={ID} form={form} onChange={(next) => { setForm(next); setErrors(new Map()) }} errors={errors} event={event} />
          <div className="flex flex-wrap gap-2">
            <button type="submit" aria-disabled={busy || undefined} className={`min-h-11 sm:min-h-6 rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 ${busy ? "opacity-50" : ""} ${focusRing}`}>
              {busy ? "Enregistrement…" : "Enregistrer les limites de la personne"}
            </button>
            <button type="button" onClick={() => close(editing.volunteerId ? `${ID}-edit-${editing.volunteerId}` : null)} className={`min-h-11 sm:min-h-6 px-3 py-2 text-sm font-medium text-gray-700 hover:text-gray-900 ${focusRing}`}>Annuler</button>
          </div>
        </form>
      ) : (
        <button ref={addRef} type="button" onClick={() => open(null)} className={secondary}>Ajouter des limites pour une personne</button>
      )}

      <p role="alert" className={error ? "text-sm text-red-700" : "sr-only"}>{error}</p>
      {findings.length > 0 && (
        <ul role="list" className="list-disc pl-5 text-sm text-gray-800 space-y-0.5" data-personal-findings="1">
          {findings.map((f) => <li key={f}>{f}</li>)}
        </ul>
      )}
      <p role="status" className={status ? "text-sm text-green-800" : "sr-only"}>{status}</p>
    </section>
  )
}
