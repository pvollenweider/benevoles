"use client"

// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { useId, useRef, useState } from "react"
import { flushSync } from "react-dom"
import { announce } from "@/lib/announce"
import { dayLabel } from "@/lib/spoken-time"
import { AVAILABILITY_MAX_RANGES_PER_DAY, type AvailabilityErrorAt, type DayAnswerInput } from "@/lib/event-availability"
import {
  AVAILABLE_CHOICE_LABEL, NO_ANSWER, UNAVAILABLE_CHOICE_LABEL,
  addRange, allUnavailable, chooseDay, copiedText, copyPreviousDay, dayGroupId, editorDirty, editorFrom, editorSubmission, endsNextDay, nbspQuotes, nextDayHint, previousDay,
  rangeFieldId, removeRange, setRangeTime,
  type EditorError, type EditorState, type Voice,
} from "@/lib/availability-editor"

export type SaveOutcome = { ok: true } | { ok: false; error: string; at?: AvailabilityErrorAt }

const focusRing = "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
const secondaryButton = `min-h-11 max-w-full break-words rounded-xl border border-gray-500 bg-white px-3 py-1.5 text-sm font-medium text-gray-900 hover:bg-gray-50 aria-disabled:opacity-60 aria-disabled:cursor-not-allowed ${focusRing}`
const lower = (s: string) => s.charAt(0).toLowerCase() + s.slice(1)

/** `server`: a refusal of the last save (an overlap names two dates): any edit may answer it. */
type FieldErrors = { id: string; date: string; message: string; server?: boolean }[]

