// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import type { AnswerForFit } from "../../availability-assist"
import { buildModel } from "../../proposal-eligibility"
import { PROPOSAL_INPUT_VERSION, type ProposalInput, type ProposalPerson, type ProposalShift } from "../../proposal-input"
import { assembleScore, compareScores, coverage, personStats, type Score } from "../../proposal-objectives"
import type { ProposalAssignment } from "../../proposal-solver"
import { localDateTimeToUtc } from "../../time-zone"
import { activePolicy, buildPolicy, type WorkloadPolicyValues } from "../../workload-policy"
import { PILOT_POLICY_VALUES } from "./proposal-pilot"

/** Small hand-made proposal inputs (#1172), and the exhaustive search used as an oracle on them. */

export const TZ = "Europe/Zurich"
export const DATES = ["2031-07-10", "2031-07-11", "2031-07-12"]

export function policyOf(values: Partial<WorkloadPolicyValues> = {}) {
  return activePolicy(buildPolicy({ ...PILOT_POLICY_VALUES, ...values }, TZ), { startDate: DATES[0], endDate: DATES[DATES.length - 1] })
}

export function freeRange(date: string, startTime: string, endTime: string) {
  const base = new Date(`${date}T00:00:00Z`)
  const [h, m] = endTime.split(":").map(Number)
  const end = h * 60 + m + (endTime <= startTime ? 24 * 60 : 0)
  return { startTime, endTime, startsAt: localDateTimeToUtc(base, startTime, TZ), endsAt: localDateTimeToUtc(base, `${Math.floor(end / 60)}:${String(end % 60).padStart(2, "0")}`, TZ) }
}

/** Free all day and night on every date, or on the dates given. */
export function allDay(id: string, dates: readonly string[] = DATES): AnswerForFit {
  return { requestId: `req-${id}`, revision: 1, days: dates.map((date) => ({ date, ranges: [freeRange(date, "06:00", "06:00")] })) }
}

export function tShift(id: string, date: string, startTime: string, endTime: string, extra: Partial<ProposalShift> = {}): ProposalShift {
  return {
    id, roleName: "Accueil", date, startTime, endTime, capacity: 1, minVolunteers: null, held: 0, overlapAllowed: false, minAge: null,
    reservedTags: [], maxPerVolunteer: null, mealOnTheGo: true, placeId: null, placeName: null, category: null, night: false, reserve: 0, inScope: true, ...extra,
  }
}

export function tPerson(id: string, extra: Partial<ProposalPerson> = {}): ProposalPerson {
  return {
    id, birthDate: "1990-04-02", tags: [], answer: allDay(id), fixedShiftIds: [], liveShiftIds: [], personal: null, targetMinutes: 0,
    prefer: [], avoid: [], inScope: true, ...extra,
  }
}

export function tInput(shifts: ProposalShift[], people: ProposalPerson[], extra: Partial<ProposalInput> = {}): ProposalInput {
  return {
    version: PROPOSAL_INPUT_VERSION, eventId: "evt-tiny", now: "2031-07-01T08:00:00.000Z", timeZone: TZ,
    availability: { timeZone: TZ, dates: DATES }, policy: policyOf(), rotation: { maxConsecutiveDays: 2, maxNightAddOns: 2 },
    seed: 7, budget: { evaluations: 5_000, stagnation: 200 }, shifts, people, ...extra,
  }
}

/** The best score over every valid assignment (tiny inputs only: the search space is a product of subsets). */
export function exhaustiveBest(input: ProposalInput): { score: Score; assignments: ProposalAssignment[] } {
  const model = buildModel(input)
  const open = model.open
  let best: { score: Score; assignments: ProposalAssignment[] } | null = null
  const choice: string[][] = []
  const subsets = (items: string[], max: number): string[][] => {
    const out: string[][] = [[]]
    for (const item of items) for (const s of [...out]) if (s.length < max) out.push([...s, item])
    return out
  }
  const recurse = (i: number) => {
    if (i === open.length) {
      const gen = new Map<string, string[]>(model.people.map((p) => [p.id, []]))
      choice.forEach((people, k) => people.forEach((p) => gen.get(p)!.push(open[k].id)))
      for (const [p, ids] of gen) if (model.scheduleProblem(p, ids)) return
      const filled = new Map(open.map((s, k) => [s.id, choice[k].length]))
      const score = assembleScore(coverage(model, (id) => filled.get(id) ?? 0), model.people.map((p) => ({ stats: personStats(model, p.id, gen.get(p.id)!), hasTarget: p.targetMinutes > 0 })))
      if (!best || compareScores(score, best.score) < 0) best = { score, assignments: open.flatMap((s, k) => choice[k].map((volunteerId) => ({ shiftId: s.id, volunteerId }))) }
      return
    }
    for (const subset of subsets(model.candidates.get(open[i].id)!, model.free.get(open[i].id)!)) {
      choice[i] = subset
      recurse(i + 1)
    }
  }
  recurse(0)
  return best!
}
