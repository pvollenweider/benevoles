"use client"

// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { useEffect, useId, useRef, useState } from "react"
import { requestJson } from "@/lib/use-submit"
import { KNOWN_ROLES } from "@/lib/roles"
import { fmtRange, resolveNewShiftDisplayOrder } from "@/lib/gantt-utils"
import { fmtLongDate as fmtDate, normalizeTime } from "@/lib/shifts-admin"
import { isValidClock } from "@/lib/shift-time"
import { describeSeries, generateShiftSeries, seriesProblem, SERIES_MAX_BREAK_MINUTES, SERIES_MIN_SLOT_MINUTES, type SeriesSlot } from "@/lib/shift-series"
import type { AdminShift } from "./AdminDayTimeline"

const SLOT_OPTIONS = [30, 45, 60, 90, 120, 180, 240]

type Props = {
  /** Id for the opener's `aria-controls`. */
  panelId?: string
  eventId: string
  /** Days of the event, "YYYY-MM-DD". */
  dates: string[]
  existingShifts: { roleName: string; displayOrder: number }[]
  onCreated: (shifts: AdminShift[]) => void
  onClose: () => void
}

/**
 * « Créer une série de créneaux » (#393): one role, one day, a time range and a shift length give
 * several shifts at once, previewed before they're created. Same generator as the API.
 */
