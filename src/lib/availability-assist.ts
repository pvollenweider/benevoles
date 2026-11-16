// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { nextDate } from "./event-availability"
import { judgeDutyChange, type WorkloadGate } from "./workload-guard"
import { dutyInterval, localParts, serviceDayOf, workloadFindingMessage, WORKLOAD_BIRTHDATE_REQUIRED, WORKLOAD_POLICY_INCOMPLETE, type DutyShift, type WorkloadPerson } from "./workload-policy"
import { newWorkloadNotices, type WorkloadMode } from "./workload-view"
import { mergeIntervals, unionLength, type Interval } from "./interval-union"
import { localDateTimeToUtc } from "./time-zone"
import { fmtDay, fmtDuration } from "./signup-recap"
import { reviewReasonTexts } from "./event-availability-text"
import { que } from "./french-elision"

/**
 * Assisted manual assignment (#1146, lot B): what an organiser sees before adding a person to a
 * shift on an event that collects dated availability (src/lib/event-availability.ts). The organiser
 * always decides; nothing here assigns anyone. Pure and Prisma-free: the per-shift page, the manual
 * add form and the server check read the same rules.
 *
 * Availability of a shift, minute by minute of its real interval (resolved in the event's frozen
 * availability zone):
 *   - covered: inside one of the person's ranges;
 *   - declared unavailable: not covered, and every event date whose ranges could reach that instant
 *     is answered. A range belongs to the date it starts on and lasts less than 24 h, so an instant
 *     of date D can only be covered by a range of D or of D-1 (« 20:00 → 03:00, lendemain »); dates
 *     outside the event have no range;
 *   - unknown: not covered, and one of those dates has no answer (or the person was never asked).
 * The four states: « full » (all covered), « partial » (some covered, some not), « outside »
 * (nothing covered, some declared unavailable) and « unknown » (nothing covered, nothing declared).
 * An acknowledgement is needed as soon as some minutes are declared unavailable (owner decision 6),
 * never for unknown minutes: unknown stays distinct from a refusal.
 */

const MIN = 60_000

export type FitState = "full" | "partial" | "unknown" | "outside"

export const FIT_LABELS: Record<FitState, string> = {
  full: "Disponible sur tout le créneau",
  partial: "Disponible sur une partie du créneau",
  unknown: "Sans réponse pour ces heures",
  outside: "Pas disponible à ces heures",
}

/** A person's stored answer, as read from AvailabilityRequest / Day / Range. */
export type AnswerForFit = {
  requestId: string
  revision: number
  days: { date: string; ranges: { startTime: string; endTime: string; startsAt: Date | string; endsAt: Date | string }[] }[]
}

export type ShiftFit = {
  state: FitState
  totalMinutes: number
  coveredMinutes: number
  outsideMinutes: number
  unknownMinutes: number
  /** Whether adding the person needs the organiser's explicit acknowledgement. */
  needsAck: boolean
  /** The ranges that share time with the shift, in time order, with the date each belongs to. */
  ranges: { date: string; startTime: string; endTime: string }[]
}

