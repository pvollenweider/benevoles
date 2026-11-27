// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { crossesMidnight, fmtRange, toMin, toMinEnd } from "./gantt-utils"
import { shiftsOverlap } from "./utils"
import { answerConditionMention } from "./role-answer"
import { shiftsClash } from "./shift-overlap"
import { unionLength } from "./interval-union"

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
  /** Reserved to an answer (#962). */
  reservedAnswer?: { questionLabel: string; answers: string[] } | null
  /** Its role may overlap another shift (#986). */
  overlapAllowed?: boolean
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
  /** « Réponse requise : Permis de conduire, Oui » (#962), or null. */
  answerMention: string | null
  /** The shift's day and hours as given, for the overlap rule (src/lib/shift-overlap.ts). */
  date: string
  startTime: string
  endTime: string
  /** Its role may overlap another shift (#986): an overlap with it is accepted. */
  overlapAllowed: boolean
  /** Minutes from an arbitrary origin, for ordering and gaps. */
  startAbs: number
  endAbs: number
}

export type Gap =
  | { kind: "overlap"; minutes: number }
  /** Overlap the event allows (#1467): a warning, never a refusal. */
  | { kind: "allowed_overlap"; minutes: number }
  /** Overlap the sign-up accepts: one of the two roles is cumulable (#986). */
  | { kind: "parallel"; minutes: number }
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
        answerMention: s.reservedAnswer ? answerConditionMention(s.reservedAnswer.questionLabel, s.reservedAnswer.answers) : null,
        date: s.date,
        startTime: s.startTime,
        endTime: s.endTime,
        overlapAllowed: s.overlapAllowed ?? false,
        startAbs: d * DAY + toMin(s.startTime),
        endAbs: d * DAY + toMinEnd(s.endTime, s.startTime),
      }
    })
    .sort((a, b) => a.startAbs - b.startAbs || a.name.localeCompare(b.name, "fr"))
}

/** What separates shift `i` from shift `i + 1`: null after the last one. */
export function gapAfter(sorted: RecapShift[], i: number, eventOverlapsAllowed = false): Gap | null {
  const a = sorted[i]
  const b = sorted[i + 1]
  if (!b) return null
  if (b.startAbs < a.endAbs) {
    const minutes = Math.min(a.endAbs, b.endAbs) - b.startAbs
    if (shiftsClash(a, b, eventOverlapsAllowed)) return { kind: "overlap", minutes }
    return { kind: eventOverlapsAllowed ? "allowed_overlap" : "parallel", minutes }
  }
  const gap = b.startAbs - a.endAbs
  if (gap === 0) return { kind: "back_to_back" }
  // A night between them isn't a « pause »: the next shift starts on a later calendar day.
  if (Math.floor(b.startAbs / DAY) > Math.floor((a.endAbs - 1) / DAY)) return { kind: "other_day" }
  return { kind: "break", minutes: gap }
}

export function gapLabel(g: Gap): string | null {
  switch (g.kind) {
    case "overlap": return `Ces deux créneaux se chevauchent de ${fmtDuration(g.minutes)} : l'inscription sera refusée.`
    case "allowed_overlap": return `En même temps que le créneau suivant pendant ${fmtDuration(g.minutes)}.`
    case "parallel": return `En même temps que le créneau suivant pendant ${fmtDuration(g.minutes)} : c'est possible, l'un des deux postes se cumule avec un autre créneau.`
    case "back_to_back": return "Enchaîné avec le suivant, sans pause."
    case "break": return `Pause de ${fmtDuration(g.minutes)} avant le suivant.`
    case "other_day": return null
  }
}

/**
 * Whether two of the shifts overlap in a way the sign-up refuses: any pair, not only neighbours, and
 * neither of a cumulable role (#986, src/lib/shift-overlap.ts).
 */
export function hasOverlap(sorted: RecapShift[], eventOverlapsAllowed = false): boolean {
  if (eventOverlapsAllowed) return false
  return sorted.some((a, i) => sorted.slice(i + 1).some((b) => shiftsClash(a, b)))
}

