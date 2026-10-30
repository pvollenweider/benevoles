// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { availabilityAckKey, FIT_LABELS, fitDetail, shiftFit, shiftInterval, type AnswerForFit, type FitState } from "./availability-assist"
import { reviewReasonTexts } from "./availability-correction"
import { availabilityStamp, draftReviewState, draftShiftTerms, judgeDraftBatch, type BatchPerson, type BatchShift, type DraftProblem } from "./draft-assignments"
import { unionLength } from "./interval-union"
import { fmtHour } from "./registrations-list"
import { spokenTimeRange } from "./spoken-time"
import { judgeDutyChange, workloadRefusalBody, type WorkloadGate } from "./workload-guard"
import type { DutyShift, WorkloadPerson } from "./workload-policy"

/**
 * The review screen of draft assignments (#1146, lot C), « Affectations en brouillon »: one row per
 * person, one column per civil date of the event (in its availability zone, as the answers), like
 * the pilot's planning spreadsheet. A cell says the person's answer that date, their missions
 * (confirmed, waiting for validation) and their drafts, each with its availability and review state;
 * the row says their hours and what would stop a publication. Pure and Prisma-free (the page's
 * client component reads it); the server publishes with the same rules (src/lib/draft-assignments.ts).
 *
 * Workload inputs are kept apart (Codex, lot C): « engagé » (active and waiting for validation),
 * « brouillons » (pending drafts), and the projection after publishing every draft, which is what
 * the row's findings judge. Drafts never count as committed.
 */

export type BoardShift = BatchShift & { mealOnTheGo: boolean; placeId: string | null; placeName: string | null }
export type BoardMission = { registrationId: string; status: string; shift: BoardShift }
export type BoardDraft = { id: string; revision: number; shiftId: string; volunteerId: string; source: string; shiftTerms: string; availabilityStamp: string; ackKey: string | null }
export type BoardPerson = BatchPerson & { email: string | null; sameNameHint: string | null; reviewReason: string | null; personal?: WorkloadPerson["personal"] }

export type BoardInput = {
  eventId: string
  organizationId: string
  /** The organisation's zone (when a shift ends). */
  timeZone: string
  availability: { timeZone: string; dates: readonly string[] }
  now: Date
  gate: WorkloadGate
  shifts: ReadonlyMap<string, BoardShift>
  people: readonly BoardPerson[]
  drafts: readonly BoardDraft[]
  reserved: ReadonlyMap<string, string[]>
  limits: ReadonlyMap<string, number>
}

export type BoardItem = {
  kind: "confirmed" | "pending" | "draft"
  shiftId: string
  name: string
  /** « de 10h à 14h », « de 22h à 2h, jusqu'au lendemain ». */
  time: string
  /** Against the person's answer; null when they were never asked. */
  fit: FitState | null
  fitLabel: string | null
  fitDetail: string
  draft?: {
    id: string
    revision: number
    source: string
    /** The shift or the answer changed since the review. */
    stale: boolean
    staleText: string | null
    /** Outside declared availability: the acknowledgement the organiser must tick (the current key). */
    ackKey: string | null
    acked: boolean
    /** What would refuse its publication, besides the workload protection (on the row). */
    problems: string[]
  }
}

export type BoardCell = { date: string; availability: string; availabilityKind: "unknown" | "unavailable" | "ranges"; items: BoardItem[] }

export type BoardRow = {
  volunteerId: string
  firstName: string
  lastName: string
  sameNameHint: string | null
  reviewTexts: string[]
  committedMinutes: number
  draftMinutes: number
  cells: BoardCell[]
  /** The workload protection on every pending draft at once, and the person's own refusals. */
  findings: string[]
  /** Problems on the row and its drafts: none, the person's drafts can be published. */
  problemCount: number
}

export type BoardSummary = {
  drafts: number
  people: number
  stale: number
  ackMissing: number
  problems: (DraftProblem & { anchor: string | null })[]
  /** Every pending draft at the revision shown: what « Publier les affectations » sends. */
  selection: { id: string; revision: number }[]
}

