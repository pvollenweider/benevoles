// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { shiftFit, shiftInterval } from "./availability-assist"
import { shiftEndsAt } from "./cancel-deadline"
import type { Model } from "./proposal-eligibility"
import type { ProposalInput } from "./proposal-input"
import type { ProposalAssignment } from "./proposal-solver"
import { memberMayTake } from "./role-reservation"
import { shiftsClash } from "./shift-overlap"
import { shiftsTooYoungFor } from "./utils"
import { evaluateWorkload, minorsApply } from "./workload-policy"

/**
 * The assignment proposal (#1172): what can honestly be said about its result. Pure.
 *
 * - Certificates (« impossible démontré »): built only from static exclusions, which hold in every
 *   possible completion (src/lib/proposal-eligibility.ts). A seat with fewer eligible people than
 *   its need; or shifts that all run at one same instant, none cumulable, whose needs together
 *   exceed the people eligible for any of them (one person takes at most one of them). A workload
 *   refusal that depends on other generated missions, or a search that found nothing, proves
 *   nothing and never becomes a certificate.
 * - The outcome: « complet » when every selected need and reserve is covered; « impossible
 *   démontré » when a certificate shows that full coverage cannot be reached on this scope;
 *   otherwise « incomplet ». The execution (« recherche interrompue ») is told apart by the caller.
 * - `validateAssignments`: an independent check of every hard rule on a result, written apart from
 *   the search's own bookkeeping; nothing that fails it is ever written into drafts.
 */

export type Certificate =
  | { kind: "shift"; level: "minimum" | "capacity"; shiftId: string; need: number; eligible: number }
  | { kind: "simultaneous"; level: "minimum" | "capacity"; shiftIds: string[]; need: number; eligible: number }

export type ProposalOutcome = "complete" | "incomplete" | "proven_impossible"

/** Every certificate of the model, ordered: per shift (minimum, then capacity), then groups. */
export function certificates(model: Model): Certificate[] {
  const out: Certificate[] = []
  for (const s of model.open) {
    const eligible = model.candidates.get(s.id)!.length
    const min = model.critical.get(s.id)!
    const cap = model.free.get(s.id)!
    if (eligible < min) out.push({ kind: "shift", level: "minimum", shiftId: s.id, need: min, eligible })
    else if (eligible < cap) out.push({ kind: "shift", level: "capacity", shiftId: s.id, need: cap, eligible })
  }
  // Groups of shifts sharing one instant: at each start, the open shifts running then, none cumulable.
  const seen = new Set<string>()
  for (const s of model.open) {
    const at = model.interval.get(s.id)!.start
    const group = model.open.filter((o) => {
      const i = model.interval.get(o.id)!
      return i.start <= at && i.end > at && !o.overlapAllowed
    })
    if (group.length < 2) continue
    const ids = group.map((g) => g.id).sort()
    const key = ids.join(",")
    if (seen.has(key)) continue
    seen.add(key)
    const union = new Set(group.flatMap((g) => model.candidates.get(g.id)!))
    const minNeed = group.reduce((n, g) => n + model.critical.get(g.id)!, 0)
    const capNeed = group.reduce((n, g) => n + model.free.get(g.id)!, 0)
    // Only when no single-shift certificate already explains it.
    const explained = ids.some((id) => out.some((c) => c.kind === "shift" && c.shiftId === id))
    if (explained) continue
    if (union.size < minNeed) out.push({ kind: "simultaneous", level: "minimum", shiftIds: ids, need: minNeed, eligible: union.size })
    else if (union.size < capNeed) out.push({ kind: "simultaneous", level: "capacity", shiftIds: ids, need: capNeed, eligible: union.size })
  }
  return out
}

/** The outcome of a result: complete, proven impossible to complete, or incomplete. */
export function outcomeOf(score: { critical: number; needs: number }, certs: readonly Certificate[]): ProposalOutcome {
  if (score.critical === 0 && score.needs === 0) return "complete"
  return certs.length > 0 ? "proven_impossible" : "incomplete"
}

export type Violation = { code: string; shiftId?: string; volunteerId?: string }

