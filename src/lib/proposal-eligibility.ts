// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { shiftFit, shiftInterval } from "./availability-assist"
import { shiftEndsAt } from "./cancel-deadline"
import { unionLength } from "./interval-union"
import { categoryOf, type ProposalInput, type ProposalPerson, type ProposalShift } from "./proposal-input"
import { memberMayTake } from "./role-reservation"
import { shiftsClash } from "./shift-overlap"
import { shiftsTooYoungFor } from "./utils"
import { dutyInterval, evaluateWorkload, minorsApply, serviceDayOf, type ActivePolicy, type DutyShift, type WorkloadPerson, type WorkloadRule } from "./workload-policy"

/**
 * The assignment proposal (#1172): the model the search works on, and the static eligibility of
 * each person for each seat. Pure and Prisma-free.
 *
 * Static exclusions are the rules that no other generated assignment can lift: availability not
 * covering the whole shift, already on the shift, age, reserved poste, the poste's limit already
 * reached by what the person holds, an overlap with a fixed mission, and the workload rules that
 * only get worse when a mission is added (continuous duty, daily and event caps, rest, meal, days
 * off, travel). The idle-gap rule is the one exception: a later mission can close a gap, so it
 * never excludes a seat here; the search judges it on the whole schedule. Because each static
 * exclusion holds in every possible completion, a seat left without enough eligible people is a
 * proof that it cannot be filled (« impossible démontré »), never a guess.
 */

const MIN = 60_000

export type ExclusionCode =
  | "no_answer"
  | "availability_unknown"
  | "availability_partial"
  | "availability_outside"
  | "already_on_shift"
  | "birthdate_missing"
  | "min_age"
  | "reserved"
  | "role_limit"
  | "overlap"
  | "workload_birthdate"
  | "workload_existing"
  | "workload"

/** Why a person can never take a seat, the first blocker in the order of `ExclusionCode`. */
export type Exclusion = { code: ExclusionCode; rules?: WorkloadRule[]; withShiftId?: string }

/** A person's schedule problem in the search: what makes a set of generated missions invalid. */
export type ScheduleProblem =
  | { code: "overlap"; shiftIds: [string, string] }
  | { code: "role_limit"; roleName: string; max: number }
  | { code: "workload"; rules: WorkloadRule[] }

export type Model = {
  input: ProposalInput
  policy: ActivePolicy
  shifts: ProposalShift[]
  shiftById: Map<string, ProposalShift>
  /** Selected people, ordered by id. */
  people: ProposalPerson[]
  personById: Map<string, ProposalPerson>
  duty: Map<string, DutyShift>
  interval: Map<string, { start: number; end: number }>
  minutes: Map<string, number>
  serviceDay: Map<string, string>
  category: Map<string, string>
  /** In-scope shifts with seats to fill, ordered by start, then id. */
  open: ProposalShift[]
  /** Seats still free on an open shift (capacity minus what is held). */
  free: Map<string, number>
  /** The critical minimum of an open shift: its own minimum raised to its reserve, minus what is held (≥ 0). */
  critical: Map<string, number>
  /** Per open shift, the people statically eligible, ordered by id. */
  candidates: Map<string, string[]>
  /** Per open shift, why each other selected person can never take it. */
  exclusions: Map<string, Map<string, Exclusion>>
  /** Per person, the open shifts they are statically eligible for, ordered by start. */
  options: Map<string, string[]>
  /** Workload evaluations spent while building the model (the static eligibility). */
  setupEvaluations(): number
  /** Whether the static eligibility of every open shift is known (`prepare` ran to its end). */
  ready(): boolean
  /** Computes the static eligibility one open shift at a time, so a caller can stop or yield between them. */
  prepare(): Generator<void, void, void>
  clash(a: string, b: string): boolean
  /** Whether a person's fixed missions plus these generated ones break a hard rule: null when valid. */
  scheduleProblem(personId: string, generated: readonly string[]): ScheduleProblem | null
  /** Workload evaluations spent by `scheduleProblem` (memo misses only). */
  evaluations(): number
  workloadPerson(personId: string): WorkloadPerson
}

const NON_MONOTONE: ReadonlySet<WorkloadRule> = new Set<WorkloadRule>(["idle"])

/** Builds the model of a valid input whose policy is set (the caller checked P14), eligibility included. Pure, deterministic. */
export function buildModel(input: ProposalInput): Model {
  const model = startModel(input)
  for (const _ of model.prepare()) void _
  return model
}

