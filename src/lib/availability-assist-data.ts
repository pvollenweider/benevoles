// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { availabilityDates } from "./event-availability"
import {
  assessCandidate, fitDetail, judgeAvailabilityAcks, sameNameHints, shiftFit, shiftInterval, usesAvailability, availabilityAckChanges, availabilityAckKey,
  FIT_LABELS,
  type AckGiven, type AckMissing, type AckVia, type AnswerForFit, type CandidateRow, type FitState, type HeldMission,
} from "./availability-assist"
import type { LogActor } from "./event-log"
import { COMMITTED_STATUSES, LIVE_STATUSES } from "./registration-capacity"
import { orgTimeZone } from "./time-zone"
import { WORKLOAD_EVENT_SELECT, workloadGateOf } from "./workload-guard"
import { parsePersonalLimits } from "./workload-personal"
import { workloadModeOf } from "./workload-view"

/**
 * Reads of the assisted manual assignment (#1146, lot B), server only; the rules are in
 * src/lib/availability-assist.ts. Organisers only, through the organisation's scoped client.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any

const ANSWER_SELECT = {
  id: true, volunteerId: true, revision: true, reviewReason: true,
  days: { select: { date: true, ranges: { select: { startTime: true, endTime: true, startsAt: true, endsAt: true }, orderBy: { startsAt: "asc" as const } } } },
} as const

type AnswerRow = { id: string; volunteerId: string; revision: number; reviewReason: string | null; days: { date: Date; ranges: AnswerForFit["days"][number]["ranges"] }[] }

const toAnswer = (r: AnswerRow): AnswerForFit => ({ requestId: r.id, revision: r.revision, days: r.days.map((d) => ({ date: d.date.toISOString().slice(0, 10), ranges: d.ranges })) })

const shiftName = (s: { roleName: string; label: string }) => (s.label && s.label !== s.roleName ? `${s.roleName} · ${s.label}` : s.roleName)
const day = (d: Date) => d.toISOString().slice(0, 10)

/** What the availability of an event needs: whether it is used, its frozen zone and its dates. */
export type AvailabilityGate = { inUse: false } | { inUse: true; timeZone: string; dates: string[] }

const GATE_SELECT = { startDate: true, endDate: true, availabilityEnabled: true, availabilityAdoptedAt: true, availabilityTimeZone: true, organization: { select: { timeZone: true } } } as const

type GateRow = { startDate: Date; endDate: Date; availabilityEnabled: boolean; availabilityAdoptedAt: Date | null; availabilityTimeZone: string | null; organization: { timeZone: string | null } }

function gateOf(e: GateRow | null): AvailabilityGate {
  if (!e || !usesAvailability(e)) return { inUse: false }
  return { inUse: true, timeZone: e.availabilityTimeZone ?? orgTimeZone(e.organization), dates: availabilityDates(e.startDate, e.endDate) }
}

/** The event's availability gate, read in the caller's transaction (or client). */
export async function readAvailabilityGate(tx: Db, eventId: string): Promise<AvailabilityGate> {
  return gateOf(await tx.event.findFirst({ where: { id: eventId }, select: GATE_SELECT }))
}

/** One person's answer on the event, or null when they were never asked. */
export async function readAnswerForFit(tx: Db, eventId: string, volunteerId: string): Promise<AnswerForFit | null> {
  const row: AnswerRow | null = await tx.availabilityRequest.findFirst({ where: { eventId, volunteerId }, select: ANSWER_SELECT })
  return row ? toAnswer(row) : null
}

/** Several people's answers on the event, by person (absent: never asked). */
export async function readAnswersForFit(tx: Db, eventId: string, volunteerIds: readonly string[]): Promise<Map<string, AnswerForFit>> {
  if (volunteerIds.length === 0) return new Map()
  const rows: AnswerRow[] = await tx.availabilityRequest.findMany({ where: { eventId, volunteerId: { in: [...new Set(volunteerIds)] } }, select: ANSWER_SELECT })
  return new Map(rows.map((r) => [r.volunteerId, toAnswer(r)]))
}

/** Refused inside the addition's transaction (rolls it back): the shifts still to acknowledge. */
export class AvailabilityAckError extends Error {
  constructor(readonly missing: AckMissing[]) {
    super("Availability acknowledgement missing")
  }
}

