"use client"

// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { useEffect, useId, useRef, useState } from "react"
import { flushSync } from "react-dom"
import { requestJson } from "@/lib/use-submit"
import { KNOWN_ROLES } from "@/lib/roles"
import { resolveNewShiftDisplayOrder, toMin, toMinEnd } from "@/lib/gantt-utils"
import { normalizeTime } from "@/lib/shifts-admin"
import { isValidClock } from "@/lib/shift-time"
import { fmtDuration } from "@/lib/shift-series"
import {
  describeWeekdays, generateRecurrence, HOLIDAY_CALENDARS, recurrenceIssue, WEEKDAYS,
  type HolidayCalendar, type RecurrenceInput, type Weekday,
} from "@/lib/shift-recurrence"
import type { AdminShift } from "./AdminDayTimeline"
import type { AdminRecurrence } from "./shifts/types"

/** « Toute la plage » = one shift per day covering the whole time range. */
const WHOLE_RANGE = 0
const SLOT_OPTIONS = [WHOLE_RANGE, 60, 90, 120, 180, 240]
/** Dates listed in the preview before « … et N autres ». */
const PREVIEW_DATES = 8
/** The live summary waits this long after the last change, so it isn't re-read at each keystroke. */
const LIVE_SUMMARY_DELAY_MS = 500

type Field = "roleName" | "from" | "until" | "weekdays" | "startTime" | "endTime" | "capacity"
const REQUIRED: readonly Field[] = ["roleName", "from", "until", "weekdays", "startTime", "endTime", "capacity"]
const FIELD_ERRORS: Record<Field, string> = {
  roleName: "Indiquez le poste.",
  from: "Choisissez la date de début.",
  until: "Choisissez la date de fin.",
  weekdays: "Choisissez au moins un jour de la semaine.",
  startTime: "Indiquez l'heure de début au format HH:MM (par exemple 14:00).",
  endTime: "Indiquez l'heure de fin au format HH:MM (par exemple 18:00).",
  capacity: "Indiquez au moins une personne par créneau.",
}
const FIELD_NOUNS: Record<Field, string> = {
  roleName: "le poste", from: "la date de début", until: "la date de fin", weekdays: "les jours", startTime: "l'heure de début", endTime: "l'heure de fin", capacity: "le nombre de personnes",
}

/** Long weekday, never « ven. »: an abbreviation is read letter by letter by screen readers. */
const fmtDay = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString("fr-FR", { timeZone: "UTC", weekday: "long", day: "numeric", month: "long", year: "numeric" })

type Props = {
  panelId?: string
  eventId: string
  /** First and last day of the event, "YYYY-MM-DD": the permanence stays inside. */
  eventStart: string
  eventEnd: string
  defaultHolidays: HolidayCalendar
  existingShifts: { roleName: string; displayOrder: number }[]
  onCreated: (shifts: AdminShift[], rule: AdminRecurrence) => void
  onClose: () => void
}

/**
 * « Répéter chaque semaine » (#866): a permanence described once (days of the week, hours, period)
 * gives every date, public holidays and closures left out, previewed before creation. Same
 * generator as the API (src/lib/shift-recurrence.ts).
 */
