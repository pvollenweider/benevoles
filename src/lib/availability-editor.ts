// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { AVAILABILITY_MAX_RANGES_PER_DAY, nextDate, type AvailabilityErrorAt, type DayAnswerInput, type Voice } from "./event-availability"
import { dayLabel } from "./spoken-time"
import { fmtHour } from "./registrations-list"

/**
 * The form of the dated availability (#1146), shared by the page of the person asked (« tu ») and
 * the organisers' correction (« vous »). Pure, for the component and its tests. Per date: no choice
 * yet (never answered: nothing is sent for it, « sans réponse »), « Disponible à certaines heures »
 * with its ranges (« horaires » on screen), or « Pas disponible ». Choosing « Pas disponible » keeps
 * the ranges typed, so choosing « Disponible » again brings them back (accessibility review).
 */

/** The one word for a date or a person with no answer yet, on every screen (independent review). */
export const NO_ANSWER = "sans réponse"
export const AVAILABLE_CHOICE_LABEL = "Disponible à certaines heures"
export const UNAVAILABLE_CHOICE_LABEL = "Pas disponible"

/** French quotes keep their words on the same line: « x » with non-breaking spaces inside. */
export function nbspQuotes(text: string): string {
  return text.replace(/« /g, "«\u00a0").replace(/ »/g, "\u00a0»")
}

export type EditorRange = { key: number; start: string; end: string }
export type EditorDay = { date: string; choice: "available" | "unavailable" | null; ranges: EditorRange[] }
export type EditorState = { days: EditorDay[]; nextKey: number }
export type { Voice }

type StoredLike = { date: string; ranges: { startTime: string; endTime: string }[] }

/** The form for the event's dates, from what is stored. */
export function editorFrom(dates: readonly string[], stored: readonly StoredLike[]): EditorState {
  const byDate = new Map(stored.map((d) => [d.date, d]))
  let key = 0
  const days = dates.map((date): EditorDay => {
    const s = byDate.get(date)
    if (!s) return { date, choice: null, ranges: [] }
    if (s.ranges.length === 0) return { date, choice: "unavailable", ranges: [] }
    return { date, choice: "available", ranges: s.ranges.map((r) => ({ key: key++, start: r.startTime, end: r.endTime })) }
  })
  return { days, nextKey: key }
}

function update(state: EditorState, date: string, fn: (d: EditorDay, s: EditorState) => EditorDay): EditorState {
  let next = state
  const days = state.days.map((d) => {
    if (d.date !== date) return d
    const out = fn(d, state)
    if (out.ranges.some((r) => r.key >= next.nextKey)) next = { ...next, nextKey: Math.max(...out.ranges.map((r) => r.key)) + 1 }
    return out
  })
  return { ...next, days }
}

/** Choosing « Disponible » on a date without a range adds an empty one. */
export function chooseDay(state: EditorState, date: string, choice: "available" | "unavailable"): EditorState {
  return update(state, date, (d, s) => ({ ...d, choice, ranges: choice === "available" && d.ranges.length === 0 ? [{ key: s.nextKey, start: "", end: "" }] : d.ranges }))
}

export function addRange(state: EditorState, date: string): EditorState {
  return update(state, date, (d, s) => (d.ranges.length >= AVAILABILITY_MAX_RANGES_PER_DAY ? d : { ...d, ranges: [...d.ranges, { key: s.nextKey, start: "", end: "" }] }))
}

export function removeRange(state: EditorState, date: string, key: number): EditorState {
  return update(state, date, (d) => ({ ...d, ranges: d.ranges.filter((r) => r.key !== key) }))
}

export function setRangeTime(state: EditorState, date: string, key: number, field: "start" | "end", value: string): EditorState {
  return update(state, date, (d) => ({ ...d, ranges: d.ranges.map((r) => (r.key === key ? { ...r, [field]: value } : r)) }))
}

/** « Pas disponible pendant tout l'événement »: every date, ranges kept in the form. */
export function allUnavailable(state: EditorState): EditorState {
  return { ...state, days: state.days.map((d) => ({ ...d, choice: "unavailable" })) }
}

export type EditorError = { message: string; at: AvailabilityErrorAt }

const lower = (s: string) => s.charAt(0).toLowerCase() + s.slice(1)

/**
 * What is sent: the dates with a choice, in order; an unanswered date is left out (stays « sans
 * réponse »). Checked first in the browser for what needs no server: every time left empty, all
 * at once (independent review: never one round per error), in the order of the page.
 */