/**
 * The server check of an organiser's assignment (owner decision 6), inside its transaction, after
 * the event's workload lock, the shift locks and the people's Volunteer locks (workload → shifts →
 * people): the shift hours and the answers are re-read now, so an acknowledgement given on older
 * ones does not apply. `items`: each person and the shifts they would hold after the change (an
 * addition, an accepted request, a restored place, the shift received in a swap). Throws
 * AvailabilityAckError, every missing acknowledgement listed, when one is missing: the caller's
 * transaction rolls back as a whole. Returns the acknowledgements accepted, with their evidence.
 */
export async function checkAvailabilityAcksFor(tx: Db, gate: AvailabilityGate, eventId: string, items: readonly { volunteerId: string; shiftIds: readonly string[] }[], acks: readonly string[]): Promise<AckGiven[]> {
  if (!gate.inUse || items.length === 0) return []
  const shiftIds = [...new Set(items.flatMap((i) => i.shiftIds))]
  const shifts: { id: string; roleName: string; label: string; date: Date; startTime: string; endTime: string }[] = await tx.shift.findMany({
    where: { id: { in: shiftIds }, eventId },
    select: { id: true, roleName: true, label: true, date: true, startTime: true, endTime: true },
  })
  const named = new Map(shifts.map((s) => [s.id, { ...s, name: shiftName(s) }]))
  const missing: AckMissing[] = []
  const acknowledged: AckGiven[] = []
  for (const item of items) {
    const answer = await readAnswerForFit(tx, eventId, item.volunteerId)
    const verdict = judgeAvailabilityAcks({ eventId, volunteerId: item.volunteerId, shifts: item.shiftIds.flatMap((id) => named.get(id) ?? []), answer, eventDates: gate.dates, timeZone: gate.timeZone, acks })
    missing.push(...verdict.missing)
    acknowledged.push(...verdict.acknowledged)
  }
  if (missing.length > 0) throw new AvailabilityAckError(missing)
  return acknowledged
}

/** One person's addition: checkAvailabilityAcksFor with a single item. */
export function checkAvailabilityAcks(tx: Db, gate: AvailabilityGate, eventId: string, volunteerId: string, shiftIds: string[], acks: readonly string[]): Promise<AckGiven[]> {
  return checkAvailabilityAcksFor(tx, gate, eventId, [{ volunteerId, shiftIds }], acks)
}

/**
 * The acknowledgements' log entries, in the caller's transaction so they commit (or roll back)
 * with the registration change they document: one per registration, versioned evidence derived by
 * the server (availabilityAckChanges). `registrationOf` maps a person and shift to the registration.
 */
export async function logAvailabilityAcks(tx: Db, p: { eventId: string; actor: LogActor; via: AckVia; acks: readonly AckGiven[]; registrationOf: (a: AckGiven) => string | undefined; causedByLogId?: string }): Promise<void> {
  for (const a of p.acks) {
    const registrationId = p.registrationOf(a)
    if (!registrationId) continue
    await tx.eventLog.create({
      data: {
        eventId: p.eventId,
        actorType: p.actor.type,
        actorId: ("id" in p.actor ? p.actor.id : undefined) ?? null,
        // One entry per registration placed outside declared availability, knowingly; a literal (#704).
        action: "registration.availability_acknowledged",
        entityType: "Registration",
        entityId: registrationId,
        changes: availabilityAckChanges(a, p.via),
        causedByLogId: p.causedByLogId ?? null,
      },
    })
  }
}

/** What the refusal asks for, by action: « pour l'ajouter quand même », and what was not done. */
const ACK_WORDS: Record<AckVia, { confirm: string; nothing: string }> = {
  manual_add: { confirm: "l'ajouter quand même", nothing: "Rien n'a été ajouté." },
  accept: { confirm: "accepter sa demande quand même", nothing: "La demande n'a pas été acceptée." },
  restore: { confirm: "rétablir son inscription quand même", nothing: "Rien n'a été rétabli." },
  swap: { confirm: "valider l'échange quand même", nothing: "L'échange n'a pas été effectué." },
  publish: { confirm: "publier l'affectation quand même", nothing: "Rien n'a été publié." },
}