export type Board = { dates: string[]; rows: BoardRow[]; summary: BoardSummary }

const MIN = 60_000
const CELL_WORDED = new Set<DraftProblem["code"]>(["shift_changed", "availability_changed", "ack_missing"])
const day = (d: Date | string) => (typeof d === "string" ? d.slice(0, 10) : d.toISOString().slice(0, 10))
const shiftName = (s: { roleName: string; label: string }) => (s.label && s.label !== s.roleName ? `${s.roleName} · ${s.label}` : s.roleName)
const duty = (s: BoardShift): DutyShift => ({ id: s.id, date: s.date, startTime: s.startTime, endTime: s.endTime, mealOnTheGo: s.mealOnTheGo, placeId: s.placeId, placeName: s.placeName })

/** The cell's id, for the summary's links: « cell-<person>-<date> ». */
export const cellAnchor = (volunteerId: string, date: string) => `cell-${volunteerId}-${date}`

/** « 9h à 12h, 20h à 3h le lendemain », « Pas disponible » or « Sans réponse », for one date. */
export function availabilityWords(answer: AnswerForFit | null, date: string): { text: string; kind: BoardCell["availabilityKind"] } {
  const d = answer?.days.find((x) => x.date === date)
  if (!d) return { text: "Sans réponse", kind: "unknown" }
  if (d.ranges.length === 0) return { text: "Pas disponible", kind: "unavailable" }
  return { text: `Libre ${d.ranges.map((r) => `de ${fmtHour(r.startTime)} à ${fmtHour(r.endTime)}${r.endTime <= r.startTime ? " le lendemain" : ""}`).join(", ")}`, kind: "ranges" }
}

/** The key an acknowledgement must carry now for this person and shift, or null when none is needed. */
export function currentAckKey(eventId: string, volunteerId: string, shift: BoardShift, answer: AnswerForFit | null, availability: BoardInput["availability"]): string | null {
  if (!answer) return null
  const interval = shiftInterval(shift, availability.timeZone)
  const fit = shiftFit(interval, answer, availability.dates, availability.timeZone)
  return fit.needsAck ? availabilityAckKey({ eventId, volunteerId, shiftId: shift.id, interval, requestId: answer.requestId, revision: answer.revision, timeZone: availability.timeZone }) : null
}

