// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { COMMITTED_STATUSES, lockShifts } from "./registration-capacity"
import {
  activePolicy, evaluateWorkload, findingKey, parseWorkloadPolicy, workloadChange, workloadFindingMessage, WORKLOAD_POLICY_INCOMPLETE,
  type ActivePolicy, type DutyShift, type WorkloadFinding,
} from "./workload-policy"

/**
 * Enforcement of the workload protection (#1171), server only: what every assignment path calls
 * inside its own transaction. The rules are in src/lib/workload-policy.ts.
 *
 * Locks (Codex, PR 1), in the global order: the event's workload lock first, then the shifts
 * (`lockShifts`, ORDER BY id), then the volunteers (ORDER BY id), then the rows written.
 * - Every transaction that creates or moves a commitment takes the SHARED advisory lock of the
 *   event as its very first statement (`lockWorkloadShared`), then reads the policy: even when
 *   protection looks off, so that a policy write cannot slip between the read and the commit.
 * - A policy write takes the EXCLUSIVE lock (`lockWorkloadExclusive`), then writes and scans the
 *   commitments in the same transaction: every commitment either committed before the scan (and is
 *   in it) or reads the new policy.
 * - A person's own schedule is serialised by their Volunteer row lock (FOR UPDATE), taken by each
 *   path after its shift locks.
 * Cancellations and member merges take none of these locks: they are always allowed (their
 * remaining findings are reported), so any interleaving with them is one of the serial orders
 * that are allowed anyway.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Tx = any

const lockKey = (eventId: string) => `workload-policy:${eventId}`

/** The shared workload lock of the event, first statement of a transaction that adds duty. */
export async function lockWorkloadShared(tx: Tx, eventId: string): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock_shared(hashtext(${lockKey(eventId)}))`
}

/** The exclusive workload lock of the event, first statement of a policy write. */
export async function lockWorkloadExclusive(tx: Tx, eventId: string): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${lockKey(eventId)}))`
}

/** Shared locks of several events, in a fixed order (a change touching more than one event). */
export async function lockWorkloadSharedMany(tx: Tx, eventIds: string[]): Promise<void> {
  for (const id of [...new Set(eventIds)].sort()) await lockWorkloadShared(tx, id)
}

/** What the event's protection says: off, on with a policy, or on with one that does not parse. */
export type WorkloadGate = { kind: "off" } | { kind: "on"; policy: ActivePolicy } | { kind: "incomplete" }

/** The event fields a gate is built from: the protection and the dates (the days-off rule's horizon). */
export type WorkloadEventRow = { workloadProtectionEnabled: boolean; workloadPolicy: unknown; startDate: Date | string; endDate: Date | string }

/** The gate of a stored event row. Enabled with a policy that does not parse: closed, never open. */
export function workloadGateOf(event: WorkloadEventRow | null | undefined): WorkloadGate {
  if (!event?.workloadProtectionEnabled) return { kind: "off" }
  const parsed = parseWorkloadPolicy(event.workloadPolicy)
  return parsed.ok ? { kind: "on", policy: activePolicy(parsed.policy, event) } : { kind: "incomplete" }
}

/** What a gate reads of the event row. */
export const WORKLOAD_EVENT_SELECT = { workloadProtectionEnabled: true, workloadPolicy: true, startDate: true, endDate: true } as const

/** The gate read inside the transaction, after the shared lock. */
export async function readWorkloadGate(tx: Tx, eventId: string): Promise<WorkloadGate> {
  const event = await tx.event.findFirst({ where: { id: eventId }, select: WORKLOAD_EVENT_SELECT })
  return workloadGateOf(event)
}

/** A person's committed missions on the event (confirmed places and pending requests). */
export async function committedDuty(tx: Tx, eventId: string, volunteerId: string): Promise<(DutyShift & { registrationId: string; assignedOnly: boolean })[]> {
  const rows: { id: string; shift: { id: string; date: Date; startTime: string; endTime: string; assignedOnly: boolean; mealOnTheGo: boolean; placeId: string | null; place: { name: string } | null } }[] = await tx.registration.findMany({
    where: { eventId, volunteerId, status: { in: [...COMMITTED_STATUSES] }, shift: { status: { not: "cancelled" } } },
    select: { id: true, shift: { select: { id: true, date: true, startTime: true, endTime: true, assignedOnly: true, mealOnTheGo: true, placeId: true, place: { select: { name: true } } } } },
  })
  return rows.map((r) => ({
    id: r.shift.id, registrationId: r.id, date: r.shift.date, startTime: r.shift.startTime, endTime: r.shift.endTime,
    assignedOnly: r.shift.assignedOnly, mealOnTheGo: r.shift.mealOnTheGo, placeId: r.shift.placeId, placeName: r.shift.place?.name ?? null,
  }))
}