/** The refusal's body: the first shift said, every one listed for the form. */
export function availabilityAckBody(e: AvailabilityAckError, name: string, via: AckVia = "manual_add") {
  const n = e.missing.length
  const words = ACK_WORDS[via]
  const error = `${name} a indiqué ne pas être disponible pendant ${n > 1 ? `${n} de ces créneaux` : "une partie de ce créneau"} : cochez la confirmation pour ${words.confirm}. ${words.nothing}`
  return { error, code: "availability" as const, outside: e.missing.map((m) => ({ ...m, label: FIT_LABELS[m.state] })) }
}

// ── The manual add form ───────────────────────────────────────────────────────────────────────

export type PersonFit = { shiftId: string; state: FitState; label: string; detail: string; ackKey: string | null }

/**
 * One person's availability for the shifts chosen in the manual add form, or null when the event
 * or the person is not this organisation's. `inUse: false` for an event without the option: the
 * form then shows nothing more.
 */
export async function loadPersonFits(db: Db, eventId: string, volunteerId: string, shiftIds: string[]): Promise<{ inUse: boolean; fits: PersonFit[] } | null> {
  const [event, volunteer] = await Promise.all([
    db.event.findFirst({ where: { id: eventId }, select: GATE_SELECT }),
    db.volunteer.findFirst({ where: { id: volunteerId }, select: { id: true } }),
  ])
  if (!event || !volunteer) return null
  const gate = gateOf(event)
  if (!gate.inUse) return { inUse: false, fits: [] }
  const [shifts, answer] = await Promise.all([
    db.shift.findMany({ where: { id: { in: shiftIds }, eventId }, select: { id: true, date: true, startTime: true, endTime: true } }) as Promise<{ id: string; date: Date; startTime: string; endTime: string }[]>,
    readAnswerForFit(db, eventId, volunteerId),
  ])
  const fits = shifts.map((s) => {
    const interval = shiftInterval(s, gate.timeZone)
    const fit = shiftFit(interval, answer, gate.dates, gate.timeZone)
    const ackKey = fit.needsAck && answer ? availabilityAckKey({ eventId, volunteerId, shiftId: s.id, interval, requestId: answer.requestId, revision: answer.revision, timeZone: gate.timeZone }) : null
    return { shiftId: s.id, state: fit.state, label: FIT_LABELS[fit.state], detail: fitDetail(fit), ackKey }
  })
  // In the order asked.
  return { inUse: true, fits: shiftIds.flatMap((id) => fits.filter((f) => f.shiftId === id)) }
}

// ── The per-shift page ────────────────────────────────────────────────────────────────────────

export type AssistShiftOption = { id: string; name: string; date: string; startTime: string; endTime: string; capacity: number; occupied: number }

export type ShiftAssist = {
  eventId: string
  timeZone: string
  collecting: boolean
  shifts: AssistShiftOption[]
  shift: AssistShiftOption | null
  /** « event »: the people asked or with a mission on the event; « all »: every active member. */
  scope: "event" | "all"
  rows: CandidateRow[]
  /** People already on the shift (confirmed, pending, waiting list, offered place): not listed. */
  alreadyOnShift: number
  protection: "off" | "on" | "incomplete"
}

/**
 * The per-shift panel « Affecter selon les disponibilités »: every shift of the event to choose
 * from, and for the chosen one each candidate's availability, hours, breaks and workload verdict.
 * Null when the event is not this organisation's or does not use availability.
 */
