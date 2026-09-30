// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { crossesMidnight, fmtRange, toMin, toMinEnd } from "./gantt-utils"

/**
 * The recap shown before « Confirmer mon inscription » (#373): each selected shift with its day
 * and hours (« le lendemain » when it runs past midnight), what sits between two consecutive
 * shifts (overlap, back-to-back, or a break), firm sign-up or waitlist, age condition, and the
 * personal data that will reach the organization. Pure; the page renders the lines.
 */

export type RecapShiftInput = {
  id: string
  roleName: string
  label: string
  /** ISO date or "YYYY-MM-DD"; only the calendar day is used. */
  date: string
  startTime: string
  endTime: string
  status: string
  waitlistEnabled: boolean
  /** « Sur validation » (#484). Optional: older callers and previews may not send it. */
  requiresApproval?: boolean
  minAge: number | null
}

export type RecapShift = {
  id: string
  name: string
  dayLabel: string
  timeLabel: string
  /** Ends after midnight, i.e. the next calendar day. */
  endsNextDay: boolean
  waitlist: boolean
  /** A request for the organizer to accept, not a place (#484). Never true with `waitlist`. */
  request: boolean
  minAge: number | null
  /** Minutes from an arbitrary origin, for ordering and gaps. */
  startAbs: number
  endAbs: number
}

export type Gap =
  | { kind: "overlap"; minutes: number }
  | { kind: "back_to_back" }
  | { kind: "break"; minutes: number }
  | { kind: "other_day" }

const DAY = 1440
const dayIndex = (iso: string) => Math.floor(Date.parse(`${iso.slice(0, 10)}T00:00:00Z`) / 86_400_000)

export const isWaitlistShift = (s: { status: string; waitlistEnabled: boolean }) => s.status === "full" && s.waitlistEnabled

/** « Samedi 4 juillet » : only the first letter upper-cased, French typography for the rest. */
export function fmtDay(iso: string): string {
  const s = new Date(`${iso.slice(0, 10)}T00:00:00Z`).toLocaleDateString("fr-FR", { timeZone: "UTC", weekday: "long", day: "numeric", month: "long" })
  return s.charAt(0).toLocaleUpperCase("fr-FR") + s.slice(1)
}

export function fmtDuration(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h === 0) return `${m} min`
  return m === 0 ? `${h} h` : `${h} h ${String(m).padStart(2, "0")}`
}

/** Selected shifts in chronological order, ready to display. */
export function recapShifts(shifts: RecapShiftInput[]): RecapShift[] {
  return shifts
    .map((s) => {
      const d = dayIndex(s.date)
      return {
        id: s.id,
        name: s.label && s.label !== s.roleName ? `${s.roleName} · ${s.label}` : s.roleName,
        dayLabel: fmtDay(s.date),
        timeLabel: fmtRange(s.startTime, s.endTime),
        endsNextDay: crossesMidnight(s.startTime, s.endTime),
        waitlist: isWaitlistShift(s),
        request: !isWaitlistShift(s) && (s.requiresApproval ?? false),
        minAge: s.minAge,
        startAbs: d * DAY + toMin(s.startTime),
        endAbs: d * DAY + toMinEnd(s.endTime, s.startTime),
      }
    })
    .sort((a, b) => a.startAbs - b.startAbs || a.name.localeCompare(b.name, "fr"))
}

/** What separates shift `i` from shift `i + 1`: null after the last one. */
export function gapAfter(sorted: RecapShift[], i: number): Gap | null {
  const a = sorted[i]
  const b = sorted[i + 1]
  if (!b) return null
  if (b.startAbs < a.endAbs) return { kind: "overlap", minutes: Math.min(a.endAbs, b.endAbs) - b.startAbs }
  const gap = b.startAbs - a.endAbs
  if (gap === 0) return { kind: "back_to_back" }
  // A night between them isn't a « pause »: the next shift starts on a later calendar day.
  if (Math.floor(b.startAbs / DAY) > Math.floor((a.endAbs - 1) / DAY)) return { kind: "other_day" }
  return { kind: "break", minutes: gap }
}

export function gapLabel(g: Gap): string | null {
  switch (g.kind) {
    case "overlap": return `Ces deux créneaux se chevauchent de ${fmtDuration(g.minutes)} : l'inscription sera refusée.`
    case "back_to_back": return "Enchaîné avec le suivant, sans pause."
    case "break": return `Pause de ${fmtDuration(g.minutes)} avant le suivant.`
    case "other_day": return null
  }
}

export function hasOverlap(sorted: RecapShift[]): boolean {
  return sorted.some((_, i) => gapAfter(sorted, i)?.kind === "overlap")
}

/** The personal data the form will send, worded for the volunteer. */
export function personalDataLines(opts: { requirePhone: boolean; phoneGiven: boolean; needsBirthDate: boolean; commentGiven: boolean; answeredQuestions?: string[] }): string[] {
  const lines = ["prénom et nom", "adresse email"]
  if (opts.requirePhone || opts.phoneGiven) lines.push("numéro de téléphone")
  if (opts.needsBirthDate) lines.push("date de naissance (créneau avec âge minimum)")
  if (opts.commentGiven) lines.push("votre commentaire")
  // Custom questions answered (#483), by their label.
  for (const q of opts.answeredQuestions ?? []) lines.push(`votre réponse à « ${q} »`)
  return lines
}

/** « 2 créneaux, 5 h au total » */
export function totalLabel(sorted: RecapShift[]): string {
  const minutes = sorted.reduce((n, s) => n + (s.endAbs - s.startAbs), 0)
  return `${sorted.length} créneau${sorted.length > 1 ? "x" : ""}, ${fmtDuration(minutes)} au total`
}
