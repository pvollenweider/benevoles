// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Consolidated answers to an event's custom questions (#686), e.g. how many t-shirts of each size
 * to order. Counting the stored answers would be wrong: an answer is kept once per volunteer and
 * event, also after the volunteer cancels. So the people counted are taken from the
 * registrations:
 * - « confirmés »: at least one confirmed registration (status "active") on the event, once each,
 *   whatever their number of shifts;
 * - « en attente »: no confirmed registration, but at least one on the waitlist, offered a spot or
 *   waiting for the organizer's approval, shown apart as a margin for the order;
 * - cancelled (or refused) only: not counted.
 * Archived questions are left out. Pure, no Prisma: also used by the print sheets.
 */
import { csvDocument } from "./data-export"
import { NO, YES } from "./event-questions"
import { fmtHour } from "./registrations-list"

export type SummaryQuestion = {
  id: string
  label: string
  type: string
  options: string[]
  archivedAt?: Date | string | null
  answers: { volunteerId: string; values: string[] }[]
}
export type SummaryRegistration = { volunteerId: string; status: string }

/** "option": a current choice; "removed": a choice no longer offered; "text": a group of short texts; "none": no answer. */
export type SummaryRowKind = "option" | "removed" | "text" | "none"
export type SummaryRow = { answer: string; kind: SummaryRowKind; confirmed: number; waiting: number }
export type QuestionSummary = { id: string; label: string; type: string; rows: SummaryRow[] }
export type AnswerSummary = { confirmedCount: number; waitingCount: number; questions: QuestionSummary[] }

const CONFIRMED_STATUSES = new Set(["active"])
/** Not a place yet, but likely to become one: the margin of an order. */
const WAITING_STATUSES = new Set(["waiting", "offered", "requested"])

export const NO_ANSWER = "Sans réponse"
export const REMOVED_SUFFIX = " (choix retiré)"

/** Trimmed, inner spaces collapsed, without accents nor case: « Végétarien » and « vegetarien » match. */
export function textKey(s: string): string {
  return s.trim().replace(/\s+/g, " ").normalize("NFD").replace(/\p{M}/gu, "").toLocaleLowerCase("fr")
}

/**
 * What to read of an event for the summary, as a Prisma `select` (plain object, no Prisma import):
 * the active questions with their answers, and the registrations that can count, on shifts that
 * still take place. Spread into an org-scoped `event.findFirst`.
 */
export const answerSummarySelect = {
  questions: {
    where: { archivedAt: null },
    orderBy: { position: "asc" as const },
    select: { id: true, label: true, type: true, options: true, archivedAt: true, answers: { select: { volunteerId: true, values: true } } },
  },
  registrations: {
    where: { status: { in: [...CONFIRMED_STATUSES, ...WAITING_STATUSES] }, shift: { status: { not: "cancelled" } } },
    select: { volunteerId: true, status: true },
  },
}

/** Each volunteer once: "confirmed" wins over "waiting"; volunteers with neither are left out. */
export function countedPeople(registrations: SummaryRegistration[]): Map<string, "confirmed" | "waiting"> {
  const people = new Map<string, "confirmed" | "waiting">()
  for (const r of registrations) {
    if (CONFIRMED_STATUSES.has(r.status)) people.set(r.volunteerId, "confirmed")
    else if (WAITING_STATUSES.has(r.status) && !people.has(r.volunteerId)) people.set(r.volunteerId, "waiting")
  }
  return people
}

/** How carefully a spelling is typed: its capitals and accents. */
const care = (s: string) => [...s].filter((c) => c !== textKey(c)).length

/**
 * The spelling shown for a group of short texts: the one most people typed; on a tie, the one with
 * the most capitals and accents (« Végétarien » over « vegetarien »), then alphabetical.
 */
function representative(spellings: Map<string, number>): string {
  return [...spellings.entries()]
    .sort(([a, na], [b, nb]) => nb - na || care(b) - care(a) || a.localeCompare(b, "fr"))[0][0]
}

type Tally = { confirmed: number; waiting: number }
const bump = (t: Tally, who: "confirmed" | "waiting") => { t[who] += 1 }