const prevDate = (date: string) => new Date(Date.parse(`${date}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10)

/** The instant date `date` starts at in `timeZone`. */
const midnight = (date: string, timeZone: string) => localDateTimeToUtc(new Date(`${date}T00:00:00Z`), "00:00", timeZone).getTime()

/** The real interval of a shift (an end at or before the start is the next morning), in `timeZone`. */
export function shiftInterval(s: Pick<DutyShift, "id" | "date" | "startTime" | "endTime">, timeZone: string): Interval {
  const d = dutyInterval({ id: s.id, date: s.date, startTime: s.startTime, endTime: s.endTime }, timeZone)
  return { start: d.start, end: d.end }
}

/** How a person's answer covers one shift interval. */
export function shiftFit(interval: Interval, answer: AnswerForFit | null, eventDates: readonly string[], timeZone: string): ShiftFit {
  const totalMinutes = Math.max(0, Math.round((interval.end - interval.start) / MIN))
  const events = new Set(eventDates)
  const answered = new Set((answer?.days ?? []).filter((d) => events.has(d.date)).map((d) => d.date))
  const touching = (answer?.days ?? [])
    .flatMap((d) => d.ranges.map((r) => ({ date: d.date, startTime: r.startTime, endTime: r.endTime, start: new Date(r.startsAt).getTime(), end: new Date(r.endsAt).getTime() })))
    .filter((r) => r.start < interval.end && r.end > interval.start)
    .sort((a, b) => a.start - b.start)
  const covered = mergeIntervals(touching.map((r) => ({ start: Math.max(r.start, interval.start), end: Math.min(r.end, interval.end) })))
  const coveredMinutes = Math.round(unionLength(covered) / MIN)

  // The gaps, each cut at local midnight: every piece lies within one civil date.
  let outsideMs = 0
  let unknownMs = 0
  let cursor = interval.start
  const gaps: Interval[] = []
  for (const c of covered) {
    if (c.start > cursor) gaps.push({ start: cursor, end: c.start })
    cursor = Math.max(cursor, c.end)
  }
  if (cursor < interval.end) gaps.push({ start: cursor, end: interval.end })
  for (const gap of gaps) {
    let a = gap.start
    // A gap never spans more than a few dates; the bound only guards a malformed input.
    for (let i = 0; i < 400 && a < gap.end; i++) {
      const date = localParts(a, timeZone).date
      const until = Math.min(gap.end, Math.max(midnight(nextDate(date), timeZone), a + MIN))
      const sources = [date, prevDate(date)].filter((d) => events.has(d))
      const declared = !!answer && sources.every((d) => answered.has(d))
      if (declared) outsideMs += until - a
      else unknownMs += until - a
      a = until
    }
  }
  const outsideMinutes = Math.round(outsideMs / MIN)
  const unknownMinutes = Math.round(unknownMs / MIN)
  const state: FitState = totalMinutes > 0 && coveredMinutes >= totalMinutes ? "full" : coveredMinutes > 0 ? "partial" : outsideMinutes > 0 ? "outside" : "unknown"
  return {
    state,
    totalMinutes,
    coveredMinutes,
    outsideMinutes,
    unknownMinutes,
    needsAck: outsideMinutes > 0,
    ranges: touching.map(({ date, startTime, endTime }) => ({ date, startTime, endTime })),
  }
}

/** « de 09:00 à 12:00 », « de 20:00 à 03:00 le lendemain »: words, no arrow read aloud. */
export function spokenRange(r: { startTime: string; endTime: string }): string {
  return `de ${r.startTime} à ${r.endTime}${r.endTime < r.startTime ? " le lendemain" : ""}`
}

/** The fit in a short line under its state: what is free, refused or unknown, and the ranges given. */
export function fitDetail(fit: ShiftFit): string {
  const parts: string[] = []
  if (fit.state === "partial") parts.push(`libre ${fmtDuration(fit.coveredMinutes)} sur ${fmtDuration(fit.totalMinutes)}`)
  if (fit.state !== "outside" && fit.outsideMinutes > 0) parts.push(`pas disponible ${fmtDuration(fit.outsideMinutes)}`)
  if (fit.state !== "unknown" && fit.unknownMinutes > 0) parts.push(`sans réponse ${fmtDuration(fit.unknownMinutes)}`)
  const ranges = fit.ranges.length > 0 ? `Plages indiquées : ${fit.ranges.map(spokenRange).join(", ")}` : ""
  const head = parts.length > 0 ? parts.join(", ") : ""
  const sentence = [head && head.charAt(0).toUpperCase() + head.slice(1), ranges].filter(Boolean).join(". ")
  return sentence ? `${sentence}.` : ""
}

/**
 * What an acknowledgement is bound to (Codex, #1146): the event, the person, their request and its
 * revision, the shift's real interval and the zone it was judged in. Any later change to the answer
 * (a new revision, a request recreated) or to the shift's hours makes an old acknowledgement stale.
 */
export function availabilityAckKey(p: { eventId: string; volunteerId: string; shiftId: string; interval: Interval; requestId: string; revision: number; timeZone: string }): string {
  return ["a1", p.eventId, p.volunteerId, p.shiftId, p.interval.start, p.interval.end, p.requestId, p.revision, p.timeZone].join("|")
}

/** The action an acknowledgement allows: its box starts with it, so the box names what it unlocks. */
export type AckAction = "Ajouter" | "Accepter" | "Rétablir" | "Valider" | "Garder"

const ACK_LEADS: Record<AckAction, string> = {
  Ajouter: "Ajouter quand même",
  Accepter: "Accepter quand même",
  Rétablir: "Rétablir quand même",
  Valider: "Valider quand même",
  // A draft reviewed again (#1146, lot C): the box keeps the draft, it publishes nothing.
  Garder: "Garder ce brouillon",
}

/**
 * What the organiser must tick, said about the person: no « tu », no blame, « qu'Aline » elided.
 * `action`: what the box allows (the button it goes with).
 */
export const ackLabel = (firstName: string, action: AckAction = "Ajouter") =>
  `${ACK_LEADS[action]} : je sais ${que(firstName)} n'a pas indiqué être disponible à ces heures`

/** The server's refusal when an acknowledgement is missing or stale. */
export const AVAILABILITY_ACK_REQUIRED = "Cette personne a indiqué ne pas être disponible pendant une partie de ce créneau : cochez la confirmation pour l'ajouter quand même."

// ── Candidates for one shift ──────────────────────────────────────────────────────────────────

/**
 * A mission the person already holds (or, from lot C, a draft): « confirmed » is an active place,
 * « pending » a request waiting for the organiser, « draft » a draft assignment. Drafts are counted
 * apart and never judged as committed duty here: lot C decides how a draft batch is evaluated.
 */
export type HeldKind = "confirmed" | "pending" | "draft"
export type HeldMission = DutyShift & { kind: HeldKind; name: string }

export type AssistContext = {
  eventId: string
  shift: DutyShift & { name: string }
  eventDates: readonly string[]
  /** The event's frozen availability zone. */
  timeZone: string
  gate: WorkloadGate
  mode: WorkloadMode
}

export type CandidateInput = {
  volunteerId: string
  firstName: string
  lastName: string
  answer: AnswerForFit | null
  held: HeldMission[]
  person?: WorkloadPerson | null
  /** The answer is flagged for review (two merged records answered differently). */
  reviewReason?: string | null
  /** What tells this person apart from another listed under the same name (sameNameHints). */
  sameNameHint?: string | null
  /** The person already has a pending draft on this shift (#1146, lot C). */
  draftOnShift?: boolean
}

export type CandidateRow = {
  volunteerId: string
  firstName: string
  lastName: string
  /** Set when another person listed has the same name: their email, or « sans email ». */
  sameNameHint: string | null
  fit: ShiftFit
  /** Set when the fit needs an acknowledgement; the key to send back with the addition. */
  ackKey: string | null
  minutes: { confirmed: number; pending: number; draft: number; committed: number; sameDay: number }
  /** « le samedi 4 juillet » or « la journée de service du samedi 4 juillet »: what `sameDay` counts. */
  sameDayLabel: string
  backToBack: string[]
  overlaps: string[]
  /** False when the event's workload protection would refuse the addition. */
  eligible: boolean
  /** Why it would be refused, or the #465 warnings it would raise (non-blocking). */
  workload: string[]
  reviewNeeded: boolean
  /** Why the answer needs another look, in words (a merge, a change after a publication). */
  reviewTexts: string[]
  /** A pending draft on this shift already exists: no second « Ajouter en brouillon ». */
  draftOnShift: boolean
}

const lowerFirst = (s: string) => s.charAt(0).toLocaleLowerCase("fr-FR") + s.slice(1)
const dayKey = (d: string | Date) => (typeof d === "string" ? d.slice(0, 10) : d.toISOString().slice(0, 10))

/** Everything shown about one person for the shift. */
export function assessCandidate(ctx: AssistContext, c: CandidateInput): CandidateRow {
  const interval = shiftInterval(ctx.shift, ctx.timeZone)
  const fit = shiftFit(interval, c.answer, ctx.eventDates, ctx.timeZone)
  const ackKey = fit.needsAck && c.answer
    ? availabilityAckKey({ eventId: ctx.eventId, volunteerId: c.volunteerId, shiftId: ctx.shift.id, interval, requestId: c.answer.requestId, revision: c.answer.revision, timeZone: ctx.timeZone })
    : null

  const held = c.held.filter((h) => h.id !== ctx.shift.id)
  const committed = held.filter((h) => h.kind !== "draft")
  const withInterval = held.map((h) => ({ h, i: shiftInterval(h, ctx.timeZone) }))
  const minutesOf = (kinds: HeldKind[]) => Math.round(unionLength(withInterval.filter((x) => kinds.includes(x.h.kind)).map((x) => x.i)) / MIN)

  // The day the shift belongs to: its service day under a protection policy, else its date.
  const policy = ctx.gate.kind === "on" ? ctx.gate.policy : null
  const dayOf = (i: Interval, s: DutyShift) => (policy ? serviceDayOf(i.start, policy) : dayKey(s.date))
  const shiftDay = dayOf(interval, ctx.shift)
  const sameDay = Math.round(unionLength(withInterval.filter((x) => x.h.kind !== "draft" && dayOf(x.i, x.h) === shiftDay).map((x) => x.i)) / MIN)
  const sameDayLabel = policy ? `la journée de service du ${lowerFirst(fmtDay(shiftDay))}` : `le ${lowerFirst(fmtDay(shiftDay))}`

  const touching = withInterval.filter((x) => x.h.kind !== "draft")
  const backToBack = touching.filter((x) => x.i.end === interval.start || x.i.start === interval.end).map((x) => x.h.name)
  const overlaps = touching.filter((x) => x.i.start < interval.end && x.i.end > interval.start).map((x) => x.h.name)

  // The workload protection's own verdict (#1171), the one the server applies: never re-derived.
  const duty = committed.map(({ id, date, startTime, endTime, mealOnTheGo, placeId, placeName }) => ({ id, date, startTime, endTime, mealOnTheGo, placeId, placeName }))
  const verdict = judgeDutyChange(ctx.gate, duty, { add: [ctx.shift] }, c.person)
  let workload: string[]
  if (!verdict.ok) {
    workload = verdict.reason === "incomplete" ? [WORKLOAD_POLICY_INCOMPLETE] : verdict.reason === "birthdate" ? [WORKLOAD_BIRTHDATE_REQUIRED] : verdict.findings.map((f) => workloadFindingMessage(f, verdict.policy))
  } else if (ctx.mode.kind === "warnings") {
    // The #465 warnings read confirmed places only, as the manual add form does.
    const confirmed = duty.filter((_, i) => committed[i].kind === "confirmed")
    workload = newWorkloadNotices(confirmed, [...confirmed, ctx.shift], ctx.mode).map((n) => n.text)
  } else workload = []

  return {
    volunteerId: c.volunteerId,
    firstName: c.firstName,
    lastName: c.lastName,
    sameNameHint: c.sameNameHint ?? null,
    fit,
    ackKey,
    minutes: { confirmed: minutesOf(["confirmed"]), pending: minutesOf(["pending"]), draft: minutesOf(["draft"]), committed: minutesOf(["confirmed", "pending"]), sameDay },
    sameDayLabel,
    backToBack,
    overlaps,
    eligible: verdict.ok,
    workload,
    reviewNeeded: !!c.reviewReason,
    reviewTexts: reviewReasonTexts(c.reviewReason),
    draftOnShift: !!c.draftOnShift,
  }
}

// ── Order and filter ──────────────────────────────────────────────────────────────────────────

export type AssistSort = "name" | "spread"

const FIT_ORDER: Record<FitState, number> = { full: 0, partial: 1, unknown: 2, outside: 3 }

const byName = (a: CandidateRow, b: CandidateRow) =>
  a.lastName.localeCompare(b.lastName, "fr") || a.firstName.localeCompare(b.firstName, "fr") || (a.volunteerId < b.volunteerId ? -1 : a.volunteerId > b.volunteerId ? 1 : 0)

/** The sentence that explains « Pour répartir la charge », shown above the list. */
export const SPREAD_SORT_EXPLANATION =
  "Dans chaque groupe : d'abord les personnes qui peuvent être ajoutées, puis celles qui ont le moins d'heures déjà prévues sur l'événement, puis par nom. Ces heures ne comptent que cet événement."

/**
 * Inside a group of the same availability: « Pour répartir la charge » (the default) puts the rows
 * that can be added before refused ones, then the fewest committed hours on the event, then name
 * and id (Codex: a deterministic order whose criteria are said; it suggests, the organiser
 * decides); « Par nom » by name. Availability itself is the grouping (groupCandidates), never mixed
 * into the order: the independent review saw « Pas disponible » first under « Par nom ».
 */
export function sortCandidates(rows: readonly CandidateRow[], sort: AssistSort): CandidateRow[] {
  if (sort === "name") return [...rows].sort(byName)
  return [...rows].sort((a, b) =>
    Number(b.eligible) - Number(a.eligible) || FIT_ORDER[a.fit.state] - FIT_ORDER[b.fit.state] || a.minutes.committed - b.minutes.committed || byName(a, b))
}

/** The groups of the per-shift list, best availability first; each heading says its count. */
export const FIT_GROUP_LABELS: Record<FitState, string> = {
  full: "Disponibles sur tout le créneau",
  partial: "Disponibles sur une partie du créneau",
  unknown: "Sans réponse pour ces heures",
  outside: "Pas disponibles à ces heures",
}

export type CandidateGroup = { state: FitState; label: string; rows: CandidateRow[] }

/** The rows by availability (full, partial, unknown, outside), each sorted; empty groups left out. */
export function groupCandidates(rows: readonly CandidateRow[], sort: AssistSort): CandidateGroup[] {
  const sorted = sortCandidates(rows, sort)
  return (Object.keys(FIT_ORDER) as FitState[])
    .sort((a, b) => FIT_ORDER[a] - FIT_ORDER[b])
    .map((state) => ({ state, label: FIT_GROUP_LABELS[state], rows: sorted.filter((r) => r.fit.state === state) }))
    .filter((g) => g.rows.length > 0)
}

/** « Disponibles sur tout le créneau » only, or everyone. */
export function filterCandidates(rows: readonly CandidateRow[], fullOnly: boolean): CandidateRow[] {
  return fullOnly ? rows.filter((r) => r.fit.state === "full") : [...rows]
}

/** « 6 h confirmées, 2 h en attente », or « Aucune mission sur l'événement ». */
export function committedHoursText(m: CandidateRow["minutes"]): string {
  const parts: string[] = []
  if (m.confirmed > 0) parts.push(`${fmtDuration(m.confirmed)} confirmée${m.confirmed === 60 ? "" : "s"}`)
  if (m.pending > 0) parts.push(`${fmtDuration(m.pending)} en attente de validation`)
  const base = parts.length > 0 ? `Déjà prévu sur l'événement : ${parts.join(", ")}` : "Aucune mission sur l'événement pour l'instant"
  // Drafts (#1146, lot C) apart: prepared, not published, never counted as committed.
  return m.draft > 0 ? `${base} ; ${fmtDuration(m.draft)} en brouillon, pas encore publiée${m.draft === 60 ? "" : "s"}` : base
}

// ── The server's check ────────────────────────────────────────────────────────────────────────

/** Whether an event uses dated availability: collecting now, or adopted once (answers kept when off). */
export function usesAvailability(e: { availabilityEnabled: boolean; availabilityAdoptedAt: Date | string | null }): boolean {
  return e.availabilityEnabled || !!e.availabilityAdoptedAt
}

export type AckShift = Pick<DutyShift, "id" | "date" | "startTime" | "endTime"> & { name: string }

/** A shift added outside declared availability: without its acknowledgement, or with it. */
export type AckMissing = { volunteerId: string; shiftId: string; name: string; key: string; state: FitState; detail: string }
/**
 * An acknowledgement the server accepted, with the evidence it judged on (server-derived, never
 * the client's): the answer's identity and revision, the shift's real interval and zone, and the
 * minutes covered, declared unavailable and unknown. Never the ranges themselves.
 */
export type AckGiven = {
  volunteerId: string
  shiftId: string
  key: string
  requestId: string
  revision: number
  interval: Interval
  timeZone: string
  state: FitState
  totalMinutes: number
  coveredMinutes: number
  outsideMinutes: number
  unknownMinutes: number
}

/**
 * Which shifts of an addition need an acknowledgement the request does not carry (`missing`: the
 * addition is refused, nothing is created) and which were acknowledged (`acknowledged`: logged
 * with the registration). Pure: the server calls it on the answer and the shift hours it re-read
 * under the locks, so an acknowledgement given on an older answer or older hours never applies.
 */
export function judgeAvailabilityAcks(p: { eventId: string; volunteerId: string; shifts: readonly AckShift[]; answer: AnswerForFit | null; eventDates: readonly string[]; timeZone: string; acks: readonly string[] }): { missing: AckMissing[]; acknowledged: AckGiven[] } {
  const given = new Set(p.acks)
  const missing: AckMissing[] = []
  const acknowledged: AckGiven[] = []
  if (!p.answer) return { missing, acknowledged }
  for (const s of p.shifts) {
    const interval = shiftInterval(s, p.timeZone)
    const fit = shiftFit(interval, p.answer, p.eventDates, p.timeZone)
    if (!fit.needsAck) continue
    const key = availabilityAckKey({ eventId: p.eventId, volunteerId: p.volunteerId, shiftId: s.id, interval, requestId: p.answer.requestId, revision: p.answer.revision, timeZone: p.timeZone })
    if (given.has(key)) {
      acknowledged.push({
        volunteerId: p.volunteerId, shiftId: s.id, key, requestId: p.answer.requestId, revision: p.answer.revision, interval, timeZone: p.timeZone,
        state: fit.state, totalMinutes: fit.totalMinutes, coveredMinutes: fit.coveredMinutes, outsideMinutes: fit.outsideMinutes, unknownMinutes: fit.unknownMinutes,
      })
    } else missing.push({ volunteerId: p.volunteerId, shiftId: s.id, name: s.name, key, state: fit.state, detail: fitDetail(fit) })
  }
  return { missing, acknowledged }
}

// ── The acknowledgement's log entry ───────────────────────────────────────────────────────────

/** The organiser action an acknowledgement was given for; « publish »: a draft published (#1146, lot C). */
export type AckVia = "manual_add" | "accept" | "restore" | "swap" | "publish"

/** Version of the evidence stored in `availabilityAck`: raised whenever its shape changes. */
export const AVAILABILITY_ACK_EVIDENCE_VERSION = 1

export type AckEvidence = {
  v: typeof AVAILABILITY_ACK_EVIDENCE_VERSION
  via: AckVia
  requestId: string
  revision: number
  shiftStart: string
  shiftEnd: string
  timeZone: string
  state: FitState
  totalMinutes: number
  coveredMinutes: number
  outsideMinutes: number
  unknownMinutes: number
}

/**
 * The `changes` of the acknowledgement's log entry, written in the same transaction as the
 * registration change (Codex, #1146): the shift (unchanged, so the journal can name it) and the
 * versioned evidence the server judged on. No name, no range: the log is read by the whole team
 * and outlives the answer.
 */
export function availabilityAckChanges(a: AckGiven, via: AckVia): { shiftId: { from: string; to: string }; availabilityAck: { from: null; to: AckEvidence } } {
  return {
    shiftId: { from: a.shiftId, to: a.shiftId },
    availabilityAck: {
      from: null,
      to: {
        v: AVAILABILITY_ACK_EVIDENCE_VERSION, via, requestId: a.requestId, revision: a.revision,
        shiftStart: new Date(a.interval.start).toISOString(), shiftEnd: new Date(a.interval.end).toISOString(), timeZone: a.timeZone,
        state: a.state, totalMinutes: a.totalMinutes, coveredMinutes: a.coveredMinutes, outsideMinutes: a.outsideMinutes, unknownMinutes: a.unknownMinutes,
      },
    },
  }
}

// ── People of the same name ───────────────────────────────────────────────────────────────────

const nameKey = (firstName: string, lastName: string) => `${firstName} ${lastName}`.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase("fr-FR")

/**
 * What tells apart people listed together under the same name (the badge reprint's rule,
 * src/lib/print-badges.ts): their email, which organisers already see on the member's page, or
 * « sans email »; then « fiche 1 sur 2 », « fiche 2 sur 2 » in a stable order when even that is shared.
 * Nothing for a name listed once.
 */
export function sameNameHints(people: readonly { id: string; firstName: string; lastName: string; email: string | null }[]): Map<string, string> {
  const groups = new Map<string, (typeof people)[number][]>()
  for (const p of people) groups.set(nameKey(p.firstName, p.lastName), [...(groups.get(nameKey(p.firstName, p.lastName)) ?? []), p])
  const hints = new Map<string, string>()
  for (const group of groups.values()) {
    if (group.length < 2) continue
    const byHint = new Map<string, (typeof people)[number][]>()
    for (const p of group) {
      const hint = p.email?.trim() || "sans email"
      byHint.set(hint.toLowerCase(), [...(byHint.get(hint.toLowerCase()) ?? []), p])
    }
    for (const same of byHint.values()) {
      const sorted = [...same].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
      sorted.forEach((p, i) => {
        const hint = p.email?.trim() || "sans email"
        hints.set(p.id, sorted.length > 1 ? `${hint}, fiche ${i + 1} sur ${sorted.length}` : hint)
      })
    }
  }
  return hints
}
