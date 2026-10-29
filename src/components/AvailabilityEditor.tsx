"use client"

// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { useRef, useState } from "react"
import { flushSync } from "react-dom"
import { announce } from "@/lib/announce"
import { dayLabel } from "@/lib/spoken-time"
import { AVAILABILITY_MAX_RANGES_PER_DAY, type AvailabilityErrorAt, type DayAnswerInput } from "@/lib/event-availability"
import {
  addRange, allUnavailable, chooseDay, dayGroupId, editorFrom, editorSubmission, endsNextDay, nextDayHint, rangeFieldId, removeRange, setRangeTime,
  type EditorState, type Voice,
} from "@/lib/availability-editor"

export type SaveOutcome = { ok: true } | { ok: false; error: string; at?: AvailabilityErrorAt }

const focusRing = "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
const lower = (s: string) => s.charAt(0).toLowerCase() + s.slice(1)

/**
 * The form of the dated availability (#1146), shared by « Mes disponibilités » (« tu ») and the
 * organisers' correction (« vous »); rules in src/lib/availability-editor.ts. Accessibility review
 * (2026-10-29): one fieldset per date with a heading in its legend, native radios (no choice shown
 * for a date never answered), real labels on the time fields, a « Fin » hint for a night range, the
 * error next to its field with focus moved there, statuses in regions always mounted, buttons that
 * stay on screen (aria-disabled) rather than vanish under focus.
 */