/**
 * The place names of missions that carry a place id only (a shift row read without its place), for
 * the travel messages (#1171, lot 2). One query; missions without a place are left as they are.
 */
export async function withPlaceNames<S extends DutyShift>(tx: Tx, shifts: S[]): Promise<S[]> {
  const ids = [...new Set(shifts.filter((s) => s.placeId && !s.placeName).map((s) => s.placeId as string))]
  if (ids.length === 0) return shifts
  const rows: { id: string; name: string }[] = await tx.eventPlace.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } })
  const names = new Map(rows.map((r) => [r.id, r.name]))
  return shifts.map((s) => (s.placeId && !s.placeName ? { ...s, placeName: names.get(s.placeId) ?? null } : s))
}

/** The change a path makes to one person's schedule. */
export type DutyChange = {
  /** Missions the person takes. */
  add?: DutyShift[]
  /** Shifts the person leaves (a swap gives one away). */
  removeShiftIds?: string[]
  /** Shifts whose hours change (a shift or series edit): same id, new times. */
  replace?: DutyShift[]
}

export type WorkloadVerdict =
  | { ok: true }
  | { ok: false; reason: "incomplete" }
  | { ok: false; reason: "findings"; findings: WorkloadFinding[]; policy: ActivePolicy; before: DutyShift[]; after: DutyShift[] }

/** The schedule after a change. */
export function applyDutyChange(before: DutyShift[], change: DutyChange): DutyShift[] {
  const removed = new Set(change.removeShiftIds ?? [])
  const replaced = new Map((change.replace ?? []).map((s) => [s.id, s]))
  return [
    // A replacement keeps what it does not say (a series edit sends the hours, not the meal flag).
    ...before.filter((s) => !removed.has(s.id)).map((s) => (replaced.has(s.id) ? { ...s, ...replaced.get(s.id)! } : s)),
    ...(change.add ?? []),
  ]
}

/** The verdict of a change on a schedule, under a gate. Pure. */
export function judgeDutyChange(gate: WorkloadGate, before: DutyShift[], change: DutyChange): WorkloadVerdict {
  if (gate.kind === "off") return { ok: true }
  if (gate.kind === "incomplete") return { ok: false, reason: "incomplete" }
  const after = applyDutyChange(before, change)
  const findings = workloadChange(before, after, gate.policy)
  return findings.length === 0 ? { ok: true } : { ok: false, reason: "findings", findings, policy: gate.policy, before, after }
}

/**
 * The check of one person's change, inside the caller's transaction: after the workload lock, the
 * shift locks and that person's Volunteer lock. Reads the person's committed missions now.
 */
export async function checkDutyChange(tx: Tx, gate: WorkloadGate, eventId: string, volunteerId: string, change: DutyChange, opts: { exceptRegistrationIds?: string[] } = {}): Promise<WorkloadVerdict> {
  if (gate.kind === "off") return { ok: true }
  // A registration the change turns into a commitment (a request accepted, a place restored) is
  // judged as added, never as already there.
  const except = new Set(opts.exceptRegistrationIds ?? [])
  const before = (await committedDuty(tx, eventId, volunteerId)).filter((d) => !except.has(d.registrationId))
  const named: DutyChange = { ...change, add: change.add && await withPlaceNames(tx, change.add), replace: change.replace && await withPlaceNames(tx, change.replace) }
  return judgeDutyChange(gate, before.map(({ id, date, startTime, endTime, mealOnTheGo, placeId, placeName }) => ({ id, date, startTime, endTime, mealOnTheGo, placeId, placeName })), named)
}

/** Locks the given volunteers' rows, ORDER BY id (after the shift locks). */
export async function lockVolunteerRows(tx: Tx, ids: string[]): Promise<void> {
  const unique = [...new Set(ids)]
  if (unique.length === 0) return
  await tx.$queryRaw`SELECT id FROM "Volunteer" WHERE id = ANY(${unique}::text[]) ORDER BY id FOR UPDATE`
}

