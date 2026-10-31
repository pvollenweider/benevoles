// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { availabilityAckKey, FIT_LABELS, fitDetail, shiftFit, shiftInterval, type AnswerForFit, type FitState } from "./availability-assist"
import { reviewReasonTexts, reviewReasons, REVIEW_PUBLISHED } from "./availability-correction"
import { blockingMarker, currentStampFor, draftReviewState, draftShiftTerms, judgeDraftBatch, type BatchPerson, type BatchShift, type DraftProblem } from "./draft-assignments"
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
export type BoardDraft = { id: string; revision: number; shiftId: string; volunteerId: string; source: string; shiftTerms: string; availabilityStamp: string; ackKey: string | null; locked?: boolean }
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
  /** The registration of a confirmed or pending mission (its « Voir l'inscription » link). */
  registrationId?: string
  name: string
  /** « HH:MM », for the order in the cell. */
  startTime: string
  /** « de 10h à 14h », « de 22h à 2h, jusqu'au lendemain ». */
  time: string
  /** Against the person's answer; null when they were never asked. */
  fit: FitState | null
  fitLabel: string | null
  fitDetail: string
  /**
   * A mission (confirmed or pending) of a person whose answer changed after a publication, now
   * outside it (independent review, P1 #4): « À revoir : … ». Read from the flag and the current
   * answer, so it may also be a mission acknowledged outside before (Codex: « actuellement »).
   */
  review: string | null
  draft?: {
    id: string
    revision: number
    source: string
    /** Locked (#1172): a new proposal never replaces it. */
    locked: boolean
    /** The shift or the answer changed since the review. */
    stale: boolean
    staleText: string | null
    /** Outside declared availability: the acknowledgement the organiser must tick (the current key). */
    ackKey: string | null
    acked: boolean
    /** What would refuse its publication, besides the workload protection (on the row): full sentences (the dialog). */
    problems: string[]
    /** The same, short, for the cell: « Bloque la publication : places ». */
    markers: string[]
  }
}

export type BoardCell = { date: string; availability: string; availabilityKind: "unknown" | "unavailable" | "ranges"; items: BoardItem[] }

export type BoardRow = {
  volunteerId: string
  firstName: string
  lastName: string
  sameNameHint: string | null
  /** Whether the person has an email address (the publication's confirmation counts those without). */
  hasEmail: boolean
  reviewTexts: string[]
  /** Flagged « modifiées après la publication »: the revision « Marquer comme vu » clears it at. */
  seenRevision: number | null
  committedMinutes: number
  draftMinutes: number
  cells: BoardCell[]
  /** The workload protection on every pending draft at once, and the person's own refusals. */
  findings: string[]
  /** The same, short, for the « Résumé » column; the sentences are in the summary. */
  markers: string[]
  /** Problems on the row and its drafts: none, the person's drafts can be published. */
  problemCount: number
}

/** « 3 places à pourvoir », « 1 place à pourvoir », « Rien à pourvoir »: what a date still misses after the drafts. */
export const placesToFillText = (n: number) => (n === 0 ? "Rien à pourvoir" : `${n} ${n > 1 ? "places à pourvoir" : "place à pourvoir"}`)

/** A shift of a date that still misses people once the drafts are published. */
export type CoverageShift = { shiftId: string; name: string; time: string; missing: number }
export type DayCoverage = { date: string; missing: number; shifts: CoverageShift[] }

/** A mission to look at again after a correction (« À revoir »), for the summary's links. */
export type ReviewMission = { volunteerId: string; date: string; name: string; time: string }

