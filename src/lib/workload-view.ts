// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * What the pages show about a person's workload (#465, #1171), one entry point for every surface:
 * an event without protection keeps the non-blocking #465 warnings; a protected event uses the
 * policy's evaluator instead, so the same situation is never reported twice in two vocabularies.
 * Pure and Prisma-free (the sign-up page, the organiser lists and the personal page read it).
 */
import { workloadMessage, workloadWarnings } from "./workload"
import { evaluateWorkload, findingKey, workloadFindingMessage, WORKLOAD_POLICY_INCOMPLETE, type ActivePolicy, type DutyShift } from "./workload-policy"
import { workloadGateOf } from "./workload-guard"

/** How an event judges workload: #465 warnings, its protection policy, or a protection that does not parse. */
export type WorkloadMode =
  | { kind: "warnings"; timeZone: string }
  | { kind: "policy"; policy: ActivePolicy }
  | { kind: "incomplete" }

/** The mode of a stored event; the zone is the organisation's, used by the #465 warnings only. */
export function workloadModeOf(event: { workloadProtectionEnabled?: boolean | null; workloadPolicy?: unknown; startDate: Date | string; endDate: Date | string }, timeZone: string): WorkloadMode {
  const gate = workloadGateOf({ workloadProtectionEnabled: !!event.workloadProtectionEnabled, workloadPolicy: event.workloadPolicy, startDate: event.startDate, endDate: event.endDate })
  if (gate.kind === "on") return { kind: "policy", policy: gate.policy }
  if (gate.kind === "incomplete") return { kind: "incomplete" }
  return { kind: "warnings", timeZone }
}

/** Whether the mode blocks (a protected event) rather than warns. */
export const blocksWorkload = (mode: WorkloadMode) => mode.kind !== "warnings"

/** One sentence to show, with a stable key and the shifts it is about. */
export type WorkloadNotice = { key: string; text: string; shiftIds: string[] }

/** The notices of a schedule. */
export function workloadNotices(shifts: DutyShift[], mode: WorkloadMode): WorkloadNotice[] {
  if (mode.kind === "incomplete") return shifts.length > 0 ? [{ key: "incomplete", text: WORKLOAD_POLICY_INCOMPLETE, shiftIds: shifts.map((x) => x.id) }] : []
  if (mode.kind === "policy") return evaluateWorkload(shifts, mode.policy).map((f) => ({ key: findingKey(f), text: workloadFindingMessage(f, mode.policy), shiftIds: f.shiftIds }))
  return workloadWarnings(shifts, mode.timeZone).map((w) => ({ key: `${w.kind}|${w.day}|${w.shiftIds.join()}|${w.minutes}`, text: workloadMessage(w), shiftIds: w.shiftIds }))
}

/** The notices a change adds: those of the schedule after it that the schedule before did not have. */
export function newWorkloadNotices(before: DutyShift[], after: DutyShift[], mode: WorkloadMode): WorkloadNotice[] {
  if (mode.kind === "incomplete") return after.length > before.length ? workloadNotices(after, mode) : []
  const known = new Set(workloadNotices(before, mode).map((n) => n.text))
  return workloadNotices(after, mode).filter((n) => !known.has(n.text))
}

/**
 * Notices per person for the organiser's views: volunteer id → notices. The #465 warnings read
 * confirmed places only; a protected event judges what the policy enforces, confirmed places and
 * pending requests (COMMITTED_STATUSES).
 */
export function workloadByPerson(registrations: { volunteerId: string; status: string; shift: DutyShift }[], mode: WorkloadMode): Map<string, WorkloadNotice[]> {
  const counted = mode.kind === "warnings" ? new Set(["active"]) : new Set(["active", "requested"])
  const shifts = new Map<string, DutyShift[]>()
  for (const r of registrations) {
    if (!counted.has(r.status)) continue
    shifts.set(r.volunteerId, [...(shifts.get(r.volunteerId) ?? []), r.shift])
  }
  const out = new Map<string, WorkloadNotice[]>()
  for (const [id, list] of shifts) {
    // An unreadable policy is said once on the page, not on every row.
    const notices = mode.kind === "incomplete" ? [] : workloadNotices(list, mode)
    if (notices.length > 0) out.set(id, notices)
  }
  return out
}

/**
 * The recap of a sign-up (#373, #465, #1171): the notices of the shifts chosen (waitlist entries
 * left out, they are no mission yet) with those already held, known only from the personal link.
 * On a protected event, only what the sign-up would create or worsen: what is already there is
 * shown on the personal page, and never blocks this sign-up.
 */
export function recapWorkloadNotices(chosen: DutyShift[], held: DutyShift[], mode: WorkloadMode): WorkloadNotice[] {
  if (mode.kind === "warnings") return workloadNotices([...chosen, ...held], mode)
  if (chosen.length === 0) return []
  return newWorkloadNotices(held, [...held, ...chosen], mode)
}
