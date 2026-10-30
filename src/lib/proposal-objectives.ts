// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { unionMinutes, type Model } from "./proposal-eligibility"

/**
 * The assignment proposal (#1172): its soft goals, compared lexicographically, never as one
 * weighted sum (a preference never makes up for a missing minimum). Pure. In order:
 *
 * 1. critical minimums: Σ max(0, minimum − covered), the minimum raised to the standby reserve;
 * 2. remaining needs: Σ max(0, capacity − max(minimum, covered));
 * 3. load against each person's own target (C04: fairness against commitments, not equal hours):
 *    the relative shortfalls max(0, T − P) / T sorted from the largest, compared element by element
 *    (the worst-off person first), then the minutes given to people without a target (they are
 *    used only when needs require it), then the total relative excess. P is the person's whole duty on
 *    the event, missions at the same time counted once;
 * 4. rotation: days beyond the allowed run on one category, night add-ons beyond the cap, then the
 *    concentration of days on the same categories (a category counts once per person and day);
 * 5. preferences: missions on a poste to avoid, then fewer missions on a wished poste.
 */

/** Ratios in millionths, integers: the same inputs always compare the same way. */
const PPM = 1_000_000

export type Score = {
  critical: number
  needs: number
  /** Relative shortfalls of the people with a target, largest first (ppm). */
  shortfalls: number[]
  zeroTargetMinutes: number
  excess: number
  consecutive: number
  nights: number
  concentration: number
  avoided: number
  preferred: number
}

export type PersonStats = {
  minutes: number
  shortfall: number
  excess: number
  zeroTargetMinutes: number
  consecutive: number
  nights: number
  concentration: number
  avoided: number
  preferred: number
  /** Days per category, for the explanations. */
  categoryDays: Map<string, number>
}

const DAY_MS = 86_400_000
const dayIndex = (iso: string) => Math.round(Date.parse(`${iso}T00:00:00Z`) / DAY_MS)

/** One person's share of the score, with these generated missions. */
export function personStats(model: Model, personId: string, generated: readonly string[]): PersonStats {
  const p = model.personById.get(personId)!
  const all = [...p.fixedShiftIds, ...generated]
  const minutes = unionMinutes(model, all)
  const T = p.targetMinutes
  const shortfall = T > 0 && minutes < T ? Math.floor(((T - minutes) * PPM) / T) : 0
  const excess = T > 0 && minutes > T ? Math.floor(((minutes - T) * PPM) / T) : 0
  const zeroTargetMinutes = T > 0 ? 0 : unionMinutes(model, generated)

  const daysOf = new Map<string, Set<number>>()
  let nightCount = 0
  for (const id of all) {
    const cat = model.category.get(id)!
    const day = dayIndex(model.serviceDay.get(id)!)
    let set = daysOf.get(cat)
    if (!set) daysOf.set(cat, (set = new Set()))
    set.add(day)
    if (model.shiftById.get(id)!.night) nightCount++
  }
  const { maxConsecutiveDays, maxNightAddOns } = model.input.rotation
  let consecutive = 0
  let concentration = 0
  const categoryDays = new Map<string, number>()
  for (const [cat, set] of [...daysOf].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
    const days = [...set].sort((a, b) => a - b)
    categoryDays.set(cat, days.length)
    concentration += days.length * days.length
    if (maxConsecutiveDays == null) continue
    let run = 1
    for (let i = 1; i <= days.length; i++) {
      if (i < days.length && days[i] === days[i - 1] + 1) run++
      else {
        consecutive += Math.max(0, run - maxConsecutiveDays)
        run = 1
      }
    }
  }
  const nights = maxNightAddOns == null ? 0 : Math.max(0, nightCount - maxNightAddOns)
  const avoid = new Set(p.avoid)
  const prefer = new Set(p.prefer)
  let avoided = 0
  let preferred = 0
  for (const id of generated) {
    const role = model.shiftById.get(id)!.roleName
    if (avoid.has(role)) avoided++
    if (prefer.has(role)) preferred++
  }
  return { minutes, shortfall, excess, zeroTargetMinutes, consecutive, nights, concentration, avoided, preferred, categoryDays }
}

/** The coverage part of the score, from the generated people per open shift. */
export function coverage(model: Model, filled: (shiftId: string) => number): { critical: number; needs: number } {
  let critical = 0
  let needs = 0
  for (const s of model.open) {
    const got = filled(s.id)
    const min = model.critical.get(s.id)!
    const cap = model.free.get(s.id)!
    critical += Math.max(0, min - got)
    needs += Math.max(0, cap - Math.max(min, got))
  }
  return { critical, needs }
}

/** The whole score from the coverage and every selected person's stats (with whether they have a target). */
export function assembleScore(cov: { critical: number; needs: number }, people: Iterable<{ stats: PersonStats; hasTarget: boolean }>): Score {
  const shortfalls: number[] = []
  let excess = 0, zeroTargetMinutes = 0, consecutive = 0, nights = 0, concentration = 0, avoided = 0, preferred = 0
  for (const { stats: s, hasTarget } of people) {
    if (hasTarget) shortfalls.push(s.shortfall)
    excess += s.excess
    zeroTargetMinutes += s.zeroTargetMinutes
    consecutive += s.consecutive
    nights += s.nights
    concentration += s.concentration
    avoided += s.avoided
    preferred += s.preferred
  }
  shortfalls.sort((a, b) => b - a)
  return { ...cov, shortfalls, excess, zeroTargetMinutes, consecutive, nights, concentration, avoided, preferred }
}

/** Negative when `a` is better than `b`, positive when worse, 0 when equal: the lexicographic order above. */
export function compareScores(a: Score, b: Score): number {
  if (a.critical !== b.critical) return a.critical - b.critical
  if (a.needs !== b.needs) return a.needs - b.needs
  const n = Math.max(a.shortfalls.length, b.shortfalls.length)
  for (let i = 0; i < n; i++) {
    const x = a.shortfalls[i] ?? 0
    const y = b.shortfalls[i] ?? 0
    if (x !== y) return x - y
  }
  if (a.zeroTargetMinutes !== b.zeroTargetMinutes) return a.zeroTargetMinutes - b.zeroTargetMinutes
  if (a.excess !== b.excess) return a.excess - b.excess
  if (a.consecutive !== b.consecutive) return a.consecutive - b.consecutive
  if (a.nights !== b.nights) return a.nights - b.nights
  if (a.concentration !== b.concentration) return a.concentration - b.concentration
  if (a.avoided !== b.avoided) return a.avoided - b.avoided
  return b.preferred - a.preferred
}

/** The goal level a comparison was decided at (1 to 5), 0 when equal: for the explanations and tests. */
export function decidingLevel(a: Score, b: Score): 0 | 1 | 2 | 3 | 4 | 5 {
  if (a.critical !== b.critical) return 1
  if (a.needs !== b.needs) return 2
  const n = Math.max(a.shortfalls.length, b.shortfalls.length)
  for (let i = 0; i < n; i++) if ((a.shortfalls[i] ?? 0) !== (b.shortfalls[i] ?? 0)) return 3
  if (a.excess !== b.excess || a.zeroTargetMinutes !== b.zeroTargetMinutes) return 3
  if (a.consecutive !== b.consecutive || a.nights !== b.nights || a.concentration !== b.concentration) return 4
  if (a.avoided !== b.avoided || a.preferred !== b.preferred) return 5
  return 0
}