export default function AvailabilityEditor({ idPrefix, dates, initialDays, voice, submitLabel, savedText, onSave, headingLevel = 3 }: {
  idPrefix: string
  dates: string[]
  initialDays: { date: string; ranges: { startTime: string; endTime: string }[] }[]
  voice: Voice
  submitLabel: string
  savedText: string
  onSave: (days: DayAnswerInput[]) => Promise<SaveOutcome>
  headingLevel?: 2 | 3
}) {
  const [state, setState] = useState<EditorState>(() => editorFrom(dates, initialDays))
  const [fieldError, setFieldError] = useState<{ id: string; message: string } | null>(null)
  const [error, setError] = useState("")
  const [status, setStatus] = useState("")
  const [allStatus, setAllStatus] = useState("")
  const [rangeStatus, setRangeStatus] = useState<{ date: string; text: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const submitRef = useRef<HTMLButtonElement>(null)
  const H = headingLevel === 2 ? "h2" : "h3"
  const tu = voice === "tu"

  function errorFieldId(at: AvailabilityErrorAt | undefined): string | null {
    if (!at?.date) return null
    if (at.range !== undefined && at.field) return rangeFieldId(idPrefix, at.date, at.range, at.field)
    return `${dayGroupId(idPrefix, at.date)}-first`
  }

  function showError(message: string, at?: AvailabilityErrorAt) {
    const id = errorFieldId(at)
    flushSync(() => setFieldError(id ? { id, message } : null))
    const target = id ? document.getElementById(id) : null
    if (target) target.focus()
    announce(setError, message)
  }

  /** A field changed: its error, or the error of its date, no longer applies. */
  function edited(date: string) {
    setFieldError((e) => (e && e.id.startsWith(`${dayGroupId(idPrefix, date)}-`) ? null : e))
  }

  async function submit() {
    if (busy) return
    setStatus("")
    const built = editorSubmission(state, voice)
    if (!built.ok) { showError(built.error.message, built.error.at); return }
    setBusy(true)
    setError("")
    announce(setStatus, "Enregistrement en cours…")
    const outcome = await onSave(built.days).catch((): SaveOutcome => ({ ok: false, error: tu ? "La connexion a échoué : rien n'a été enregistré. Réessaie." : "La connexion a échoué : rien n'a été enregistré. Réessayez." }))
    setBusy(false)
    if (!outcome.ok) { setStatus(""); showError(outcome.error, outcome.at); return }
    setFieldError(null)
    announce(setStatus, savedText)
  }

  function focusAfterRemove(date: string, index: number, remaining: number) {
    const id = remaining === 0 ? `${dayGroupId(idPrefix, date)}-add` : rangeFieldId(idPrefix, date, Math.min(index, remaining - 1), "start")
    document.getElementById(id)?.focus()
  }

  return (
    <form className="space-y-4" noValidate aria-busy={busy || undefined} onSubmit={(e) => { e.preventDefault(); void submit() }}>
      <div className="space-y-1">
        <button
          type="button"
          onClick={() => {
            setState((s) => allUnavailable(s))
            setFieldError(null)
            announce(setAllStatus, tu ? "Toutes les dates sont sur « Pas disponible ». Rien n'est encore enregistré : appuie sur « " + submitLabel + " »." : "Toutes les dates sont sur « Pas disponible ». Rien n'est encore enregistré : enregistrez la correction.")
          }}
          className={`min-h-11 rounded-xl border border-gray-500 bg-white px-4 py-2 text-sm font-medium text-gray-900 hover:bg-gray-50 ${focusRing}`}
          data-availability-all-unavailable="1"
        >
          Pas disponible pendant tout l&apos;événement
        </button>
        <p role="status" className={allStatus ? "text-sm text-gray-700" : "sr-only"}>{allStatus}</p>
      </div>

      {state.days.map((d) => {
        const groupId = dayGroupId(idPrefix, d.date)
        const label = dayLabel(d.date)
        return (
          <fieldset key={d.date} id={groupId} className="rounded-xl border border-gray-200 p-3 space-y-2" data-availability-day={d.date}>
            <legend className="px-1">
              <H className="text-sm font-semibold text-gray-900">
                {label}
                {!d.choice && <>{" · "}<span className="font-normal text-gray-700">pas encore répondu</span></>}
              </H>
            </legend>
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              {(["available", "unavailable"] as const).map((choice, i) => (
                <label key={choice} className="flex min-h-11 items-center gap-2 text-sm text-gray-900 cursor-pointer">
                  <input
                    type="radio"
                    id={i === 0 ? `${groupId}-first` : undefined}
                    name={`${groupId}-choice`}
                    checked={d.choice === choice}
                    onChange={() => { setState((s) => chooseDay(s, d.date, choice)); edited(d.date) }}
                    aria-invalid={fieldError?.id === `${groupId}-first` ? true : undefined}
                    aria-describedby={fieldError?.id === `${groupId}-first` ? `${groupId}-error` : undefined}
                    className={`h-5 w-5 ${focusRing}`}
                  />
                  {choice === "available" ? "Disponible sur des plages" : "Pas disponible"}
                </label>
              ))}
            </div>
            {d.choice === "available" && (
              <div className="space-y-3">
                {d.ranges.map((r, i) => {
                  const night = endsNextDay(r)
                  const hintId = `${rangeFieldId(idPrefix, d.date, i, "end")}-hint`
                  return (
                    <div key={r.key} className="space-y-1" data-availability-range={i}>
                      {d.ranges.length > 1 && <p className="text-xs font-medium text-gray-700">Plage {i + 1}</p>}
                      <div className="flex flex-wrap items-end gap-3">
                        {(["start", "end"] as const).map((field) => {
                          const id = rangeFieldId(idPrefix, d.date, i, field)
                          const err = fieldError?.id === id ? fieldError : null
                          const describedBy = [field === "end" && night ? hintId : null, err ? `${id}-error` : null].filter(Boolean).join(" ") || undefined
                          return (
                            <div key={field} className="w-32">
                              <label htmlFor={id} className="block text-xs text-gray-700">
                                {field === "start" ? "Début" : "Fin"}
                                <span className="sr-only">{` de la plage ${i + 1}, ${lower(label)}`}</span>
                              </label>
                              <input
                                id={id}
                                type="time"
                                value={r[field]}
                                onChange={(e) => { setState((s) => setRangeTime(s, d.date, r.key, field, e.target.value)); edited(d.date) }}
                                aria-invalid={err ? true : undefined}
                                aria-describedby={describedBy}
                                className="input w-full text-base"
                              />
                            </div>
                          )
                        })}
                      </div>
                      {night && <p id={hintId} className="text-xs text-gray-700">Fin : {nextDayHint(d.date)}</p>}
                      {(["start", "end"] as const).map((field) => {
                        const id = rangeFieldId(idPrefix, d.date, i, field)
                        return fieldError?.id === id ? <p key={field} id={`${id}-error`} className="text-sm text-red-800">{fieldError.message}</p> : null
                      })}
                      {d.ranges.length > 1 && (
                        <button
                          type="button"
                          onClick={() => {
                            const remaining = d.ranges.length - 1
                            flushSync(() => setState((s) => removeRange(s, d.date, r.key)))
                            focusAfterRemove(d.date, i, remaining)
                            edited(d.date)
                            announce((text) => setRangeStatus(text ? { date: d.date, text } : null), `Plage ${i + 1} du ${lower(label)} retirée.`)
                          }}
                          className={`min-h-11 text-sm font-medium text-blue-700 underline underline-offset-2 hover:text-blue-900 rounded ${focusRing}`}
                        >
                          Retirer cette plage<span className="sr-only">{` (plage ${i + 1}, ${lower(label)})`}</span>
                        </button>
                      )}
                    </div>
                  )
                })}
                <button
                  type="button"
                  id={`${groupId}-add`}
                  aria-disabled={d.ranges.length >= AVAILABILITY_MAX_RANGES_PER_DAY || undefined}
                  aria-describedby={d.ranges.length >= AVAILABILITY_MAX_RANGES_PER_DAY ? `${groupId}-max` : undefined}
                  onClick={() => {
                    if (d.ranges.length >= AVAILABILITY_MAX_RANGES_PER_DAY) return
                    const index = d.ranges.length
                    flushSync(() => setState((s) => addRange(s, d.date)))
                    document.getElementById(rangeFieldId(idPrefix, d.date, index, "start"))?.focus()
                    announce((text) => setRangeStatus(text ? { date: d.date, text } : null), `Plage ${index + 1} ajoutée le ${lower(label)}.`)
                  }}
                  className={`min-h-11 rounded-xl border border-gray-500 bg-white px-3 py-1.5 text-sm font-medium text-gray-900 hover:bg-gray-50 aria-disabled:opacity-60 aria-disabled:cursor-not-allowed ${focusRing}`}
                >
                  Ajouter une plage<span className="sr-only">{` le ${lower(label)}`}</span>
                </button>
                {d.ranges.length >= AVAILABILITY_MAX_RANGES_PER_DAY && <p id={`${groupId}-max`} className="text-xs text-gray-700">{AVAILABILITY_MAX_RANGES_PER_DAY} plages au plus par date.</p>}
                <p role="status" className="sr-only">{rangeStatus?.date === d.date ? rangeStatus.text : ""}</p>
              </div>
            )}
            {fieldError?.id === `${groupId}-first` && <p id={`${groupId}-error`} className="text-sm text-red-800">{fieldError.message}</p>}
          </fieldset>
        )
      })}

      <p className="text-sm text-gray-700">Les dates laissées sans choix restent « sans réponse ».</p>
      {/* Read out always; shown here only when no field carries the message already. */}
      <p role="alert" className={error && !fieldError ? "text-sm text-red-800 bg-red-50 border border-red-200 px-3 py-2 rounded-lg" : "sr-only"}>{error}</p>
      <p role="status" className={status ? "text-sm text-green-800" : "sr-only"}>{status}</p>
      <button
        ref={submitRef}
        type="submit"
        aria-disabled={busy || undefined}
        className={`min-h-11 w-full sm:w-auto rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 aria-disabled:cursor-wait ${focusRing}`}
        data-availability-save="1"
      >
        {busy ? "Enregistrement…" : submitLabel}
      </button>
    </form>
  )
}