export type BoardSummary = {
  drafts: number
  people: number
  stale: number
  ackMissing: number
  /** People with a pending draft and no email: the publication tells them nothing. */
  withoutEmail: number
  /** `date`: the day a problem is about (its shift's), for the summary's link. */
  problems: (DraftProblem & { anchor: string | null; date: string | null })[]
  /** Missions now outside a corrected answer (after a publication). */
  toReview: ReviewMission[]
  /** Per date, in the board's order: places still missing after the drafts. */
  coverage: DayCoverage[]
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
  type Found = { message: string; marker: string }
  const add = (map: Map<string, Found[]>, key: string, p: DraftProblem) => map.set(key, [...(map.get(key) ?? []), { message: p.message, marker: blockingMarker(p.code) }])
  const problemsOfDraft = new Map<string, Found[]>()
  const problemsOfPerson = new Map<string, Found[]>()
  const problemsOfShift = new Map<string, Found[]>()
  for (const p of verdict.problems) {
    // In the cell, a stale review and a missing acknowledgement have their own short words.
    if (p.draftId) { if (!CELL_WORDED.has(p.code)) add(problemsOfDraft, p.draftId, p) }
    else if (p.volunteerId) add(problemsOfPerson, p.volunteerId, p)
    else if (p.shiftId) add(problemsOfShift, p.shiftId, p)
  }

  // Columns: the event's dates, and any other date a mission or a draft falls on.
  const dateSet = new Set(availability.dates)
  for (const p of input.people) for (const h of p.held) dateSet.add(day(h.shift.date))
  for (const d of pending) { const s = input.shifts.get(d.shiftId); if (s) dateSet.add(day(s.date)) }
  const dates = [...dateSet].sort()

  const summaryProblems: BoardSummary["problems"] = verdict.problems.map((p) => {
    const s = p.shiftId ? input.shifts.get(p.shiftId) : undefined
    return { ...p, anchor: p.volunteerId && s ? cellAnchor(p.volunteerId, day(s.date)) : null, date: s ? day(s.date) : null }
  })
  const toReview: ReviewMission[] = []
  let stale = 0, ackMissing = 0

  const rows: BoardRow[] = input.people.map((person) => {
    const committed = person.held.filter((h) => (h.status === "active" || h.status === "requested") && h.shift.status !== "cancelled")
    const drafts = pending.filter((d) => d.volunteerId === person.id)
    const flagged = reviewReasons(person.reviewReason).includes(REVIEW_PUBLISHED)
    const items = new Map<string, BoardItem[]>()
    const push = (date: string, item: BoardItem) => items.set(date, [...(items.get(date) ?? []), item])
    const fitOf = (s: BoardShift) => {
      if (!person.answer) return { fit: null, fitLabel: null, fitDetail: "", outside: false }
      const f = shiftFit(shiftInterval(s, availability.timeZone), person.answer, availability.dates, availability.timeZone)
      return { fit: f.state, fitLabel: FIT_LABELS[f.state], fitDetail: fitDetail(f), outside: f.needsAck }
    }
    for (const h of committed) {
      const { outside, ...fit } = fitOf(h.shift as BoardShift)
      const review = flagged && outside ? "À revoir : actuellement en dehors de ses disponibilités corrigées." : null
      const name = shiftName(h.shift), time = spokenTimeRange(h.shift.startTime, h.shift.endTime)
      if (review) toReview.push({ volunteerId: person.id, date: day(h.shift.date), name, time })
      push(day(h.shift.date), { kind: h.status === "active" ? "confirmed" : "pending", shiftId: h.shift.id, registrationId: h.id, name, startTime: h.shift.startTime, time, ...fit, review })
    }
    for (const d of drafts) {
      const s = input.shifts.get(d.shiftId)
      if (!s) continue
      const review = draftReviewState(d, { shiftTerms: draftShiftTerms(s), availabilityStamp: currentStampFor(d.availabilityStamp, person.answer, s, availability.timeZone) })
      const ackKey = currentAckKey(input.eventId, person.id, s, person.answer, availability)
      const acked = !!ackKey && d.ackKey === ackKey
      if (review.stale) stale++
      else if (ackKey && !acked) ackMissing++
      const found = [...(problemsOfDraft.get(d.id) ?? []), ...(problemsOfShift.get(s.id) ?? [])]
      const { fit: state, fitLabel, fitDetail: detail } = fitOf(s)
      push(day(s.date), {
        kind: "draft", shiftId: s.id, name: shiftName(s), startTime: s.startTime, time: spokenTimeRange(s.startTime, s.endTime), fit: state, fitLabel, fitDetail: detail, review: null,
        draft: {
          id: d.id, revision: d.revision, source: d.source, locked: !!d.locked, stale: review.stale,
          staleText: review.shiftChanged ? "À revoir : le créneau a changé depuis le brouillon." : review.availabilityChanged ? "À revoir : ses disponibilités de ces heures ont changé depuis le brouillon." : null,
          ackKey, acked,
          problems: found.map((f) => f.message),
          markers: [...new Set(found.map((f) => f.marker))],
        },
      })
    }
    // In time order: « 9h » before « 14h » (never the words, which sort « de 14h » first).
    for (const list of items.values()) list.sort((a, b) => a.startTime.localeCompare(b.startTime) || a.name.localeCompare(b.name, "fr"))

    // Hours: committed and drafts apart, each counted once even when shifts overlap.
    const minutes = (shifts: BoardShift[]) => Math.round(unionLength(shifts.map((s) => shiftInterval(s, availability.timeZone))) / MIN)
    const draftShifts = drafts.flatMap((d) => input.shifts.get(d.shiftId) ?? [])
    const own = problemsOfPerson.get(person.id) ?? []
    const findings = own.map((f) => f.message)
    const markers = own.map((f) => f.marker)
    const usable = verdict.usable.get(person.id) ?? []
    if (usable.length > 0) {
      const w = judgeDutyChange(input.gate, committed.map((h) => duty(h.shift as BoardShift)), { add: usable.map((u) => duty(input.shifts.get(u.shift.id)!)) }, { birthDate: person.birthDate, personal: person.personal })
      if (!w.ok) {
        const body = workloadRefusalBody(w, "Avec tous ses brouillons, ce programme ne respecterait plus les pauses et limites de charge :")
        findings.push(...body.workload)
        markers.push(blockingMarker("workload"))
        summaryProblems.push({ code: "workload", volunteerId: person.id, message: `${person.firstName} ${person.lastName} : ${body.workload[0]}`, short: body.workload[0], details: body.workload, anchor: `row-${person.id}`, date: null })
      }
    }
    const cells = dates.map((date) => {
      const a = availabilityWords(person.answer, date)
      return { date, availability: a.text, availabilityKind: a.kind, items: items.get(date) ?? [] }
    })
    const problemCount = findings.length + cells.reduce((n, c) => n + c.items.reduce((m, i) => m + (i.draft?.problems.length ?? 0), 0), 0)
    return {
      volunteerId: person.id, firstName: person.firstName, lastName: person.lastName, sameNameHint: person.sameNameHint,
      hasEmail: !!person.email?.trim(),
      reviewTexts: reviewReasonTexts(person.reviewReason),
      seenRevision: person.reviewReason && person.answer ? person.answer.revision : null,
      committedMinutes: minutes(committed.map((h) => h.shift as BoardShift)), draftMinutes: minutes(draftShifts),
      cells, findings, markers: [...new Set(markers)], problemCount,
    }
  }).sort((a, b) => a.lastName.localeCompare(b.lastName, "fr") || a.firstName.localeCompare(b.firstName, "fr") || (a.volunteerId < b.volunteerId ? -1 : 1))

  // Coverage per date (PRODUCT.md capability 4): what each live shift still misses once every
  // pending draft is published, summed per shift so an overfull shift never hides a missing one.
  const draftsOn = new Map<string, number>()
  for (const d of pending) draftsOn.set(d.shiftId, (draftsOn.get(d.shiftId) ?? 0) + 1)
  const coverage: DayCoverage[] = dates.map((date) => {
    const shifts = [...input.shifts.values()]
      .filter((s) => day(s.date) === date && s.status !== "cancelled")
      .sort((a, b) => a.startTime.localeCompare(b.startTime) || shiftName(a).localeCompare(shiftName(b), "fr"))
      .map((s) => ({ shiftId: s.id, name: shiftName(s), time: spokenTimeRange(s.startTime, s.endTime), missing: Math.max(0, s.capacity - s.occupied - (draftsOn.get(s.id) ?? 0)) }))
      .filter((s) => s.missing > 0)
    return { date, missing: shifts.reduce((n, s) => n + s.missing, 0), shifts }
  })
  const draftPeople = new Set(pending.map((d) => d.volunteerId))

  return {
    dates,
    rows,
    summary: {
      drafts: pending.length,
      people: draftPeople.size,
      stale, ackMissing,
      withoutEmail: rows.filter((r) => draftPeople.has(r.volunteerId) && !r.hasEmail).length,
      problems: summaryProblems,
      toReview: toReview.sort((a, b) => a.date.localeCompare(b.date)),
      coverage,
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
  /** Other people's pending drafts on the shift (they hold no place until published). */
  drafted: number
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
  /** Pending drafts per shift, everyone's (the person's own are left out of `drafted`). */
  draftsOn?: ReadonlyMap<string, number>
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
        drafted: Math.max(0, (input.draftsOn?.get(s.id) ?? 0) - (mine.some((d) => d.shiftId === s.id) ? 1 : 0)),
        fit: fit?.state ?? null, fitLabel: fit ? FIT_LABELS[fit.state] : null, fitDetail: fit ? fitDetail(fit) : "",
        ackKey: currentAckKey(input.eventId, person.id, s, person.answer, input.availability),
        taken,
        workload: w.ok ? [] : workloadRefusalBody(w, "").workload,
      }
    })
}