export function editorSubmission(state: EditorState, voice: Voice): { ok: true; days: DayAnswerInput[] } | { ok: false; errors: EditorError[] } {
  const days: DayAnswerInput[] = []
  const errors: EditorError[] = []
  const verb = voice === "tu" ? "Indique" : "Indiquez"
  for (const d of state.days) {
    if (!d.choice) continue
    if (d.choice === "unavailable") { days.push({ date: d.date, ranges: [] }); continue }
    for (const [i, r] of d.ranges.entries()) {
      for (const field of ["start", "end"] as const) {
        if (!r[field]) {
          const what = field === "start" ? "l'heure de début" : "l'heure de fin"
          const which = d.ranges.length > 1 ? `de l'horaire ${i + 1} ` : ""
          errors.push({ message: `${verb} ${what} ${which}du ${lower(dayLabel(d.date))}.`, at: { date: d.date, range: i, field } })
        }
      }
    }
    days.push({ date: d.date, ranges: d.ranges.map((r) => ({ start: r.start, end: r.end })) })
  }
  if (errors.length > 0) return { ok: false, errors }
  if (days.length === 0) {
    const message = voice === "tu" ? "Choisis au moins une date : « Disponible à certaines heures » ou « Pas disponible »." : "Choisissez au moins une date : « Disponible à certaines heures » ou « Pas disponible »."
    return { ok: false, errors: [{ message: nbspQuotes(message), at: { date: state.days[0]?.date ?? "" } }] }
  }
  return { ok: true, days }
}

/** The form's answer in a comparable form: what would be sent, date by date. */
function signature(state: EditorState): string {
  return state.days.map((d) => `${d.date}:${d.choice ?? "-"}:${d.choice === "available" ? d.ranges.map((r) => `${r.start}-${r.end}`).join(",") : ""}`).join(";")
}

/** Whether the form says something else than what was last saved (« Changements non enregistrés »). */
export function editorDirty(state: EditorState, saved: EditorState): boolean {
  return signature(state) !== signature(saved)
}

/** The date answered just before `date` in the form, whose hours can be copied; null for the first. */
export function previousDay(state: EditorState, date: string): EditorDay | null {
  const i = state.days.findIndex((d) => d.date === date)
  return i > 0 ? state.days[i - 1] : null
}

/**
 * « Reprendre les horaires du … »: the date takes the previous date's choice and hours (replacing
 * its own); nothing when the previous date has no choice yet.
 */
export function copyPreviousDay(state: EditorState, date: string): EditorState {
  const prev = previousDay(state, date)
  if (!prev?.choice) return state
  return update(state, date, (d, s) => ({
    ...d,
    choice: prev.choice,
    ranges: prev.choice === "available" ? prev.ranges.map((r, i) => ({ key: s.nextKey + i, start: r.start, end: r.end })) : d.ranges,
  }))
}

/** What a copy did, said after it (« Horaires du jeudi 9 juillet repris pour le vendredi 10 juillet : 2 horaires. »). */
export function copiedText(from: EditorDay, to: string): string {
  const what = from.choice === "unavailable" ? "« Pas disponible »" : `${from.ranges.length} horaire${from.ranges.length > 1 ? "s" : ""}`
  return nbspQuotes(`${from.choice === "unavailable" ? "Réponse" : "Horaires"} du ${lower(dayLabel(from.date))} ${from.choice === "unavailable" ? "reprise" : "repris"} pour le ${lower(dayLabel(to))} : ${what}.`)
}

/** Whether a range ends the next morning (an end earlier than its start). */
export function endsNextDay(r: { start: string; end: string }): boolean {
  return !!r.start && !!r.end && r.end < r.start
}

/** « se termine le lendemain, dimanche 12 juillet », the hint of the « Fin » field. */
export function nextDayHint(date: string): string {
  return `se termine le lendemain, ${lower(dayLabel(nextDate(date)))}`
}

/** One date in words, for the read-only list and the organisers: « disponible de 9h à 12h et de 20h à 3h le lendemain ». */
export function dayAnswerText(day: StoredLike | undefined): string {
  if (!day) return NO_ANSWER
  if (day.ranges.length === 0) return "pas disponible"
  const parts = day.ranges.map((r) => `de ${fmtHour(r.startTime)} à ${fmtHour(r.endTime)}${r.endTime < r.startTime ? " le lendemain" : ""}`)
  return `disponible ${parts.length > 1 ? `${parts.slice(0, -1).join(", ")} et ${parts[parts.length - 1]}` : parts[0]}`
}

/** « 3 dates sur 11 ». */
export function datesCountText(answered: number, total: number): string {
  return `${answered} date${answered > 1 ? "s" : ""} sur ${total}`
}

/** Ids of the fields, so an error can point at one. */
export function rangeFieldId(prefix: string, date: string, index: number, field: "start" | "end"): string {
  return `${prefix}-${date}-${index}-${field}`
}
export function dayGroupId(prefix: string, date: string): string {
  return `${prefix}-${date}`
}