/**
 * Checks a result against the input from scratch: open shift in scope, selected person, dated
 * availability covering the whole shift, age, reserved poste, not already on it, capacity,
 * overlaps, poste limits and the workload protection on each whole schedule (no finding at all for
 * anyone given a generated mission). Empty: valid. Pure.
 */
export function validateAssignments(input: ProposalInput, assignments: readonly ProposalAssignment[]): Violation[] {
  const v: Violation[] = []
  const policy = input.policy
  if (!policy) return [{ code: "policy_missing" }]
  const shifts = new Map(input.shifts.map((s) => [s.id, s]))
  const people = new Map(input.people.map((p) => [p.id, p]))
  const now = Date.parse(input.now)
  const perShift = new Map<string, number>()
  const perPerson = new Map<string, string[]>()
  const pairs = new Set<string>()
  for (const a of assignments) {
    const key = `${a.shiftId}|${a.volunteerId}`
    if (pairs.has(key)) v.push({ code: "duplicate", ...a })
    pairs.add(key)
    perShift.set(a.shiftId, (perShift.get(a.shiftId) ?? 0) + 1)
    perPerson.set(a.volunteerId, [...(perPerson.get(a.volunteerId) ?? []), a.shiftId])
  }
  for (const a of assignments) {
    const s = shifts.get(a.shiftId)
    const p = people.get(a.volunteerId)
    if (!s || !s.inScope) { v.push({ code: "shift_out_of_scope", ...a }); continue }
    if (!p || !p.inScope) { v.push({ code: "person_out_of_scope", ...a }); continue }
    const interval = shiftInterval({ id: s.id, date: s.date, startTime: s.startTime, endTime: s.endTime }, input.availability.timeZone)
    if (shiftEndsAt({ date: new Date(`${s.date}T00:00:00Z`), startTime: s.startTime, endTime: s.endTime }, input.timeZone).getTime() <= now) v.push({ code: "ended", ...a })
    if (shiftFit(interval, p.answer, input.availability.dates, input.availability.timeZone).state !== "full") v.push({ code: "availability", ...a })
    if (p.liveShiftIds.includes(s.id) || p.fixedShiftIds.includes(s.id)) v.push({ code: "already_on_shift", ...a })
    if (s.minAge != null && (!p.birthDate || shiftsTooYoungFor(p.birthDate, [{ minAge: s.minAge, date: s.date }]).length > 0)) v.push({ code: "min_age", ...a })
    if (s.reservedTags.length > 0 && !memberMayTake(p.tags, s.reservedTags)) v.push({ code: "reserved", ...a })
  }
  for (const [shiftId, n] of perShift) {
    const s = shifts.get(shiftId)
    if (s && s.held + n > s.capacity) v.push({ code: "capacity", shiftId })
  }
  for (const [volunteerId, ids] of perPerson) {
    const p = people.get(volunteerId)
    if (!p) continue
    const all = [...new Set([...p.fixedShiftIds, ...ids])].map((id) => shifts.get(id)).filter((s) => !!s)
    for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) if (shiftsClash(all[i]!, all[j]!)) v.push({ code: "overlap", volunteerId, shiftId: all[j]!.id })
    const roles = new Map<string, number>()
    for (const id of [...p.liveShiftIds, ...ids]) {
      const r = shifts.get(id)?.roleName
      if (r) roles.set(r, (roles.get(r) ?? 0) + 1)
    }
    for (const id of ids) {
      const s = shifts.get(id)
      if (s?.maxPerVolunteer != null && roles.get(s.roleName)! > s.maxPerVolunteer) { v.push({ code: "role_limit", volunteerId, shiftId: id }); break }
    }
    if (minorsApply(policy) && !p.birthDate) v.push({ code: "workload_birthdate", volunteerId })
    const duty = all.map((s) => ({ id: s!.id, date: s!.date, startTime: s!.startTime, endTime: s!.endTime, mealOnTheGo: s!.mealOnTheGo, placeId: s!.placeId, placeName: s!.placeName }))
    if (evaluateWorkload(duty, policy, { birthDate: p.birthDate, personal: p.personal }).length > 0) v.push({ code: "workload", volunteerId })
  }
  return v
}