export default function ShiftSeriesForm({ panelId, eventId, dates, existingShifts, onCreated, onClose }: Props) {
  const id = useId()
  const headingRef = useRef<HTMLHeadingElement>(null)
  const [roleName, setRoleName] = useState("")
  const [label, setLabel] = useState("")
  const [date, setDate] = useState(dates.length === 1 ? dates[0] : "")
  const [startTime, setStartTime] = useState("")
  const [endTime, setEndTime] = useState("")
  const [slotMinutes, setSlotMinutes] = useState(120)
  const [breakMinutes, setBreakMinutes] = useState(0)
  const [capacity, setCapacity] = useState(2)
  const [waitlistEnabled, setWaitlistEnabled] = useState(false)
  const [requiresApproval, setRequiresApproval] = useState(false)
  const [attempted, setAttempted] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => { headingRef.current?.focus() }, [])

  const missing = {
    roleName: !roleName.trim(),
    date: !date,
    startTime: !isValidClock(startTime),
    endTime: !isValidClock(endTime),
  }
  const complete = !Object.values(missing).some(Boolean)
  const problem = complete ? seriesProblem({ date, startTime, endTime, slotMinutes, breakMinutes }) : null
  const slots: SeriesSlot[] = complete && !problem ? generateShiftSeries({ date, startTime, endTime, slotMinutes, breakMinutes }) : []

  async function handleCreate() {
    setAttempted(true)
    if (!complete || problem || slots.length === 0 || saving) return
    setSaving(true)
    setError(null)
    const outcome = await requestJson<(AdminShift & { date: string })[]>(() => fetch("/api/admin/shifts/series", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        eventId, roleName: roleName.trim(), label: label.trim() || undefined, date, startTime, endTime,
        slotMinutes, breakMinutes, capacity: Number(capacity), waitlistEnabled, requiresApproval,
        displayOrder: resolveNewShiftDisplayOrder(existingShifts, roleName.trim(), 0),
      }),
    }), "Erreur lors de la création.")
    setSaving(false)
    if (!outcome.ok) {
      setError(outcome.error)
      return
    }
    onCreated(outcome.data.map((s) => ({ ...s, date: s.date.split("T")[0], registrationCount: 0 })))
  }

  const missingNames = [missing.roleName && "poste", missing.date && "date", missing.startTime && "début", missing.endTime && "fin"].filter(Boolean)
  const fieldClass = (bad: boolean) => `input ${attempted && bad ? "!border-red-600" : ""}`
  const labelClass = (bad: boolean) => `block text-xs font-medium mb-1 ${attempted && bad ? "text-red-700" : "text-gray-600"}`
  const summaryId = `${id}-summary`
  const errorId = `${id}-error`

  return (
    <section id={panelId} aria-labelledby={`${id}-title`} className="bg-white rounded-2xl border border-blue-200 p-5 space-y-4">
      <div>
        <h3 id={`${id}-title`} ref={headingRef} tabIndex={-1} className="font-semibold text-gray-800 focus:outline-none">
          Créer une série de créneaux
        </h3>
        <p className="text-xs text-gray-600 mt-0.5">
          Un poste, une plage horaire et une durée : les créneaux sont créés d&apos;un coup, puis modifiables un par un.
          Les champs marqués d&apos;un astérisque (*) sont obligatoires.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label htmlFor={`${id}-role`} className={labelClass(missing.roleName)}>Poste *</label>
          <input
            id={`${id}-role`} type="text" list={`${id}-roles`} value={roleName} required
            aria-invalid={attempted && missing.roleName ? true : undefined}
            onChange={(e) => setRoleName(e.target.value)} placeholder="ex. Buvette" className={fieldClass(missing.roleName)}
          />
          <datalist id={`${id}-roles`}>{KNOWN_ROLES.map((r) => <option key={r} value={r} />)}</datalist>
        </div>
        <div>
          <label htmlFor={`${id}-label`} className="block text-xs font-medium text-gray-600 mb-1">Libellé</label>
          <input id={`${id}-label`} type="text" value={label} onChange={(e) => setLabel(e.target.value)} placeholder={roleName || "ex. Bar principal"} className="input" />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div>
          <label htmlFor={`${id}-date`} className={labelClass(missing.date)}>Date *</label>
          {dates.length === 1 ? (
            <input id={`${id}-date`} type="text" readOnly value={fmtDate(dates[0])} className="input bg-gray-50 text-gray-700" />
          ) : (
            <select id={`${id}-date`} value={date} required aria-invalid={attempted && missing.date ? true : undefined} onChange={(e) => setDate(e.target.value)} className={fieldClass(missing.date)}>
              <option value="">— choisir —</option>
              {dates.map((d) => <option key={d} value={d}>{fmtDate(d)}</option>)}
            </select>
          )}
        </div>
        <div>
          <label htmlFor={`${id}-start`} className={labelClass(missing.startTime)}>Début *</label>
          <input
            id={`${id}-start`} type="text" inputMode="numeric" placeholder="HH:MM" value={startTime} required
            aria-invalid={attempted && missing.startTime ? true : undefined}
            onChange={(e) => setStartTime(e.target.value)}
            onBlur={(e) => setStartTime(normalizeTime(e.target.value))}
            className={fieldClass(missing.startTime)}
          />
        </div>
        <div>
          <label htmlFor={`${id}-end`} className={labelClass(missing.endTime)}>Fin *</label>
          <input
            id={`${id}-end`} type="text" inputMode="numeric" placeholder="HH:MM" value={endTime} required
            aria-invalid={attempted && missing.endTime ? true : undefined}
            aria-describedby={`${id}-end-hint`}
            onChange={(e) => setEndTime(e.target.value)}
            onBlur={(e) => setEndTime(normalizeTime(e.target.value))}
            className={fieldClass(missing.endTime)}
          />
          <p id={`${id}-end-hint`} className="text-[11px] text-gray-600 mt-1">Une fin plus petite que le début passe minuit (22:00 à 02:00).</p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div>
          <label htmlFor={`${id}-slot`} className="block text-xs font-medium text-gray-600 mb-1">Durée d&apos;un créneau *</label>
          <select id={`${id}-slot`} value={SLOT_OPTIONS.includes(slotMinutes) ? slotMinutes : "custom"} onChange={(e) => { if (e.target.value !== "custom") setSlotMinutes(Number(e.target.value)) }} className="input">
            {SLOT_OPTIONS.map((m) => <option key={m} value={m}>{m < 60 ? `${m} min` : m % 60 === 0 ? `${m / 60} h` : `${Math.floor(m / 60)} h ${m % 60}`}</option>)}
            {!SLOT_OPTIONS.includes(slotMinutes) && <option value="custom">{slotMinutes} min</option>}
          </select>
        </div>
        <div>
          <label htmlFor={`${id}-slot-min`} className="block text-xs font-medium text-gray-600 mb-1">Durée personnalisée (minutes)</label>
          <input
            id={`${id}-slot-min`} type="number" min={SERIES_MIN_SLOT_MINUTES} step={5} value={slotMinutes}
            aria-describedby={`${id}-slot-min-hint`}
            aria-invalid={slotMinutes < SERIES_MIN_SLOT_MINUTES ? true : undefined}
            onChange={(e) => setSlotMinutes(Number(e.target.value))} className="input"
          />
          <p id={`${id}-slot-min-hint`} className="text-[11px] text-gray-600 mt-1">Même valeur que la durée choisie à gauche.</p>
        </div>
        <div>
          <label htmlFor={`${id}-break`} className="block text-xs font-medium text-gray-600 mb-1">Pause entre deux créneaux (min)</label>
          <input id={`${id}-break`} type="number" min={0} max={SERIES_MAX_BREAK_MINUTES} step={5} value={breakMinutes} onChange={(e) => setBreakMinutes(Number(e.target.value))} className="input" />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-end">
        <div>
          <label htmlFor={`${id}-capacity`} className="block text-xs font-medium text-gray-600 mb-1">Personnes par créneau *</label>
          <input id={`${id}-capacity`} type="number" min={1} value={capacity} aria-invalid={capacity < 1 ? true : undefined} onChange={(e) => setCapacity(Number(e.target.value))} className="input" />
        </div>
        <div className="flex items-center gap-2 min-h-11">
          <input id={`${id}-waitlist`} type="checkbox" checked={waitlistEnabled} onChange={(e) => setWaitlistEnabled(e.target.checked)} className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-2 focus:ring-blue-500" />
          <label htmlFor={`${id}-waitlist`} className="text-xs font-medium text-gray-600 select-none">Activer la liste d&apos;attente</label>
        </div>
        <div className="min-h-11">
          <div className="flex items-center gap-2">
            <input id={`${id}-approval`} type="checkbox" checked={requiresApproval} onChange={(e) => setRequiresApproval(e.target.checked)} aria-describedby={`${id}-approval-hint`} className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-2 focus:ring-blue-500" />
            <label htmlFor={`${id}-approval`} className="text-xs font-medium text-gray-600 select-none">Sur validation (chaque inscription est une demande à accepter ou refuser)</label>
          </div>
          <p id={`${id}-approval-hint`} className="text-xs text-gray-600 mt-1 ml-6">Pour un poste sensible (conduite, caisse, sécurité). Une demande garde sa place jusqu&apos;à votre décision.</p>
        </div>
      </div>

      {/* Preview: what « Créer » will do. Only the one-line summary is live: the list would be
          re-read in full at every keystroke. */}
      <div className="rounded-xl bg-gray-50 border border-gray-200 p-3 text-sm">
        <p id={summaryId} aria-live="polite" aria-atomic="true" className={!complete ? "text-gray-600" : problem ? "text-red-700" : "font-medium text-gray-800"}>
          {!complete
            ? "Renseignez le poste, la date et les heures pour voir les créneaux."
            : problem ?? `Aperçu : ${describeSeries(slots)}, ${capacity} personne${capacity > 1 ? "s" : ""} par créneau.`}
        </p>
        {slots.length > 0 && (
          <>
            <ol aria-label="Créneaux qui seront créés" className="mt-2 grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-1 text-gray-700 tabular-nums">
              {slots.map((s, i) => (
                <li key={i}>
                  {fmtRange(s.startTime, s.endTime)}
                  {s.date !== date && <span className="text-xs text-gray-600"> (lendemain)</span>}
                </li>
              ))}
            </ol>
          </>
        )}
      </div>

      {error && <p id={errorId} role="alert" className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700">{error}</p>}
      {attempted && !complete && (
        <p role="alert" className="text-xs text-red-700">Champs obligatoires manquants : {missingNames.join(", ")}.</p>
      )}

      <div className="flex gap-3">
        <button
          type="button" onClick={handleCreate} aria-disabled={saving || undefined} aria-describedby={summaryId}
          className="bg-blue-600 text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-blue-700 aria-disabled:cursor-wait focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
        >
          {saving ? "Création…" : slots.length > 0 ? `Créer ${slots.length} créneau${slots.length > 1 ? "x" : ""}` : "Créer les créneaux"}
        </button>
        <button type="button" onClick={onClose} className="text-gray-600 px-3 py-2 text-sm hover:text-gray-900 rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600">
          Annuler
        </button>
      </div>
    </section>
  )
}