/**
 * Whether a finding can be reproduced from the submitted missions alone (Codex, PR 1): then
 * describing it reveals nothing the submitter did not type. Merged blocks and totals can include
 * duty already held, so the check is on the submission's own findings, not on shift ids.
 */
export function reproducibleFrom(finding: WorkloadFinding, submitted: DutyShift[], policy: ActivePolicy): boolean {
  const own = new Set(evaluateWorkload(submitted, policy).map(findingKey))
  return own.has(findingKey(finding))
}

/** The verdict as a refusal error: one specific sentence (the first finding), and every finding for the page. */
export function workloadRefusalBody(verdict: Exclude<WorkloadVerdict, { ok: true }>, lead: string): { error: string; code: "workload"; workload: string[] } {
  if (verdict.reason === "incomplete") return { error: WORKLOAD_POLICY_INCOMPLETE, code: "workload", workload: [WORKLOAD_POLICY_INCOMPLETE] }
  const messages = verdict.findings.map((f) => workloadFindingMessage(f, verdict.policy))
  const more = messages.length > 1 ? ` (et ${messages.length - 1} autre${messages.length > 2 ? "s" : ""} limite${messages.length > 2 ? "s" : ""})` : ""
  return { error: `${lead} ${messages[0]}${more}`, code: "workload", workload: messages }
}

/** A refusal raised inside a transaction (rolls it back), caught by the route. */
export class WorkloadRefusalError extends Error {
  constructor(readonly verdict: Exclude<WorkloadVerdict, { ok: true }>, readonly volunteerId: string, readonly volunteerName?: string) {
    super("Workload protection refuses the change")
  }
}

/** One person a shift or series edit would put over the limits. */
export type ScheduleEditRefusal = { volunteerId: string; name: string; verdict: Exclude<WorkloadVerdict, { ok: true }> }

/**
 * A shift or series edit that moves the hours of shifts people hold (#1171): every committed person
 * is judged with the new hours, all at once (atomic: one refusal refuses the whole edit). Takes the
 * locks itself, in the global order: the workload lock, the shifts, then the people ORDER BY id.
 * Returns the refusals; empty when the edit may go on.
 */
export async function checkScheduleEdit(tx: Tx, eventId: string, moved: DutyShift[]): Promise<ScheduleEditRefusal[]> {
  await lockWorkloadShared(tx, eventId)
  const gate = await readWorkloadGate(tx, eventId)
  if (gate.kind === "off" || moved.length === 0) return []
  await lockShifts(tx, moved.map((s) => s.id))
  const regs: { volunteerId: string; volunteer: { firstName: string; lastName: string } }[] = await tx.registration.findMany({
    where: { shiftId: { in: moved.map((s) => s.id) }, status: { in: [...COMMITTED_STATUSES] } },
    select: { volunteerId: true, volunteer: { select: { firstName: true, lastName: true } } },
  })
  const people = new Map(regs.map((r) => [r.volunteerId, `${r.volunteer.firstName} ${r.volunteer.lastName}`.trim()]))
  const ids = [...people.keys()].sort()
  await lockVolunteerRows(tx, ids)
  const refusals: ScheduleEditRefusal[] = []
  for (const volunteerId of ids) {
    const verdict = await checkDutyChange(tx, gate, eventId, volunteerId, { replace: moved })
    if (!verdict.ok) refusals.push({ volunteerId, name: people.get(volunteerId)!, verdict })
  }
  return refusals
}

/** The organiser's refusal of an edit: who, and the first limit broken for each. */
export function scheduleEditRefusalBody(refusals: ScheduleEditRefusal[], cause = "avec ces horaires"): { error: string; code: "workload"; workload: string[] } {
  const lines = refusals.map((r) => (r.verdict.reason === "incomplete" ? WORKLOAD_POLICY_INCOMPLETE : `${r.name} : ${workloadFindingMessage(r.verdict.findings[0], r.verdict.policy)}`))
  const who = refusals.length === 1 ? refusals[0].name : `${refusals.length} personnes`
  return {
    error: `Modification impossible : ${cause}, le programme de ${who} ne respecterait plus les pauses et limites de charge de cet événement. Rien n'a été modifié. ${lines[0]}`,
    code: "workload",
    workload: lines,
  }
}

/** Raised inside an edit's transaction to roll it back. */
export class ScheduleEditRefusalError extends Error {
  constructor(readonly refusals: ScheduleEditRefusal[], readonly cause?: string) {
    super("Workload protection refuses the schedule edit")
  }
}