export function buildBoard(input: BoardInput): Board {
  const { availability } = input
  const pending = input.drafts
  const verdict = judgeDraftBatch({
    eventId: input.eventId, organizationId: input.organizationId, timeZone: input.timeZone, availability, now: input.now,
    drafts: pending, shifts: input.shifts, people: new Map(input.people.map((p) => [p.id, p])), reserved: input.reserved, limits: input.limits,
  })
  const problemsOfDraft = new Map<string, string[]>()
  const problemsOfPerson = new Map<string, string[]>()
  const problemsOfShift = new Map<string, string[]>()
  for (const p of verdict.problems) {
    // In the cell, a stale review and a missing acknowledgement have their own short words.
    if (p.draftId) { if (!CELL_WORDED.has(p.code)) problemsOfDraft.set(p.draftId, [...(problemsOfDraft.get(p.draftId) ?? []), p.message]) }
    else if (p.volunteerId) problemsOfPerson.set(p.volunteerId, [...(problemsOfPerson.get(p.volunteerId) ?? []), p.message])
    else if (p.shiftId) problemsOfShift.set(p.shiftId, [...(problemsOfShift.get(p.shiftId) ?? []), p.message])
  }

  // Columns: the event's dates, and any other date a mission or a draft falls on.
  const dateSet = new Set(availability.dates)
  for (const p of input.people) for (const h of p.held) dateSet.add(day(h.shift.date))
  for (const d of pending) { const s = input.shifts.get(d.shiftId); if (s) dateSet.add(day(s.date)) }
  const dates = [...dateSet].sort()

  const summaryProblems: BoardSummary["problems"] = verdict.problems.map((p) => {
    const s = p.shiftId ? input.shifts.get(p.shiftId) : undefined
    return { ...p, anchor: p.volunteerId && s ? cellAnchor(p.volunteerId, day(s.date)) : null }
  })
  let stale = 0, ackMissing = 0

  const rows: BoardRow[] = input.people.map((person) => {
    const committed = person.held.filter((h) => (h.status === "active" || h.status === "requested") && h.shift.status !== "cancelled")
    const drafts = pending.filter((d) => d.volunteerId === person.id)
    const stamp = availabilityStamp(person.answer)
    const items = new Map<string, BoardItem[]>()
    const push = (date: string, item: BoardItem) => items.set(date, [...(items.get(date) ?? []), item])
    const fitOf = (s: BoardShift) => {
      if (!person.answer) return { fit: null, fitLabel: null, fitDetail: "" }
      const f = shiftFit(shiftInterval(s, availability.timeZone), person.answer, availability.dates, availability.timeZone)
      return { fit: f.state, fitLabel: FIT_LABELS[f.state], fitDetail: fitDetail(f) }
    }
    for (const h of committed) {
      push(day(h.shift.date), { kind: h.status === "active" ? "confirmed" : "pending", shiftId: h.shift.id, name: shiftName(h.shift), time: spokenTimeRange(h.shift.startTime, h.shift.endTime), ...fitOf(h.shift as BoardShift) })
    }
    for (const d of drafts) {
      const s = input.shifts.get(d.shiftId)
      if (!s) continue
      const review = draftReviewState(d, { shiftTerms: draftShiftTerms(s), availabilityStamp: stamp })
      const ackKey = currentAckKey(input.eventId, person.id, s, person.answer, availability)
      const acked = !!ackKey && d.ackKey === ackKey
      if (review.stale) stale++
      else if (ackKey && !acked) ackMissing++
      push(day(s.date), {
        kind: "draft", shiftId: s.id, name: shiftName(s), time: spokenTimeRange(s.startTime, s.endTime), ...fitOf(s),
        draft: {
          id: d.id, revision: d.revision, source: d.source, stale: review.stale,
          staleText: review.shiftChanged ? "À revoir : le créneau a changé depuis le brouillon." : review.availabilityChanged ? "À revoir : les disponibilités ont changé depuis le brouillon." : null,
          ackKey, acked,
          problems: [...(problemsOfDraft.get(d.id) ?? []), ...(problemsOfShift.get(s.id) ?? [])],
        },
      })
    }
    for (const list of items.values()) list.sort((a, b) => a.time.localeCompare(b.time))

    // Hours: committed and drafts apart, each counted once even when shifts overlap.
    const minutes = (shifts: BoardShift[]) => Math.round(unionLength(shifts.map((s) => shiftInterval(s, availability.timeZone))) / MIN)
    const draftShifts = drafts.flatMap((d) => input.shifts.get(d.shiftId) ?? [])
    const findings = [...(problemsOfPerson.get(person.id) ?? [])]
    const usable = verdict.usable.get(person.id) ?? []
    if (usable.length > 0) {
      const w = judgeDutyChange(input.gate, committed.map((h) => duty(h.shift as BoardShift)), { add: usable.map((u) => duty(input.shifts.get(u.shift.id)!)) }, { birthDate: person.birthDate, personal: person.personal })
      if (!w.ok) {
        const body = workloadRefusalBody(w, "Avec tous ses brouillons, ce programme ne respecterait plus les pauses et limites de charge :")
        findings.push(...body.workload)
        summaryProblems.push({ code: "workload", volunteerId: person.id, message: `${person.firstName} ${person.lastName} : ${body.workload[0]}`, details: body.workload, anchor: `row-${person.id}` })
      }
    }
    const cells = dates.map((date) => {
      const a = availabilityWords(person.answer, date)
      return { date, availability: a.text, availabilityKind: a.kind, items: items.get(date) ?? [] }
    })
    const problemCount = findings.length + cells.reduce((n, c) => n + c.items.reduce((m, i) => m + (i.draft?.problems.length ?? 0), 0), 0)
    return {
      volunteerId: person.id, firstName: person.firstName, lastName: person.lastName, sameNameHint: person.sameNameHint,
      reviewTexts: reviewReasonTexts(person.reviewReason),
      committedMinutes: minutes(committed.map((h) => h.shift as BoardShift)), draftMinutes: minutes(draftShifts),
      cells, findings, problemCount,
    }
  }).sort((a, b) => a.lastName.localeCompare(b.lastName, "fr") || a.firstName.localeCompare(b.firstName, "fr") || (a.volunteerId < b.volunteerId ? -1 : 1))

  return {
    dates,
    rows,
    summary: {
      drafts: pending.length,
      people: new Set(pending.map((d) => d.volunteerId)).size,
      stale, ackMissing,
      problems: summaryProblems,
      selection: pending.map((d) => ({ id: d.id, revision: d.revision })),
    },
  }
}

