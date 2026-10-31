// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import type { AnswerForFit } from "./availability-assist"
import type { ActivePolicy, PersonalLimits } from "./workload-policy"

/**
 * The generated assignment proposal (#1172), its input: one frozen snapshot of everything the
 * search reads, built by the server and never read back from the database during the search.
 * Pure and Prisma-free. It holds ids, hours and rules, never names, emails or tokens; it is still
 * personal data (availability, birth dates, tags), kept and erased like the drafts.
 *
 * The product contract (PRODUCT.md, amended for #1172): the tool proposes, it never publishes.
 * What the search produces becomes ordinary draft assignments (`source: "proposal"`) that the
 * organiser compares, locks, adjusts and publishes with the existing all-or-nothing publication.
 *
 * Hard rules, never traded for coverage: dated availability covering the whole shift (no answer is
 * never « available », a partial cover is not admissible), capacity, minimum age, reserved postes,
 * overlaps (#986), the limit per person of a poste (#466), the event's workload protection (#1171)
 * judged on each person's whole resulting schedule, and every fixed assignment (committed
 * registrations and preserved drafts are inputs, never moved). Soft goals, compared in this order
 * and never mixed into one weighted sum: 1 critical minimums (the shift's minimum, raised to its
 * standby reserve), 2 remaining needs, 3 load against each person's own target, 4 rotation across
 * activity categories, 5 the organiser's preferences per person.
 */

/** Bumped whenever the meaning of a field changes: a stored run says which version it read. */
export const PROPOSAL_INPUT_VERSION = 1

export type ProposalShift = {
  id: string
  /** The poste (Shift.roleName): role-level rules and the default rotation category. */
  roleName: string
  /** Civil date "YYYY-MM-DD" (Shift.date); an end at or before the start is the next morning. */
  date: string
  startTime: string
  endTime: string
  capacity: number
  /** Shift.minVolunteers (#949); null: the minimum is the capacity. */
  minVolunteers: number | null
  /** Places already held, which the proposal never moves: occupying registrations and preserved drafts. */
  held: number
  /** « Cumulable avec un autre créneau » (#986). */
  overlapAllowed: boolean
  minAge: number | null
  /** The poste's reserved tags (#470), empty: open to every member. */
  reservedTags: string[]
  /** The poste's limit per person (#466), null: none. */
  maxPerVolunteer: number | null
  /** « Repas sur le pouce possible » (#1171). */
  mealOnTheGo: boolean
  placeId: string | null
  placeName: string | null
  /** The rotation category chosen by the organiser; null: the poste is its own category. */
  category: string | null
  /** Marked by the organiser as a night add-on (spread, at most N per person). Never guessed from the hours. */
  night: boolean
  /** Standby reserve asked on this shift (R09): people to keep there, a critical minimum. 0: none. */
  reserve: number
  /** Seats of this shift are to be filled. Out of scope, the shift only appears in someone's fixed duty. */
  inScope: boolean
}

export type ProposalPerson = {
  id: string
  birthDate: string | null
  tags: string[]
  /** The person's dated availability on the event, or null when never asked or never answered. */
  answer: AnswerForFit | null
  /** Shifts the person holds that the proposal never moves: committed registrations and preserved drafts. */
  fixedShiftIds: string[]
  /** Every shift with a live registration (any live status) or a preserved draft: never proposed again, counted by poste limits. */
  liveShiftIds: string[]
  /** The person's own stricter limits on the event (#1171). */
  personal: PersonalLimits | null
  /** The organiser's hour target for the event, in minutes; 0: no target (used only when needs require it). */
  targetMinutes: number
  /** Postes (roleName) the organiser wishes, or wishes to avoid, for this person: soft, never above a hard rule (C05). */
  prefer: string[]
  avoid: string[]
  /** Selected for the proposal: may receive generated assignments. */
  inScope: boolean
}

export type ProposalBudget = {
  /** Workload evaluations the search may spend: the same budget always stops at the same place. */
  evaluations: number
  /** Iterations without a better proposal before a restart from the best one. */
  stagnation: number
}