/**
 * The form of the dated availability (#1146), shared by « Mes disponibilités » (« tu ») and the
 * organisers' correction (« vous »); rules in src/lib/availability-editor.ts. Accessibility reviews
 * (2026-10-29, independent review 2026-10-30): one fieldset per date with its heading and its
 * « (sans réponse) » state in the legend; native radios, both marked invalid when the date needs a
 * choice; real labels on the time fields, a « Fin » hint for a night range; every missing time found
 * at once, each next to its field, and from two of them a summary of links that takes the focus;
 * an edit clears the messages it answers; statuses in regions always mounted; buttons that stay on
 * screen (aria-disabled) with their reason; « Changements non enregistrés » next to the save button.
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
  const [saved, setSaved] = useState<EditorState>(() => editorFrom(dates, initialDays))
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>([])
  const [summary, setSummary] = useState(false)
  const [error, setError] = useState("")
  const [status, setStatus] = useState("")
  const [allStatus, setAllStatus] = useState("")
  const [dayStatus, setDayStatus] = useState<{ date: string; text: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const summaryHeading = useRef<HTMLHeadingElement>(null)
  const H = headingLevel === 2 ? "h2" : "h3"
  const tu = voice === "tu"
  const uid = useId()
  const dirtyId = `${idPrefix}-dirty`
  const allId = `${idPrefix}-all`
  const dirty = editorDirty(state, saved)

  function errorFieldId(at: AvailabilityErrorAt | undefined): string | null {
    if (!at?.date) return null
    if (at.range !== undefined && at.field) return rangeFieldId(idPrefix, at.date, at.range, at.field)
    return `${dayGroupId(idPrefix, at.date)}-first`
  }
  const errorOf = (id: string) => fieldErrors.find((e) => e.id === id) ?? null

  /** One error: on its field, which takes the focus. Two or more: the summary takes it. */
  function showErrors(list: EditorError[], server = false) {
    const onFields: FieldErrors = list.flatMap((e) => {
      const id = errorFieldId(e.at)
      return id ? [{ id, date: e.at.date, message: e.message, server }] : []
    })
    const many = onFields.length >= 2
    flushSync(() => { setFieldErrors(onFields); setSummary(many) })
    if (many) { summaryHeading.current?.focus(); return }
    const target = onFields[0] ? document.getElementById(onFields[0].id) : null
    target?.focus()
    // Read out once: by the focused field's description, or by this alert when no field has it.
    announce(setError, onFields.length === 0 ? list[0]?.message ?? "" : "")
  }

  /** A date changed: its errors, and every message about the last attempt, no longer apply. */
  function edited(date: string) {
    setFieldErrors((list) => (list.some((e) => e.date === date || e.server) ? list.filter((e) => e.date !== date && !e.server) : list))
    setError("")
    setStatus("")
    setAllStatus("")
  }

  async function submit() {
    if (busy) return
    setStatus("")
    setAllStatus("")
    const built = editorSubmission(state, voice)
    if (!built.ok) { showErrors(built.errors); return }
    setBusy(true)
    setError("")
    flushSync(() => { setFieldErrors([]); setSummary(false) })
    announce(setStatus, "Enregistrement en cours…")
    const outcome = await onSave(built.days).catch((): SaveOutcome => ({ ok: false, error: tu ? "La connexion a échoué : rien n'a été enregistré. Vérifie ta connexion, puis réessaie." : "La connexion a échoué : rien n'a été enregistré. Vérifiez votre connexion, puis réessayez." }))
    setBusy(false)
    if (!outcome.ok) { setStatus(""); showErrors([{ message: outcome.error, at: outcome.at ?? { date: "" } }], true); return }
    setSaved(state)
    announce(setStatus, savedText)
  }

  function focusAfterRemove(date: string, index: number, remaining: number) {
    const id = remaining === 0 ? `${dayGroupId(idPrefix, date)}-add` : rangeFieldId(idPrefix, date, Math.min(index, remaining - 1), "start")
    document.getElementById(id)?.focus()
  }

  const sayDay = (date: string, text: string) => announce((t) => setDayStatus(t ? { date, text: t } : null), text)

  return (
    <form className="space-y-4" noValidate onSubmit={(e) => { e.preventDefault(); void submit() }}>
      {summary && fieldErrors.length > 0 && (
        <div role="group" aria-labelledby={`${uid}-summary`} className="rounded-xl border border-red-200 bg-red-50 px-3 py-3 space-y-2">
          <H ref={summaryHeading} id={`${uid}-summary`} tabIndex={-1} className="text-sm font-semibold text-red-900 outline-none">
            {fieldErrors.length} point{fieldErrors.length > 1 ? "s" : ""} à corriger
          </H>
          <ul className="list-disc pl-5 space-y-1 text-sm text-red-900">
            {fieldErrors.map((e) => (
              <li key={e.id}>
                <a
                  href={`#${e.id}`}
                  onClick={(ev) => {
                    ev.preventDefault()
                    const el = document.getElementById(e.id)
                    el?.focus()
                    el?.scrollIntoView?.({ block: "center" })
                  }}
                  className={`underline underline-offset-2 rounded ${focusRing}`}
                >
                  {e.message}
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}

      {state.days.length > 1 && (
        <p className="text-sm">
          <a
            href={`#${allId}`}
            onClick={(ev) => { ev.preventDefault(); const el = document.getElementById(allId); el?.focus(); el?.scrollIntoView?.({ block: "center" }) }}
            className={`font-medium text-blue-700 underline underline-offset-2 hover:text-blue-900 rounded ${focusRing}`}
          >
            {tu ? "Tu ne peux pas venir du tout ?" : "La personne ne peut pas venir du tout ?"}
          </a>
        </p>
      )}

      <div className="divide-y divide-gray-200 border-y border-gray-200">
        {state.days.map((d, dayIndex) => {
          const groupId = dayGroupId(idPrefix, d.date)
          const label = dayLabel(d.date)
          const choiceError = errorOf(`${groupId}-first`)
          const prev = dayIndex > 0 ? previousDay(state, d.date) : null
          return (
            <div key={d.date} className="py-4">
              <fieldset id={groupId} className="min-w-0 space-y-2" data-availability-day={d.date}>
                <legend className="w-full">
                  <H className="text-sm font-semibold text-gray-900">{label}</H>
                  {!d.choice && <span className="block text-sm text-gray-700" data-availability-no-answer="1">({NO_ANSWER})</span>}
                </legend>
                {/* Offered once the previous date has an answer to copy (no row of unavailable buttons on a fresh page). */}
                {prev?.choice && (
                  <button
                    type="button"
                    onClick={() => {
                      setState((st) => copyPreviousDay(st, d.date))
                      edited(d.date)
                      sayDay(d.date, copiedText(prev, d.date))
                    }}
                    className={`min-h-11 text-left text-sm font-medium text-blue-700 underline underline-offset-2 hover:text-blue-900 rounded ${focusRing}`}
                  >
                    {prev.choice === "unavailable" ? "Reprendre la réponse du" : "Reprendre les horaires du"} {lower(dayLabel(prev.date))}
                  </button>
                )}
                <div className="flex flex-wrap gap-x-4 gap-y-1">
                  {(["available", "unavailable"] as const).map((choice, i) => (
                    <label key={choice} className="flex min-h-11 items-center gap-2 text-sm text-gray-900 cursor-pointer">
                      {/* Both radios carry the date's error (an ARIA 1.2 global state, read on a radio by NVDA, JAWS and VoiceOver), not only the first. */}
                      {/* eslint-disable-next-line jsx-a11y/role-supports-aria-props */}
                      <input
                        type="radio"
                        id={i === 0 ? `${groupId}-first` : undefined}
                        name={`${groupId}-choice`}
                        checked={d.choice === choice}
                        onChange={() => { setState((s) => chooseDay(s, d.date, choice)); edited(d.date) }}
                        aria-invalid={choiceError ? true : undefined}
                        aria-describedby={choiceError ? `${groupId}-error` : undefined}
                        className={`h-5 w-5 ${focusRing}`}
                      />
                      {choice === "available" ? AVAILABLE_CHOICE_LABEL : UNAVAILABLE_CHOICE_LABEL}
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
                          {d.ranges.length > 1 && <p className="text-sm font-medium text-gray-700">Horaire {i + 1}</p>}
                          <div className="flex flex-wrap items-end gap-3">
                            {(["start", "end"] as const).map((field) => {
                              const id = rangeFieldId(idPrefix, d.date, i, field)
                              const err = errorOf(id)
                              const describedBy = [field === "end" && night ? hintId : null, err ? `${id}-error` : null].filter(Boolean).join(" ") || undefined
                              return (
                                <div key={field} className="w-32">
                                  <label htmlFor={id} className="block text-sm text-gray-700">
                                    {field === "start" ? "Début" : "Fin"}
                                    <span className="sr-only">{` de l'horaire ${i + 1}, ${lower(label)}`}</span>
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
                          {night && <p id={hintId} className="text-sm text-gray-700">Fin : {nextDayHint(d.date)}</p>}
                          {(["start", "end"] as const).map((field) => {
                            const id = rangeFieldId(idPrefix, d.date, i, field)
                            const err = errorOf(id)
                            return err ? <p key={field} id={`${id}-error`} className="text-sm text-red-800">{err.message}</p> : null
                          })}
                          {d.ranges.length > 1 && (
                            <button
                              type="button"
                              onClick={() => {
                                const remaining = d.ranges.length - 1
                                flushSync(() => setState((s) => removeRange(s, d.date, r.key)))
                                focusAfterRemove(d.date, i, remaining)
                                edited(d.date)
                                sayDay(d.date, `Horaire ${i + 1} du ${lower(label)} retiré.`)
                              }}
                              className={`min-h-11 text-sm font-medium text-blue-700 underline underline-offset-2 hover:text-blue-900 rounded ${focusRing}`}
                            >
                              Retirer cet horaire<span className="sr-only">{` (horaire ${i + 1}, ${lower(label)})`}</span>
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
                        sayDay(d.date, `Horaire ${index + 1} ajouté le ${lower(label)}.`)
                      }}
                      className={secondaryButton}
                    >
                      Ajouter un autre horaire<span className="sr-only">{` le ${lower(label)}`}</span>
                    </button>
                    {d.ranges.length >= AVAILABILITY_MAX_RANGES_PER_DAY && <p id={`${groupId}-max`} className="text-sm text-gray-700">{AVAILABILITY_MAX_RANGES_PER_DAY} horaires au plus par date.</p>}
                  </div>
                )}
                {choiceError && <p id={`${groupId}-error`} className="text-sm text-red-800">{choiceError.message}</p>}
                {/* Always mounted, so a change that shows the hours is still read out. */}
                <p role="status" className="sr-only">{dayStatus?.date === d.date ? dayStatus.text : ""}</p>
              </fieldset>
            </div>
          )
        })}
      </div>

      {state.days.length > 1 && <div className="space-y-2">
        <H className="text-sm font-semibold text-gray-900">{tu ? "Je ne peux pas venir du tout" : "La personne ne peut pas venir du tout"}</H>
        <button
          type="button"
          id={allId}
          onClick={() => {
            setState((s) => allUnavailable(s))
            setFieldErrors([]); setSummary(false); setError(""); setStatus("")
            announce(setAllStatus, nbspQuotes(tu ? `Toutes les dates sont sur « Pas disponible ». Rien n'est encore enregistré : appuie sur « ${submitLabel} ».` : `Toutes les dates sont sur « Pas disponible ». Rien n'est encore enregistré : appuyez sur « ${submitLabel} ».`))
          }}
          className={secondaryButton}
          data-availability-all-unavailable="1"
        >
          Pas disponible pendant tout l&apos;événement
        </button>
        <p role="status" className={allStatus ? "text-sm text-gray-700" : "sr-only"}>{allStatus}</p>
      </div>}

      <p className="text-sm text-gray-700">{nbspQuotes(`Les dates laissées sans choix restent « ${NO_ANSWER} ».`)}</p>
      {/* Read out always; shown here only when no field carries the message already. */}
      <p role="alert" className={error && fieldErrors.length === 0 ? "text-sm text-red-800 bg-red-50 border border-red-200 px-3 py-2 rounded-lg" : "sr-only"}>{error}</p>
      <p role="status" className={status ? "text-sm text-green-800" : "sr-only"}>{status}</p>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <button
          type="submit"
          aria-disabled={busy || undefined}
          aria-describedby={dirty && !busy ? dirtyId : undefined}
          className={`min-h-11 w-full sm:w-auto break-words rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 aria-disabled:cursor-wait ${focusRing}`}
          data-availability-save="1"
        >
          {busy ? "Enregistrement…" : submitLabel}
        </button>
        {dirty && !busy && <p id={dirtyId} className="text-sm font-medium text-gray-900" data-availability-dirty="1">Changements non enregistrés</p>}
      </div>
    </form>
  )
}