function summarizeQuestion(q: SummaryQuestion, people: Map<string, "confirmed" | "waiting">): QuestionSummary {
  const answers = new Map(q.answers.map((a) => [a.volunteerId, a.values.map((v) => v.trim()).filter(Boolean)]))
  const none: Tally = { confirmed: 0, waiting: 0 }
  let rows: SummaryRow[]

  if (q.type === "text") {
    const groups = new Map<string, Tally & { spellings: Map<string, number> }>()
    for (const [volunteerId, who] of people) {
      const value = answers.get(volunteerId)?.[0]
      if (!value) { bump(none, who); continue }
      const key = textKey(value)
      let g = groups.get(key)
      if (!g) { g = { confirmed: 0, waiting: 0, spellings: new Map() }; groups.set(key, g) }
      bump(g, who)
      const spelling = value.replace(/\s+/g, " ")
      g.spellings.set(spelling, (g.spellings.get(spelling) ?? 0) + 1)
    }
    // Independent of the order the database returns: ties are broken on the text itself.
    rows = [...groups.values()]
      .map((g) => ({ answer: representative(g.spellings), kind: "text" as const, confirmed: g.confirmed, waiting: g.waiting }))
      .sort((a, b) => b.confirmed - a.confirmed || b.waiting - a.waiting || a.answer.localeCompare(b.answer, "fr"))
  } else {
    const current = q.type === "yesno" ? [YES, NO] : q.options
    const tallies = new Map<string, Tally>(current.map((o) => [o, { confirmed: 0, waiting: 0 }]))
    const removed: string[] = []
    for (const [volunteerId, who] of people) {
      const values = answers.get(volunteerId) ?? []
      if (values.length === 0) { bump(none, who); continue }
      // A multiple choice counts each chosen option: the totals can exceed the number of people.
      for (const v of new Set(values)) {
        let t = tallies.get(v)
        if (!t) { t = { confirmed: 0, waiting: 0 }; tallies.set(v, t); removed.push(v) }
        bump(t, who)
      }
    }
    rows = [
      ...current.map((o) => ({ answer: o, kind: "option" as const, ...tallies.get(o)! })),
      // Options removed after somebody chose them: still counted, after the current ones.
      ...removed.sort((a, b) => a.localeCompare(b, "fr")).map((o) => ({ answer: o, kind: "removed" as const, ...tallies.get(o)! })),
    ]
  }
  rows.push({ answer: NO_ANSWER, kind: "none", ...none })
  return { id: q.id, label: q.label, type: q.type, rows }
}

export function answerSummary(questions: SummaryQuestion[], registrations: SummaryRegistration[]): AnswerSummary {
  const people = countedPeople(registrations)
  const counts = [...people.values()]
  return {
    confirmedCount: counts.filter((w) => w === "confirmed").length,
    waitingCount: counts.filter((w) => w === "waiting").length,
    questions: questions.filter((q) => !q.archivedAt).map((q) => summarizeQuestion(q, people)),
  }
}

/** An answer as shown and exported: a removed choice says so. */
export function rowLabel(row: SummaryRow): string {
  return row.kind === "removed" ? `${row.answer}${REMOVED_SUFFIX}` : row.answer
}

/** « 12 bénévoles confirmés » / « 1 bénévole confirmé ». */
export function confirmedLine(n: number): string {
  return `${n} bénévole${n > 1 ? "s" : ""} confirmé${n > 1 ? "s" : ""}`
}

/** « 3 en attente (liste d'attente ou demande à valider) », empty when nobody. */
export function waitingLine(n: number): string {
  return n > 0 ? `${n} en attente (liste d'attente ou demande à valider)` : ""
}

/**
 * « État au 5 octobre 2026 à 14h32 », in the organization's time zone (hours written like the rest of the app, fmtHour): registrations keep moving
 * until the order. Assembled from parts: locale output varies across runtimes.
 */
export function stateAt(d: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("fr-FR", { timeZone, day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(d)
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? ""
  return `État au ${get("day")} ${get("month")} ${get("year")} à ${fmtHour(`${get("hour")}:${get("minute")}`)}`
}

/** Under a multiple choice: why the counts can exceed the number of people. */
export const MULTIPLE_NOTE = "Plusieurs choix possibles : le total peut dépasser le nombre de bénévoles."

/** The summary as CSV, one line per answer, to send to a supplier as is. */
export function answerSummaryCsv(summary: AnswerSummary): string {
  return csvDocument(
    ["Question", "Réponse", "Confirmés", "En attente"],
    summary.questions.flatMap((q) => q.rows.map((r) => [q.label, rowLabel(r), r.confirmed, r.waiting])),
  )
}
