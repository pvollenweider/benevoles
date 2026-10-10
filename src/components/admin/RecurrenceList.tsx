"use client"

// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { useId, useRef, useState } from "react"
import { toMin, toMinEnd } from "@/lib/gantt-utils"
import { normalizeTime } from "@/lib/shifts-admin"
import { isValidClock } from "@/lib/shift-time"
import { describeWeekdays, timeRange, type Weekday } from "@/lib/shift-recurrence"
import type { AdminRecurrence, RawShift } from "./shifts/types"

const fmtDay = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString("fr-FR", { timeZone: "UTC", weekday: "long", day: "numeric", month: "long", year: "numeric" })

type Listed = { date: string; startTime: string; committed: number }

type Props = {
  recurrences: AdminRecurrence[]
  shifts: RawShift[]
  /** "YYYY-MM-DD" of today in the organisation's zone: the default « from » date. */
  today: string
  onShiftsChanged: (updated: RawShift[]) => void
  onShiftsStopped: (removedIds: string[], cancelledIds: string[]) => void
  onRuleChanged: (rule: AdminRecurrence | null, id: string) => void
  onAnnounce: (text: string) => void
}

/**
 * The recurring permanences of the event (#866), each with « Modifier à partir du… » and
 * « Arrêter à partir du… ». Nothing is removed silently: dates with people are listed and only
 * cancelled (volunteers told) after a second, explicit confirmation.
 */
export default function RecurrenceList({ recurrences, shifts, today, onShiftsChanged, onShiftsStopped, onRuleChanged, onAnnounce }: Props) {
  const headingId = useId()
  if (recurrences.length === 0) return null
  return (
    <section aria-labelledby={headingId} className="bg-white rounded-2xl border border-gray-200 p-5 space-y-3">
      <h2 id={headingId} className="font-semibold text-gray-800">Permanences récurrentes</h2>
      <ul className="divide-y divide-gray-100">
        {recurrences.map((r) => (
          <RecurrenceItem key={r.id} rule={r} shifts={shifts} today={today} onShiftsChanged={onShiftsChanged} onShiftsStopped={onShiftsStopped} onRuleChanged={onRuleChanged} onAnnounce={onAnnounce} />
        ))}
      </ul>
    </section>
  )
}

function RecurrenceItem({ rule, shifts, today, onShiftsChanged, onShiftsStopped, onRuleChanged, onAnnounce }: Omit<Props, "recurrences"> & { rule: AdminRecurrence }) {
  const id = useId()
  const [mode, setMode] = useState<"none" | "change" | "stop">("none")
  const changeBtn = useRef<HTMLButtonElement>(null)
  const stopBtn = useRef<HTMLButtonElement>(null)
  const ruleShifts = shifts.filter((s) => s.recurrenceId === rule.id && s.status !== "cancelled")
  const upcoming = ruleShifts.filter((s) => s.date >= today)
  const days = new Set(upcoming.map((s) => s.date)).size
  const firstUpcoming = upcoming.map((s) => s.date).sort()[0]
  const defaultFrom = firstUpcoming ?? (today > rule.fromDate ? today : rule.fromDate)
  const oneShiftPerDay = rule.slotMinutes === toMinEnd(rule.endTime, rule.startTime) - toMin(rule.startTime)

  function close(which: "change" | "stop") {
    setMode("none")
    ;(which === "change" ? changeBtn : stopBtn).current?.focus()
  }

  return (
    <li className="py-3 space-y-2">
      <p className="text-sm text-gray-900">
        <span className="font-medium">{rule.label}</span>
        {" : "}{describeWeekdays(rule.weekdays as Weekday[], rule.everyWeeks === 2 ? 2 : 1)}, {timeRange(rule.startTime, rule.endTime)}, du {fmtDay(rule.fromDate)} au {fmtDay(rule.untilDate)}.
        {" "}<span className="text-gray-700">{days === 0 ? "Plus aucune date à venir." : `${days} date${days > 1 ? "s" : ""} à venir.`}</span>
      </p>
      <div className="flex flex-wrap gap-2">
        <button ref={changeBtn} type="button" aria-expanded={mode === "change"} aria-controls={mode === "change" ? `${id}-change` : undefined} onClick={() => setMode(mode === "change" ? "none" : "change")} className="min-h-11 px-3 rounded-xl border border-gray-400 text-sm text-gray-800 hover:bg-gray-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600">
          Modifier à partir d&apos;une date<span className="sr-only"> : {rule.label}</span>
        </button>
        <button ref={stopBtn} type="button" aria-expanded={mode === "stop"} aria-controls={mode === "stop" ? `${id}-stop` : undefined} onClick={() => setMode(mode === "stop" ? "none" : "stop")} className="min-h-11 px-3 rounded-xl border border-gray-400 text-sm text-gray-800 hover:bg-gray-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600">
          Arrêter à partir d&apos;une date<span className="sr-only"> : {rule.label}</span>
        </button>
      </div>
      {mode === "change" && (
        <ChangeForm panelId={`${id}-change`} rule={rule} defaultFrom={defaultFrom} oneShiftPerDay={oneShiftPerDay} onCancel={() => close("change")} onDone={(updated, ruleAfter, text) => { onShiftsChanged(updated); onRuleChanged(ruleAfter, rule.id); onAnnounce(text); close("change") }} />
      )}
      {mode === "stop" && (
        <StopForm panelId={`${id}-stop`} rule={rule} defaultFrom={defaultFrom} onCancel={() => close("stop")} onDone={(removed, cancelled, ruleAfter, text) => { onShiftsStopped(removed, cancelled); onRuleChanged(ruleAfter, rule.id); onAnnounce(text); if (ruleAfter) close("stop") }} />
      )}
    </li>
  )
}