// ── The cell's choice of shifts ───────────────────────────────────────────────────────────────

export type DraftOption = {
  shiftId: string
  name: string
  time: string
  occupied: number
  capacity: number
  fit: FitState | null
  fitLabel: string | null
  fitDetail: string
  /** Set when an acknowledgement is needed: the key to send with the draft. */
  ackKey: string | null
  /** Already registered (any live status), or already drafted: no button. */
  taken: "registered" | "draft" | null
  /** What the workload protection would say once published with every other draft (allowed as a draft). */
  workload: string[]
}

/** The shifts of one date the person could get a draft on, in time order. Pure. */
export function draftOptions(input: {
  eventId: string
  date: string
  person: BoardPerson
  drafts: readonly BoardDraft[]
  shifts: readonly BoardShift[]
  availability: BoardInput["availability"]
  gate: WorkloadGate
}): DraftOption[] {
  const { person } = input
  const live = person.held.filter((h) => ["active", "waiting", "offered", "requested"].includes(h.status))
  const committed = live.filter((h) => (h.status === "active" || h.status === "requested") && h.shift.status !== "cancelled")
  const mine = input.drafts.filter((d) => d.volunteerId === person.id)
  const byId = new Map(input.shifts.map((s) => [s.id, s]))
  const draftDuty = mine.flatMap((d) => (byId.get(d.shiftId) ? [duty(byId.get(d.shiftId)!)] : []))
  return input.shifts
    .filter((s) => day(s.date) === input.date && s.status !== "cancelled")
    .sort((a, b) => a.startTime.localeCompare(b.startTime) || shiftName(a).localeCompare(shiftName(b), "fr"))
    .map((s) => {
      const fit = person.answer ? shiftFit(shiftInterval(s, input.availability.timeZone), person.answer, input.availability.dates, input.availability.timeZone) : null
      const taken = live.some((h) => h.shift.id === s.id) ? "registered" as const : mine.some((d) => d.shiftId === s.id) ? "draft" as const : null
      const w = taken ? { ok: true as const } : judgeDutyChange(input.gate, committed.map((h) => duty(h.shift as BoardShift)), { add: [...draftDuty, duty(s)] }, { birthDate: person.birthDate, personal: person.personal })
      return {
        shiftId: s.id, name: shiftName(s), time: spokenTimeRange(s.startTime, s.endTime), occupied: s.occupied, capacity: s.capacity,
        fit: fit?.state ?? null, fitLabel: fit ? FIT_LABELS[fit.state] : null, fitDetail: fit ? fitDetail(fit) : "",
        ackKey: currentAckKey(input.eventId, person.id, s, person.answer, input.availability),
        taken,
        workload: w.ok ? [] : workloadRefusalBody(w, "").workload,
      }
    })
}