export async function loadShiftAssist(db: Db, eventId: string, shiftId: string | null, scope: "event" | "all"): Promise<ShiftAssist | null> {
  const event = await db.event.findFirst({ where: { id: eventId }, select: { id: true, ...GATE_SELECT, ...WORKLOAD_EVENT_SELECT } })
  const gate = gateOf(event)
  if (!event || !gate.inUse) return null
  const shiftRows: { id: string; roleName: string; label: string; date: Date; startTime: string; endTime: string; capacity: number; mealOnTheGo: boolean; placeId: string | null; place: { name: string } | null; registrations: { status: string }[] }[] = await db.shift.findMany({
    where: { eventId, status: { not: "cancelled" } },
    select: { id: true, roleName: true, label: true, date: true, startTime: true, endTime: true, capacity: true, mealOnTheGo: true, placeId: true, place: { select: { name: true } }, registrations: { where: { status: { in: ["active", "offered", "requested"] } }, select: { status: true } } },
    orderBy: [{ date: "asc" }, { startTime: "asc" }, { roleName: "asc" }],
  })
  const shifts: AssistShiftOption[] = shiftRows.map((s) => ({ id: s.id, name: shiftName(s), date: day(s.date), startTime: s.startTime, endTime: s.endTime, capacity: s.capacity, occupied: s.registrations.length }))
  const chosenRow = shiftId ? shiftRows.find((s) => s.id === shiftId) ?? null : null
  const workloadGate = workloadGateOf(event)
  const base = { eventId, timeZone: gate.timeZone, collecting: event.availabilityEnabled, shifts, scope, protection: workloadGate.kind, shift: null, rows: [], alreadyOnShift: 0 } satisfies ShiftAssist
  if (!chosenRow) return base

  const regs: { volunteerId: string; status: string; shift: { id: string; roleName: string; label: string; date: Date; startTime: string; endTime: string; mealOnTheGo: boolean; placeId: string | null; place: { name: string } | null } }[] = await db.registration.findMany({
    where: { eventId, status: { in: [...LIVE_STATUSES] }, shift: { status: { not: "cancelled" } } },
    select: { volunteerId: true, status: true, shift: { select: { id: true, roleName: true, label: true, date: true, startTime: true, endTime: true, mealOnTheGo: true, placeId: true, place: { select: { name: true } } } } },
  })
  const onShift = new Set(regs.filter((r) => r.shift.id === chosenRow.id).map((r) => r.volunteerId))
  const committed = regs.filter((r) => (COMMITTED_STATUSES as readonly string[]).includes(r.status))
  const answers: AnswerRow[] = await db.availabilityRequest.findMany({ where: { eventId }, select: ANSWER_SELECT })

  const related = [...new Set([...answers.map((a) => a.volunteerId), ...committed.map((r) => r.volunteerId)])]
  const people: { id: string; firstName: string; lastName: string; email: string | null; birthDate: Date | null }[] = await db.volunteer.findMany({
    where: { active: true, erasedAt: null, mergedIntoId: null, ...(scope === "event" ? { id: { in: related } } : {}) },
    select: { id: true, firstName: true, lastName: true, email: true, birthDate: true },
  })
  const limits: { volunteerId: string; values: unknown }[] = await db.eventVolunteerLimit.findMany({ where: { eventId }, select: { volunteerId: true, values: true } })
  const limitOf = new Map(limits.map((l) => [l.volunteerId, parsePersonalLimits(l.values)]))
  const answerOf = new Map(answers.map((a) => [a.volunteerId, a]))
  const heldOf = new Map<string, HeldMission[]>()
  for (const r of committed) {
    const s = r.shift
    heldOf.set(r.volunteerId, [...(heldOf.get(r.volunteerId) ?? []), {
      id: s.id, date: s.date, startTime: s.startTime, endTime: s.endTime, mealOnTheGo: s.mealOnTheGo, placeId: s.placeId, placeName: s.place?.name ?? null,
      kind: r.status === "active" ? "confirmed" : "pending", name: shiftName(s),
    }])
  }

  const target = { id: chosenRow.id, date: chosenRow.date, startTime: chosenRow.startTime, endTime: chosenRow.endTime, mealOnTheGo: chosenRow.mealOnTheGo, placeId: chosenRow.placeId, placeName: chosenRow.place?.name ?? null, name: shiftName(chosenRow) }
  const ctx = { eventId, shift: target, eventDates: gate.dates, timeZone: gate.timeZone, gate: workloadGate, mode: workloadModeOf(event, orgTimeZone(event.organization)) }
  const listed = people.filter((p) => !onShift.has(p.id))
  // Two people listed under the same name are told apart (their email, seen on the member's page).
  const hints = sameNameHints(listed)
  const rows = listed.map((p) => {
    const a = answerOf.get(p.id)
    return assessCandidate(ctx, {
      volunteerId: p.id, firstName: p.firstName, lastName: p.lastName,
      answer: a ? toAnswer(a) : null,
      held: heldOf.get(p.id) ?? [],
      person: { birthDate: p.birthDate, personal: limitOf.get(p.id) ?? null },
      reviewReason: a?.reviewReason ?? null,
      sameNameHint: hints.get(p.id) ?? null,
    })
  })
  const shift = shifts.find((s) => s.id === chosenRow.id)!
  return { ...base, shift, rows, alreadyOnShift: onShift.size }
}