export default function ShiftRecurrenceForm({ panelId, eventId, eventStart, eventEnd, defaultHolidays, existingShifts, onCreated, onClose }: Props) {
  const id = useId()
  const headingRef = useRef<HTMLHeadingElement>(null)
  const [roleName, setRoleName] = useState("")
  const [label, setLabel] = useState("")
  const [from, setFrom] = useState(eventStart)
  const [until, setUntil] = useState(eventEnd)
  const [weekdays, setWeekdays] = useState<Weekday[]>([])
  const [everyWeeks, setEveryWeeks] = useState<1 | 2>(1)
  const [startTime, setStartTime] = useState("")
  const [endTime, setEndTime] = useState("")
  const [slotChoice, setSlotChoice] = useState(WHOLE_RANGE)
  const [capacity, setCapacity] = useState<number | "">(2)
  const [holidays, setHolidays] = useState<HolidayCalendar>(defaultHolidays)
  const [closures, setClosures] = useState<string[]>([])
  const [closureDraft, setClosureDraft] = useState("")
  const [waitlistEnabled, setWaitlistEnabled] = useState(false)
  const [requiresApproval, setRequiresApproval] = useState(false)
  const [attempted, setAttempted] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [closureNote, setClosureNote] = useState("")
  const [liveSummary, setLiveSummary] = useState("")
  const closureInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { headingRef.current?.focus() }, [])

  const missing: Record<Field, boolean> = {
    roleName: !roleName.trim(),
    from: !from,
    until: !until,
    weekdays: weekdays.length === 0,
    startTime: !isValidClock(startTime),
    endTime: !isValidClock(endTime),
    capacity: !(Number(capacity) >= 1),
  }
  const missingFields = REQUIRED.filter((f) => missing[f])
  const complete = missingFields.length === 0
  const rangeMinutes = complete && startTime !== endTime ? toMinEnd(endTime, startTime) - toMin(startTime) : 0
  const slotMinutes = slotChoice === WHOLE_RANGE ? rangeMinutes : slotChoice
  const input: RecurrenceInput = { from, until, weekdays, everyWeeks, startTime, endTime, slotMinutes, breakMinutes: 0, holidays, closures }
  const issue = complete ? recurrenceIssue(input, { start: eventStart, end: eventEnd }) : null
  const problem = issue?.message ?? null
  const preview = complete && !problem ? generateRecurrence(input) : null
  const days = preview ? [...new Set(preview.shifts.map((s) => s.day))] : []

  function toggleWeekday(w: Weekday) {
    setWeekdays((prev) => prev.includes(w) ? prev.filter((x) => x !== w) : [...prev, w].sort())
  }

  function addClosure() {
    if (!closureDraft) return
    if (closures.includes(closureDraft)) {
      setClosureNote(`La fermeture du ${fmtDay(closureDraft)} est déjà dans la liste.`)
    } else {
      setClosures((prev) => [...prev, closureDraft].sort())
      setClosureNote(`Fermeture du ${fmtDay(closureDraft)} ajoutée.`)
    }
    setClosureDraft("")
    closureInputRef.current?.focus()
  }

  function removeClosure(date: string) {
    setClosures((prev) => prev.filter((d) => d !== date))
    setClosureNote(`Fermeture du ${fmtDay(date)} retirée.`)
    closureInputRef.current?.focus()
  }

  async function handleCreate() {
    if (saving) return
    if (!complete) {
      flushSync(() => setAttempted(true))
      const first = missingFields[0]
      document.getElementById(first === "weekdays" ? `${id}-wd-1` : fieldId(first))?.focus()
      return
    }
    if (issue || !preview) {
      // Not silent (#866 review): the message is an alert, and focus goes to the field to fix.
      flushSync(() => setAttempted(true))
      const target = issue?.field === "weekdays" ? `${id}-wd-1`
        : issue?.field === "closures" ? `${id}-closure`
        : issue?.field ? fieldId(issue.field)
        : summaryId
      document.getElementById(target)?.focus()
      return
    }
    setAttempted(true)
    setSaving(true)
    setError(null)
    const outcome = await requestJson<{ rule: AdminRecurrence; shifts: (AdminShift & { date: string })[] }>(() => fetch("/api/admin/shifts/recurrence", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        eventId, roleName: roleName.trim(), label: label.trim() || undefined, from, until, weekdays, everyWeeks,
        startTime, endTime, slotMinutes, breakMinutes: 0, capacity: Number(capacity), holidays, closures,
        waitlistEnabled, requiresApproval, displayOrder: resolveNewShiftDisplayOrder(existingShifts, roleName.trim(), 0),
      }),
    }), "Erreur lors de la création.")
    setSaving(false)
    if (!outcome.ok) { setError(outcome.error); return }
    onCreated(outcome.data.shifts.map((s) => ({ ...s, date: s.date.split("T")[0], registrationCount: 0 })), outcome.data.rule)
  }

  const fieldId = (f: Field) => `${id}-${f}`
  /** Missing, or the field the rule's problem is about (once « Créer » was pressed). */
  const flagged = (f: Field) => attempted && (missing[f] || issue?.field === f)
  const invalid = (f: Field) => attempted && missing[f]
  const errorIdOf = (f: Field) => `${fieldId(f)}-error`
  const fieldMessage = (f: Field) => invalid(f) ? <p id={errorIdOf(f)} className="text-xs text-red-700 mt-1">{FIELD_ERRORS[f]}</p> : null
  const describedBy = (f: Field, ...others: string[]) => [...others, ...(invalid(f) ? [errorIdOf(f)] : [])].join(" ") || undefined
  const fieldClass = (f: Field) => `input ${invalid(f) ? "!border-red-600" : ""}`
  const labelClass = (f: Field) => `block text-xs font-medium mb-1 ${invalid(f) ? "text-red-700" : "text-gray-600"}`
  const summaryId = `${id}-summary`
  const problemId = `${id}-problem`
  const timeHintId = `${id}-time-hint`
  const shiftCount = preview?.shifts.length ?? 0
  const skippedCount = preview?.skipped.length ?? 0
  const people = Number(capacity) || 0

  const summary = !complete
    ? "Renseignez le poste, la période, les jours et les heures pour voir les dates."
    : problem ?? `Aperçu : ${describeWeekdays(weekdays, everyWeeks)} de ${startTime} à ${endTime}, ${days.length} date${days.length > 1 ? "s" : ""}, ${shiftCount} créneau${shiftCount > 1 ? "x" : ""}${slotChoice !== WHOLE_RANGE ? ` de ${fmtDuration(slotChoice)}` : ""}, ${people} personne${people > 1 ? "s" : ""} par créneau${skippedCount > 0 ? `, ${skippedCount} date${skippedCount > 1 ? "s" : ""} exclue${skippedCount > 1 ? "s" : ""}` : ""}.`

  // The visible summary follows each keystroke; the announced one waits for a pause.
  useEffect(() => {
    const timer = setTimeout(() => setLiveSummary(summary), LIVE_SUMMARY_DELAY_MS)
    return () => clearTimeout(timer)
  }, [summary])

  return (
    <section id={panelId} aria-labelledby={`${id}-title`} className="bg-white rounded-2xl border border-blue-200 p-5 space-y-4">
      <div>
        <h3 id={`${id}-title`} ref={headingRef} tabIndex={-1} className="font-semibold text-gray-800 focus:outline-none">
          Répéter un créneau chaque semaine
        </h3>
        <p className="text-xs text-gray-600 mt-0.5">
          Pour une permanence qui revient (mercredi après-midi, samedi matin…) : décrivez-la une fois, toutes les dates de la période sont créées, jours fériés et fermetures exclus. Chaque date reste modifiable ensuite.
          Les champs marqués d&apos;un astérisque (*) sont obligatoires.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label htmlFor={fieldId("roleName")} className={labelClass("roleName")}>Poste <span aria-hidden="true">*</span></label>
          <input id={fieldId("roleName")} type="text" list={`${id}-roles`} value={roleName} required aria-invalid={invalid("roleName") || undefined} aria-describedby={describedBy("roleName")} onChange={(e) => setRoleName(e.target.value)} placeholder="ex. Accueil" className={fieldClass("roleName")} />
          {fieldMessage("roleName")}
          <datalist id={`${id}-roles`}>{KNOWN_ROLES.map((r) => <option key={r} value={r} />)}</datalist>
        </div>
        <div>
          <label htmlFor={`${id}-label`} className="block text-xs font-medium text-gray-600 mb-1">Libellé</label>
          <input id={`${id}-label`} type="text" value={label} onChange={(e) => setLabel(e.target.value)} placeholder={roleName || "ex. Permanence du mercredi"} className="input" />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label htmlFor={fieldId("from")} className={labelClass("from")}>Du <span aria-hidden="true">*</span></label>
          <input id={fieldId("from")} type="date" min={eventStart} max={eventEnd} value={from} required aria-invalid={flagged("from") || undefined} aria-describedby={describedBy("from", ...(flagged("from") && issue?.field === "from" ? [problemId] : []))} onChange={(e) => setFrom(e.target.value)} className={fieldClass("from")} />
          {fieldMessage("from")}
        </div>
        <div>
          <label htmlFor={fieldId("until")} className={labelClass("until")}>Au <span aria-hidden="true">*</span></label>
          <input id={fieldId("until")} type="date" min={eventStart} max={eventEnd} value={until} required aria-invalid={flagged("until") || undefined} aria-describedby={describedBy("until", `${id}-period-hint`, ...(flagged("until") && issue?.field === "until" ? [problemId] : []))} onChange={(e) => setUntil(e.target.value)} className={fieldClass("until")} />
          {fieldMessage("until")}
          <p id={`${id}-period-hint`} className="text-[11px] text-gray-600 mt-1">Dans la période de l&apos;événement : pour une saison, allongez d&apos;abord les dates de l&apos;événement.</p>
        </div>
      </div>

      <fieldset aria-describedby={invalid("weekdays") ? errorIdOf("weekdays") : undefined}>
        <legend className={labelClass("weekdays")}>Jours <span aria-hidden="true">*</span><span className="sr-only"> (obligatoire)</span></legend>
        <div className="flex flex-wrap gap-2">
          {WEEKDAYS.map((w) => (
            <label key={w.value} htmlFor={`${id}-wd-${w.value}`} className="inline-flex items-center gap-2 min-h-11 px-3 rounded-xl border border-gray-300 text-sm text-gray-800 has-[:checked]:border-blue-600 has-[:checked]:bg-blue-50 cursor-pointer">
              <input id={`${id}-wd-${w.value}`} type="checkbox" checked={weekdays.includes(w.value)} aria-invalid={invalid("weekdays") || undefined} aria-describedby={invalid("weekdays") ? errorIdOf("weekdays") : undefined} onChange={() => toggleWeekday(w.value)} className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-2 focus:ring-blue-500" />
              {w.label}
            </label>
          ))}
        </div>
        {fieldMessage("weekdays")}
      </fieldset>

      <fieldset>
        <legend className="block text-xs font-medium text-gray-600 mb-1">Rythme</legend>
        <div className="flex flex-wrap gap-4">
          {([1, 2] as const).map((n) => (
            <label key={n} htmlFor={`${id}-every-${n}`} className="inline-flex items-center gap-2 min-h-11 text-sm text-gray-800">
              <input id={`${id}-every-${n}`} type="radio" name={`${id}-every`} checked={everyWeeks === n} onChange={() => setEveryWeeks(n)} className="h-4 w-4 border-gray-300 text-blue-600 focus:ring-2 focus:ring-blue-500" />
              {n === 1 ? "Chaque semaine" : "Une semaine sur deux"}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div>
          <label htmlFor={fieldId("startTime")} className={labelClass("startTime")}>Début <span aria-hidden="true">*</span></label>
          <input id={fieldId("startTime")} type="text" inputMode="numeric" placeholder="HH:MM" value={startTime} required aria-invalid={flagged("startTime") || undefined} aria-describedby={describedBy("startTime", timeHintId, ...(issue?.field === "startTime" && attempted ? [problemId] : []))} onChange={(e) => setStartTime(e.target.value)} onBlur={(e) => setStartTime(normalizeTime(e.target.value))} className={fieldClass("startTime")} />
          {fieldMessage("startTime")}
        </div>
        <div>
          <label htmlFor={fieldId("endTime")} className={labelClass("endTime")}>Fin <span aria-hidden="true">*</span></label>
          <input id={fieldId("endTime")} type="text" inputMode="numeric" placeholder="HH:MM" value={endTime} required aria-invalid={invalid("endTime") || undefined} aria-describedby={describedBy("endTime", timeHintId)} onChange={(e) => setEndTime(e.target.value)} onBlur={(e) => setEndTime(normalizeTime(e.target.value))} className={fieldClass("endTime")} />
          {fieldMessage("endTime")}
        </div>
        <p id={timeHintId} className="sm:col-span-3 -mt-2 text-[11px] text-gray-600 sm:order-last">Format HH:MM, par exemple 14:00.</p>
        <div>
          <label htmlFor={`${id}-slot`} className="block text-xs font-medium text-gray-600 mb-1">Découpage</label>
          <select id={`${id}-slot`} value={slotChoice} onChange={(e) => setSlotChoice(Number(e.target.value))} className="input">
            {SLOT_OPTIONS.map((m) => <option key={m} value={m}>{m === WHOLE_RANGE ? "Un créneau sur toute la plage" : `Créneaux de ${fmtDuration(m)}`}</option>)}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label htmlFor={fieldId("capacity")} className={labelClass("capacity")}>Personnes par créneau <span aria-hidden="true">*</span></label>
          <input id={fieldId("capacity")} type="number" min={1} required value={capacity} aria-invalid={invalid("capacity") || undefined} aria-describedby={describedBy("capacity")} onChange={(e) => setCapacity(e.target.value === "" ? "" : Number(e.target.value))} className={fieldClass("capacity")} />
          {fieldMessage("capacity")}
        </div>
        <div>
          <label htmlFor={`${id}-holidays`} className="block text-xs font-medium text-gray-600 mb-1">Jours fériés exclus</label>
          <select id={`${id}-holidays`} value={holidays} aria-describedby={`${id}-holidays-hint`} onChange={(e) => setHolidays(e.target.value as HolidayCalendar)} className="input">
            {HOLIDAY_CALENDARS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
          <p id={`${id}-holidays-hint`} className="text-[11px] text-gray-600 mt-1">Les jours fériés propres à un canton ou à une région s&apos;ajoutent dans les fermetures.</p>
        </div>
      </div>

      <div>
        <label htmlFor={`${id}-closure`} className="block text-xs font-medium text-gray-600 mb-1">Fermetures (vacances, jours sans permanence)</label>
        <div className="flex flex-wrap gap-2 items-center">
          <input ref={closureInputRef} id={`${id}-closure`} aria-invalid={(attempted && issue?.field === "closures") || undefined} aria-describedby={attempted && issue?.field === "closures" ? problemId : undefined} type="date" min={from || eventStart} max={until || eventEnd} value={closureDraft} onChange={(e) => setClosureDraft(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addClosure() } }} className="input max-w-[12rem]" />
          <button type="button" onClick={addClosure} className="min-h-11 px-3 rounded-xl border border-gray-400 text-sm text-gray-800 hover:bg-gray-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600">
            Ajouter la date
          </button>
        </div>
        <p aria-live="polite" className="sr-only">{closureNote}</p>
        {closures.length > 0 && (
          <ul aria-label="Fermetures" className="mt-2 flex flex-wrap gap-2">
            {closures.map((d) => (
              <li key={d} className="inline-flex items-center gap-1 rounded-full bg-gray-100 pl-3 text-sm text-gray-800">
                {fmtDay(d)}
                <button type="button" onClick={() => removeClosure(d)} aria-label={`Retirer la fermeture du ${fmtDay(d)}`} className="min-h-11 min-w-11 rounded-full text-gray-700 hover:text-gray-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600">
                  <span aria-hidden="true">×</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2 min-h-11">
          <input id={`${id}-waitlist`} type="checkbox" checked={waitlistEnabled} onChange={(e) => setWaitlistEnabled(e.target.checked)} className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-2 focus:ring-blue-500" />
          <label htmlFor={`${id}-waitlist`} className="text-xs font-medium text-gray-600 select-none">Activer la liste d&apos;attente</label>
        </div>
        <div className="flex items-center gap-2 min-h-11">
          <input id={`${id}-approval`} type="checkbox" checked={requiresApproval} onChange={(e) => setRequiresApproval(e.target.checked)} className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-2 focus:ring-blue-500" />
          <label htmlFor={`${id}-approval`} className="text-xs font-medium text-gray-600 select-none">Sur validation (chaque inscription est une demande à accepter ou refuser)</label>
        </div>
      </div>

      {/* Preview: only the one-line summary is live; the lists would be re-read at each keystroke. */}
      <div className="rounded-xl bg-gray-50 border border-gray-200 p-3 text-sm space-y-2">
        <p id={summaryId} tabIndex={-1} className={`focus:outline-none ${!complete ? "text-gray-600" : problem ? "text-red-700" : "font-medium text-gray-800"}`}>{summary}</p>
        <p aria-live="polite" aria-atomic="true" className="sr-only">{liveSummary}</p>
        {days.length > 0 && (
          <div>
            <p id={`${id}-created`} className="text-xs font-medium text-gray-700">Dates créées</p>
            <ul aria-labelledby={`${id}-created`} className="mt-1 grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-0.5 text-gray-700">
              {days.slice(0, PREVIEW_DATES).map((d) => <li key={d}>{fmtDay(d)}</li>)}
            </ul>
            {days.length > PREVIEW_DATES && <p className="text-xs text-gray-700 mt-1">… et {days.length - PREVIEW_DATES} autre{days.length - PREVIEW_DATES > 1 ? "s" : ""}, jusqu&apos;au {fmtDay(days[days.length - 1])}.</p>}
          </div>
        )}
        {preview && preview.skipped.length > 0 && (
          <div>
            <p id={`${id}-skipped`} className="text-xs font-medium text-gray-700">Dates exclues</p>
            <ul aria-labelledby={`${id}-skipped`} className="mt-1 space-y-0.5 text-gray-700">
              {preview.skipped.map((s) => <li key={s.date}>{fmtDay(s.date)} : {s.reason}</li>)}
            </ul>
          </div>
        )}
      </div>

      {error && <p role="alert" className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700">{error}</p>}
      {attempted && complete && problem && (
        <p id={problemId} role="alert" className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700">{problem}</p>
      )}
      {attempted && !complete && (
        <p className="text-xs text-red-700">À compléter : {missingFields.map((f) => FIELD_NOUNS[f]).join(", ")}.</p>
      )}

      <div className="flex gap-3 flex-wrap">
        <button type="button" onClick={handleCreate} aria-disabled={saving || undefined} aria-describedby={summaryId} className="min-h-11 bg-blue-600 text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-blue-700 aria-disabled:cursor-wait focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600">
          {saving ? "Création…" : shiftCount > 0 ? `Créer ${shiftCount} créneau${shiftCount > 1 ? "x" : ""}` : "Créer les créneaux"}
        </button>
        <button type="button" onClick={onClose} className="min-h-11 text-gray-600 px-3 py-2 text-sm hover:text-gray-900 rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600">
          Annuler
        </button>
      </div>
    </section>
  )
}