/** The model without its static eligibility yet: `prepare()` computes it step by step. */
export function startModel(input: ProposalInput): Model {
  const policy = input.policy
  if (!policy) throw new Error("buildModel needs a workload policy (P14)")
  const shifts = [...input.shifts].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
  const shiftById = new Map(shifts.map((s) => [s.id, s]))
  const people = [...input.people].filter((p) => p.inScope).sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
  const allPeople = new Map(input.people.map((p) => [p.id, p]))
  const personById = new Map(people.map((p) => [p.id, p]))

  const duty = new Map<string, DutyShift>()
  const interval = new Map<string, { start: number; end: number }>()
  const minutes = new Map<string, number>()
  const serviceDay = new Map<string, string>()
  const category = new Map<string, string>()
  for (const s of shifts) {
    const d: DutyShift = { id: s.id, date: s.date, startTime: s.startTime, endTime: s.endTime, mealOnTheGo: s.mealOnTheGo, placeId: s.placeId, placeName: s.placeName }
    duty.set(s.id, d)
    const i = dutyInterval(d, policy.timeZone)
    interval.set(s.id, { start: i.start, end: i.end })
    minutes.set(s.id, Math.round((i.end - i.start) / MIN))
    serviceDay.set(s.id, serviceDayOf(i.start, policy))
    category.set(s.id, categoryOf(s))
  }

  const clashMemo = new Map<string, boolean>()
  const clash = (a: string, b: string) => {
    if (a === b) return false
    const key = a < b ? `${a}|${b}` : `${b}|${a}`
    let v = clashMemo.get(key)
    if (v === undefined) {
      v = shiftsClash(shiftById.get(a)!, shiftById.get(b)!)
      clashMemo.set(key, v)
    }
    return v
  }

  const workloadPersons = new Map<string, WorkloadPerson>()
  const workloadPerson = (id: string): WorkloadPerson => {
    let w = workloadPersons.get(id)
    if (!w) {
      const p = allPeople.get(id)
      w = { birthDate: p?.birthDate ?? null, personal: p?.personal ?? null }
      workloadPersons.set(id, w)
    }
    return w
  }

  let evaluations = 0
  const findingsOf = (personId: string, ids: readonly string[]) => {
    evaluations++
    return evaluateWorkload(ids.map((id) => duty.get(id)!), policy, workloadPerson(personId))
  }

  const now = Date.parse(input.now)
  const ended = (s: ProposalShift) => shiftEndsAt({ date: new Date(`${s.date}T00:00:00Z`), startTime: s.startTime, endTime: s.endTime }, input.timeZone).getTime() <= now
  const open = shifts
    .filter((s) => s.inScope && s.capacity - s.held > 0 && !ended(s))
    .sort((a, b) => interval.get(a.id)!.start - interval.get(b.id)!.start || (a.id < b.id ? -1 : 1))
  const free = new Map(open.map((s) => [s.id, s.capacity - s.held]))
  const critical = new Map(open.map((s) => {
    const minimum = Math.min(s.capacity, Math.max(s.minVolunteers ?? s.capacity, s.reserve))
    return [s.id, Math.max(0, minimum - s.held)]
  }))

  const minorsOn = minorsApply(policy)
  const fixedFindings = new Map<string, WorkloadRule[]>()

  const candidates = new Map<string, string[]>()
  const exclusions = new Map<string, Map<string, Exclusion>>()
  const options = new Map<string, string[]>(people.map((p) => [p.id, []]))
  let prepared = false
  let setupEvaluations = 0
  function* prepare(): Generator<void, void, void> {
    if (prepared) return
    // Person-level facts first: a fixed schedule that already breaks a lasting rule.
    for (const p of people) {
      if (p.fixedShiftIds.length === 0) continue
      const rules = findingsOf(p.id, p.fixedShiftIds).map((f) => f.rule).filter((r) => !NON_MONOTONE.has(r))
      if (rules.length > 0) fixedFindings.set(p.id, [...new Set(rules)])
    }
    for (const s of open) {
      const ok: string[] = []
      const out = new Map<string, Exclusion>()
      const fitInterval = shiftInterval({ id: s.id, date: s.date, startTime: s.startTime, endTime: s.endTime }, input.availability.timeZone)
      for (const p of people) {
        const why = staticExclusion(s, p, fitInterval)
        if (why) out.set(p.id, why)
        else ok.push(p.id)
      }
      candidates.set(s.id, ok)
      exclusions.set(s.id, out)
      for (const id of ok) options.get(id)!.push(s.id)
      yield
    }
    prepared = true
    setupEvaluations = evaluations
  }

  function staticExclusion(s: ProposalShift, p: ProposalPerson, fitInterval: { start: number; end: number }): Exclusion | null {
    if (!p.answer) return { code: "no_answer" }
    const fit = shiftFit(fitInterval, p.answer, input.availability.dates, input.availability.timeZone)
    if (fit.state !== "full") return { code: fit.state === "partial" ? "availability_partial" : fit.state === "outside" ? "availability_outside" : "availability_unknown" }
    if (p.liveShiftIds.includes(s.id)) return { code: "already_on_shift" }
    if (s.minAge != null) {
      if (!p.birthDate) return { code: "birthdate_missing" }
      if (shiftsTooYoungFor(p.birthDate, [{ minAge: s.minAge, date: s.date }]).length > 0) return { code: "min_age" }
    }
    if (s.reservedTags.length > 0 && !memberMayTake(p.tags, s.reservedTags)) return { code: "reserved" }
    if (s.maxPerVolunteer != null && p.liveShiftIds.filter((id) => shiftById.get(id)?.roleName === s.roleName).length >= s.maxPerVolunteer) return { code: "role_limit" }
    const against = p.fixedShiftIds.find((id) => clash(id, s.id))
    if (against) return { code: "overlap", withShiftId: against }
    if (minorsOn && !p.birthDate) return { code: "workload_birthdate" }
    const existing = fixedFindings.get(p.id)
    if (existing) return { code: "workload_existing", rules: existing }
    const rules = [...new Set(findingsOf(p.id, [...p.fixedShiftIds, s.id]).map((f) => f.rule).filter((r) => !NON_MONOTONE.has(r)))]
    if (rules.length > 0) return { code: "workload", rules }
    return null
  }

  const memo = new Map<string, ScheduleProblem | null>()
  const scheduleProblem = (personId: string, generated: readonly string[]): ScheduleProblem | null => {
    if (generated.length === 0) return null
    const sorted = [...generated].sort()
    const key = `${personId}|${sorted.join(",")}`
    if (memo.has(key)) return memo.get(key)!
    const p = allPeople.get(personId)!
    let problem: ScheduleProblem | null = null
    outer: for (let i = 0; i < sorted.length; i++) {
      for (let j = i + 1; j < sorted.length; j++) {
        if (clash(sorted[i], sorted[j])) { problem = { code: "overlap", shiftIds: [sorted[i], sorted[j]] }; break outer }
      }
    }
    if (!problem) {
      const byRole = new Map<string, number>()
      for (const id of [...p.liveShiftIds, ...sorted]) {
        const r = shiftById.get(id)?.roleName
        if (r) byRole.set(r, (byRole.get(r) ?? 0) + 1)
      }
      for (const id of sorted) {
        const s = shiftById.get(id)!
        if (s.maxPerVolunteer != null && (byRole.get(s.roleName) ?? 0) > s.maxPerVolunteer) { problem = { code: "role_limit", roleName: s.roleName, max: s.maxPerVolunteer }; break }
      }
    }
    if (!problem) {
      // The whole schedule, judged absolutely: a person given generated missions keeps no finding at all.
      const findings = findingsOf(personId, [...p.fixedShiftIds, ...sorted])
      if (findings.length > 0) problem = { code: "workload", rules: [...new Set(findings.map((f) => f.rule))] }
    }
    if (memo.size > 200_000) memo.clear()
    memo.set(key, problem)
    return problem
  }

  return {
    input, policy, shifts, shiftById, people, personById, duty, interval, minutes, serviceDay, category,
    open, free, critical, candidates, exclusions, options,
    setupEvaluations: () => (prepared ? setupEvaluations : evaluations), ready: () => prepared, prepare,
    clash, scheduleProblem, evaluations: () => (prepared ? evaluations - setupEvaluations : 0), workloadPerson,
  }
}

/** The person's duty minutes on the event, missions at the same time counted once (#986). */
export function unionMinutes(model: Pick<Model, "interval">, shiftIds: readonly string[]): number {
  return Math.round(unionLength(shiftIds.map((id) => model.interval.get(id)!)) / MIN)
}