/** A shift the volunteer already holds, for the recap's overlap warning (#1467). */
export type RecapHeldShift = {
  id?: string
  label?: string
  roleName?: string
  date: Date | string
  startTime: string
  endTime: string
}

/** One overlap the event allows (#1467): between two picked shifts, or with one already held. */
export type AllowedOverlapNotice =
  | { kind: "picked"; minutes: number; names: [string, string] }
  | { kind: "held"; minutes: number; label: string }

const overlapMinutes = (a: { date: Date | string; startTime: string; endTime: string }, b: { date: Date | string; startTime: string; endTime: string }) => {
  const start = (s: typeof a) => dayIndex(typeof s.date === "string" ? s.date : s.date.toISOString()) * DAY + toMin(s.startTime)
  const end = (s: typeof a) => dayIndex(typeof s.date === "string" ? s.date : s.date.toISOString()) * DAY + toMinEnd(s.endTime, s.startTime)
  return Math.max(0, Math.min(end(a), end(b)) - Math.max(start(a), start(b)))
}

const heldName = (s: RecapHeldShift) => (s.label && s.label !== s.roleName ? `${s.roleName} · ${s.label}` : s.roleName ?? s.label ?? "")

/**
 * Every overlap the event allows, among the picked shifts (not only neighbours) and with the
 * shifts the volunteer already holds, ordered by the picked shift. Empty when the event does not
 * allow overlaps. Pure.
 */
export function allowedOverlapNotices(sorted: RecapShift[], held: RecapHeldShift[] = []): AllowedOverlapNotice[] {
  if (sorted.length === 0) return []
  const out: AllowedOverlapNotice[] = []
  for (let i = 0; i < sorted.length; i++) {
    for (let j = i + 1; j < sorted.length; j++) {
      if (shiftsOverlap(sorted[i], sorted[j])) out.push({ kind: "picked", minutes: overlapMinutes(sorted[i], sorted[j]), names: [sorted[i].name, sorted[j].name] })
    }
    for (const h of held) {
      if (shiftsOverlap(sorted[i], h)) out.push({ kind: "held", minutes: overlapMinutes(sorted[i], h), label: heldName(h) })
    }
  }
  return out
}

/**
 * What the volunteer is asked to do about allowed overlaps (#1467), said once in the block however
 * many overlaps there are: a recap that repeats it per pair is not read.
 */
export const ALLOWED_OVERLAP_ADVICE = "Tu peux quand même t'inscrire. Vérifie que tu peux faire les deux. Si quelqu'un te remplace, dis-le à l'organisation."

/** One allowed overlap as a short fact (#1467), naming the shifts, without the advice. */
export function allowedOverlapFact(n: AllowedOverlapNotice): string {
  const during = `pendant ${fmtDuration(n.minutes)}`
  if (n.kind === "held") return `Un de ces créneaux a lieu en même temps que ton créneau « ${n.label} » ${during}.`
  const [a, b] = n.names
  return a === b
    ? `Deux créneaux « ${a} » ont lieu en même temps ${during}.`
    : `« ${a} » et « ${b} » ont lieu en même temps ${during}.`
}

/** The personal data the form will send, worded for the volunteer. */
export function personalDataLines(opts: { requirePhone: boolean; phoneGiven: boolean; needsBirthDate: boolean; commentGiven: boolean; answeredQuestions?: string[] }): string[] {
  const lines = ["prénom et nom", "adresse email"]
  if (opts.requirePhone || opts.phoneGiven) lines.push("numéro de téléphone")
  if (opts.needsBirthDate) lines.push("date de naissance (créneau avec âge minimum)")
  if (opts.commentGiven) lines.push("ton commentaire")
  // Custom questions answered (#483), by their label.
  for (const q of opts.answeredQuestions ?? []) lines.push(`ta réponse à « ${q} »`)
  return lines
}

/** « 2 créneaux, 5 h au total »: time on two shifts at once (a cumulable role, #986) counts once. */
export function totalLabel(sorted: RecapShift[]): string {
  const minutes = unionLength(sorted.map((s) => ({ start: s.startAbs, end: s.endAbs })))
  return `${sorted.length} créneau${sorted.length > 1 ? "x" : ""}, ${fmtDuration(minutes)} au total`
}