export type ProposalInput = {
  version: typeof PROPOSAL_INPUT_VERSION
  eventId: string
  /** The reference instant (ISO) for « already over »: frozen with the snapshot, never the clock of the search. */
  now: string
  /** The organisation's zone, for when a shift ends. */
  timeZone: string
  /** The event's frozen availability zone and dates. */
  availability: { timeZone: string; dates: string[] }
  /** The event's workload protection, complete and on; null: generation refused (P14). */
  policy: ActivePolicy | null
  rotation: { maxConsecutiveDays: number | null; maxNightAddOns: number | null }
  seed: number
  /**
   * « Proposer une autre répartition »: the first construction already breaks ties by the seed
   * (as a restart does), so another seed can lead to another assignment. Absent: false (a first
   * proposal is built in a fixed order).
   */
  diversify?: boolean
  budget: ProposalBudget
  shifts: ProposalShift[]
  people: ProposalPerson[]
}

/**
 * The default budget, from the benchmark (scripts/proposal-benchmark.ts, 2026-10-30): on the pilot
 * (36 people, 210 seats) every seat and every target is reached by 5 000 evaluations, about 1 s on
 * a laptop; on a team too small for its needs, more budget still fills a few more seats (12 left
 * after the construction, 5 to 7 at 20 000, 4 at 60 000, in 7 s and 22 s). 20 000 stays well inside
 * the 30 s deadline on a slower server.
 */
export const DEFAULT_PROPOSAL_BUDGET: ProposalBudget = { evaluations: 20_000, stagnation: 1_500 }

/** The hard ceiling of one search, whatever the budget: the organiser waits at most this long. */
export const PROPOSAL_DEADLINE_MS = 30_000

/** At most this many people and seats in one proposal: a festival team, not a bulk import. */
export const MAX_PROPOSAL_PEOPLE = 300
export const MAX_PROPOSAL_SHIFTS = 2_000

/** The default rotation thresholds, offered as a one-click suggestion (owner's pilot values, 2026-10-30). */
export const ROTATION_SUGGESTION = { maxConsecutiveDays: 2, maxNightAddOns: 2 } as const

/** The suggested hours per selected date the person declared some availability on (owner's pilot value). */
export const TARGET_MINUTES_PER_DAY_SUGGESTION = 6 * 60

/**
 * The suggested target of a person: 6 h per selected date on which they declared at least one free
 * range, capped by the event's (or their own) maximum over the event. A suggestion the organiser
 * applies and edits, never a hidden default.
 */
export function suggestedTargetMinutes(answer: AnswerForFit | null, dates: readonly string[], cap: number | null, perDay: number = TARGET_MINUTES_PER_DAY_SUGGESTION): number {
  if (!answer) return 0
  const chosen = new Set(dates)
  const days = answer.days.filter((d) => chosen.has(d.date) && d.ranges.some((r) => new Date(r.endsAt).getTime() > new Date(r.startsAt).getTime())).length
  const raw = days * perDay
  return cap != null ? Math.min(raw, cap) : raw
}

/** The rotation category of a shift: the organiser's, or the poste itself. Never inferred from similar names. */
export const categoryOf = (s: Pick<ProposalShift, "category" | "roleName">): string => s.category ?? `poste:${s.roleName}`

/** What is wrong with an input's shape (ids unique, references known, numbers sane), or null. Pure. */
export function inputProblem(input: ProposalInput): string | null {
  if (input.version !== PROPOSAL_INPUT_VERSION) return "version"
  if (input.people.length > MAX_PROPOSAL_PEOPLE) return "too_many_people"
  if (input.shifts.length > MAX_PROPOSAL_SHIFTS) return "too_many_shifts"
  const shiftIds = new Set<string>()
  for (const s of input.shifts) {
    if (shiftIds.has(s.id)) return "duplicate_shift"
    shiftIds.add(s.id)
    if (!Number.isInteger(s.capacity) || s.capacity < 0 || !Number.isInteger(s.held) || s.held < 0) return "shift_numbers"
    if (!Number.isInteger(s.reserve) || s.reserve < 0 || s.reserve > s.capacity) return "reserve"
  }
  const personIds = new Set<string>()
  for (const p of input.people) {
    if (personIds.has(p.id)) return "duplicate_person"
    personIds.add(p.id)
    if (!Number.isInteger(p.targetMinutes) || p.targetMinutes < 0) return "target"
    if (p.fixedShiftIds.some((id) => !shiftIds.has(id))) return "unknown_fixed_shift"
  }
  const b = input.budget
  if (!Number.isInteger(b.evaluations) || b.evaluations < 0 || !Number.isInteger(b.stagnation) || b.stagnation < 1) return "budget"
  return null
}