function ChangeForm({ panelId, rule, defaultFrom, oneShiftPerDay, onCancel, onDone }: {
  panelId: string; rule: AdminRecurrence; defaultFrom: string; oneShiftPerDay: boolean
  onCancel: () => void; onDone: (updated: RawShift[], rule: AdminRecurrence, text: string) => void
}) {
  const id = useId()
  const [from, setFrom] = useState(defaultFrom)
  const [startTime, setStartTime] = useState(rule.startTime)
  const [endTime, setEndTime] = useState(rule.endTime)
  const [capacity, setCapacity] = useState<number | "">(rule.capacity)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [tooSmall, setTooSmall] = useState<Listed[]>([])
  const [badTime, setBadTime] = useState<"start" | "end" | null>(null)
  const [badCapacity, setBadCapacity] = useState(false)

  async function submit() {
    if (saving) return
    setError(null)
    setTooSmall([])
    const wrongTime = !oneShiftPerDay ? null : !isValidClock(startTime) ? "start" : !isValidClock(endTime) ? "end" : null
    const wrongCapacity = !(Number(capacity) >= 1)
    setBadTime(wrongTime)
    setBadCapacity(wrongCapacity)
    if (wrongTime) {
      // The message goes with the field (aria-describedby), focus on the field to fix.
      setError(`Indiquez l'heure de ${wrongTime === "start" ? "début" : "fin"} au format HH:MM (par exemple 14:00).`)
      requestAnimationFrame(() => document.getElementById(`${id}-${wrongTime}`)?.focus())
      return
    }
    if (wrongCapacity) {
      setError("Indiquez au moins une personne par créneau.")
      requestAnimationFrame(() => document.getElementById(`${id}-capacity`)?.focus())
      return
    }
    const body: Record<string, unknown> = { from }
    if (oneShiftPerDay && startTime !== rule.startTime) body.startTime = startTime
    if (oneShiftPerDay && endTime !== rule.endTime) body.endTime = endTime
    if (capacity !== rule.capacity) body.capacity = Number(capacity)
    setSaving(true)
    let res: Response
    try {
      res = await fetch(`/api/admin/shifts/recurrence/${rule.id}/change`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
    } catch {
      setSaving(false)
      setError("Connexion impossible. Vérifiez votre réseau et réessayez.")
      return
    }
    setSaving(false)
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      setError(typeof data.error === "string" ? data.error : "Erreur lors de la modification.")
      setTooSmall(Array.isArray(data.tooSmall) ? data.tooSmall : [])
      return
    }
    const updated = (data.shifts as (RawShift & { date: string })[]).map((s) => ({ ...s, date: s.date.split("T")[0] }))
    const n = new Set(updated.map((s) => s.date)).size
    const told = data.notified > 0 ? ` ${data.notified} bénévole${data.notified > 1 ? "s ont été prévenus" : " a été prévenu"} du changement d'horaire.` : ""
    const newRule = { ...rule, ...(body.startTime ? { startTime } : {}), ...(body.endTime ? { endTime } : {}), ...(body.capacity ? { capacity: Number(capacity) } : {}) }
    if (body.startTime || body.endTime) newRule.slotMinutes = toMinEnd(newRule.endTime, newRule.startTime) - toMin(newRule.startTime)
    onDone(updated, newRule, `Permanence ${rule.label} modifiée sur ${n} date${n > 1 ? "s" : ""}.${told}`)
  }

  return (
    <div id={panelId} role="group" aria-labelledby={`${id}-title`} className="rounded-xl border border-blue-200 bg-blue-50/40 p-3 space-y-3">
      <p id={`${id}-title`} className="text-sm font-medium text-gray-900">Modifier {rule.label} à partir d&apos;une date</p>
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
        <div>
          <label htmlFor={`${id}-from`} className="block text-xs font-medium text-gray-700 mb-1">À partir du</label>
          <input id={`${id}-from`} type="date" min={rule.fromDate} max={rule.untilDate} value={from} onChange={(e) => setFrom(e.target.value)} className="input" />
        </div>
        {oneShiftPerDay && (
          <>
            <div>
              <label htmlFor={`${id}-start`} className="block text-xs font-medium text-gray-700 mb-1">Début</label>
              <input id={`${id}-start`} type="text" inputMode="numeric" placeholder="HH:MM" value={startTime} aria-invalid={badTime === "start" || undefined} aria-describedby={[`${id}-time-hint`, ...(badTime === "start" ? [`${id}-error`] : [])].join(" ")} onChange={(e) => setStartTime(e.target.value)} onBlur={(e) => setStartTime(normalizeTime(e.target.value))} className="input" />
            </div>
            <div>
              <label htmlFor={`${id}-end`} className="block text-xs font-medium text-gray-700 mb-1">Fin</label>
              <input id={`${id}-end`} type="text" inputMode="numeric" placeholder="HH:MM" value={endTime} aria-invalid={badTime === "end" || undefined} aria-describedby={[`${id}-time-hint`, ...(badTime === "end" ? [`${id}-error`] : [])].join(" ")} onChange={(e) => setEndTime(e.target.value)} onBlur={(e) => setEndTime(normalizeTime(e.target.value))} className="input" />
            </div>
          </>
        )}
        <div>
          <label htmlFor={`${id}-capacity`} className="block text-xs font-medium text-gray-700 mb-1">Personnes par créneau</label>
          <input id={`${id}-capacity`} type="number" min={1} value={capacity} aria-invalid={badCapacity || undefined} aria-describedby={badCapacity ? `${id}-error` : undefined} onChange={(e) => setCapacity(e.target.value === "" ? "" : Number(e.target.value))} className="input" />
        </div>
      </div>
      {oneShiftPerDay && <p id={`${id}-time-hint`} className="text-xs text-gray-700">Heures au format HH:MM, par exemple 14:00.</p>}
      {!oneShiftPerDay && <p className="text-xs text-gray-700">Cette permanence compte plusieurs créneaux par jour : ses horaires se modifient créneau par créneau.</p>}
      <p className="text-xs text-gray-700">Les dates précédentes et les créneaux annulés ne changent pas. Les bénévoles inscrits sont prévenus d&apos;un changement d&apos;horaire.</p>
      {error && (
        <div role="alert" className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700">
          <p id={`${id}-error`}>{error}</p>
          {tooSmall.length > 0 && <ul className="mt-1 list-disc pl-5">{tooSmall.map((s) => <li key={s.date + s.startTime}>{fmtDay(s.date)}, {s.startTime} : {s.committed} inscrit{s.committed > 1 ? "s" : ""}</li>)}</ul>}
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={submit} aria-disabled={saving || undefined} className="min-h-11 bg-blue-600 text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-blue-700 aria-disabled:cursor-wait focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600">
          {saving ? "Modification…" : "Modifier ces dates"}
        </button>
        <button type="button" onClick={onCancel} className="min-h-11 text-gray-700 px-3 py-2 text-sm hover:text-gray-900 rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600">Annuler</button>
      </div>
    </div>
  )
}

function StopForm({ panelId, rule, defaultFrom, onCancel, onDone }: {
  panelId: string; rule: AdminRecurrence; defaultFrom: string
  onCancel: () => void; onDone: (removed: string[], cancelled: string[], rule: AdminRecurrence | null, text: string) => void
}) {
  const id = useId()
  const [from, setFrom] = useState(defaultFrom)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [withPeople, setWithPeople] = useState<Listed[]>([])
  const peopleRef = useRef<HTMLDivElement>(null)

  async function submit(confirm: boolean) {
    if (saving) return
    setError(null)
    setSaving(true)
    let res: Response
    try {
      res = await fetch(`/api/admin/shifts/recurrence/${rule.id}/stop`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ from, confirm }) })
    } catch {
      setSaving(false)
      setError("Connexion impossible. Vérifiez votre réseau et réessayez.")
      return
    }
    setSaving(false)
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      // 409: dates with people, listed for a second, explicit confirmation.
      if (res.status === 409 && Array.isArray(data.withPeople)) {
        setWithPeople(data.withPeople)
        // Focus the explanation and its list of dates, never the destructive button: a repeated
        // Enter must not cancel dates and email volunteers before anyone heard the list.
        requestAnimationFrame(() => peopleRef.current?.focus())
        return
      }
      setError(typeof data.error === "string" ? data.error : "Erreur lors de l'arrêt.")
      return
    }
    const { removed, cancelled, ruleDeleted, notified } = data as { removed: string[]; cancelled: string[]; ruleDeleted: boolean; notified: number }
    const told = notified > 0 ? ` ${notified} bénévole${notified > 1 ? "s ont été prévenus" : " a été prévenu"}.` : ""
    const ruleAfter = ruleDeleted ? null : { ...rule, untilDate: new Date(Date.parse(`${from}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10) }
    onDone(removed, cancelled, ruleAfter, `Permanence ${rule.label} arrêtée à partir du ${fmtDay(from)} : ${removed.length} créneau${removed.length > 1 ? "x" : ""} supprimé${removed.length > 1 ? "s" : ""}, ${cancelled.length} annulé${cancelled.length > 1 ? "s" : ""}.${told}`)
  }

  return (
    <div id={panelId} role="group" aria-labelledby={`${id}-title`} className="rounded-xl border border-amber-300 bg-amber-50 p-3 space-y-3">
      <p id={`${id}-title`} className="text-sm font-medium text-gray-900">Arrêter {rule.label} à partir d&apos;une date</p>
      <div className="max-w-xs">
        <label htmlFor={`${id}-from`} className="block text-xs font-medium text-gray-700 mb-1">À partir du</label>
        <input id={`${id}-from`} type="date" min={rule.fromDate} max={rule.untilDate} value={from} onChange={(e) => { setFrom(e.target.value); setWithPeople([]) }} className="input" />
      </div>
      <p className="text-xs text-gray-800">Les dates sans inscrit sont supprimées. Les dates passées ne changent pas.</p>
      {error && <p role="alert" className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700">{error}</p>}
      {withPeople.length > 0 ? (
        <div className="space-y-2">
          <div ref={peopleRef} tabIndex={-1} aria-labelledby={`${id}-people`} role="group" className="space-y-2 rounded focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600">
          <p id={`${id}-people`} className="text-sm text-gray-900">
            {withPeople.length} date{withPeople.length > 1 ? "s ont" : " a"} déjà des inscrits. Les arrêter annule ces créneaux et prévient chaque personne par email :
          </p>
          <ul className="list-disc pl-5 text-sm text-gray-900">
            {withPeople.map((s) => <li key={s.date + s.startTime}>{fmtDay(s.date)}, {s.startTime} : {s.committed} inscrit{s.committed > 1 ? "s" : ""}</li>)}
          </ul>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => submit(true)} aria-disabled={saving || undefined} aria-describedby={`${id}-people`} className="min-h-11 bg-red-700 text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-red-800 aria-disabled:cursor-wait focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-700">
              {saving ? "Arrêt…" : `Annuler aussi ${withPeople.length > 1 ? `ces ${withPeople.length} dates` : "cette date"} et prévenir les inscrits`}
            </button>
            <button type="button" onClick={onCancel} className="min-h-11 text-gray-700 px-3 py-2 text-sm hover:text-gray-900 rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600">Ne rien arrêter</button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => submit(false)} aria-disabled={saving || undefined} className="min-h-11 bg-gray-900 text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-gray-800 aria-disabled:cursor-wait focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600">
            {saving ? "Arrêt…" : "Arrêter la permanence"}
          </button>
          <button type="button" onClick={onCancel} className="min-h-11 text-gray-700 px-3 py-2 text-sm hover:text-gray-900 rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600">Annuler</button>
        </div>
      )}
    </div>
  )
}
