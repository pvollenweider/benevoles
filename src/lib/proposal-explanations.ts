// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { unionMinutes, type ExclusionCode, type Model } from "./proposal-eligibility"
import { personStats } from "./proposal-objectives"
import { certificates, outcomeOf, type Certificate, type ProposalOutcome } from "./proposal-proofs"
import type { ProposalAssignment, SolveOutcome } from "./proposal-solver"
import { fmtDuration } from "./signup-recap"
import type { WorkloadRule } from "./workload-policy"

/** A duration that never breaks between the number and its unit (« 12 h »). */
const dur = (minutes: number) => fmtDuration(minutes).replace(/ /g, " ")

/**
 * The assignment proposal (#1172): why each person got each seat, why a seat stayed empty, and
 * each person's target against what is planned, as structured, versioned reasons (stored with the
 * run) and the French sentences built from them on display. Pure. The words never claim a unique
 * or optimal choice: a seat is « retenue selon les critères de la proposition ». Nothing here
 * names the reason behind a person's own limits.
 */

export const REPORT_VERSION = 1

export type AssignmentReason = {
  shiftId: string
  volunteerId: string
  /** The goal the seat served: a critical minimum (or the reserve), or a remaining need. */
  seat: "reserve" | "critical" | "need"
  plannedMinutes: number
  targetMinutes: number
  /** Another category than the person's missions of the service day before (rotation). */
  otherCategoryThanDayBefore: boolean
  preferred: boolean
  avoided: boolean
}

export type DynamicBlock = "overlap" | "role_limit" | "workload" | "addable"

export type GapReport = {
  shiftId: string
  missing: number
  missingCritical: number
  reserveMissing: number
  eligible: number
  /** Selected people who can never take it, by first reason. */
  excluded: Partial<Record<ExclusionCode, number>>
  /** Eligible people not on it, by what blocks them in this proposal (`addable`: nothing, the search stopped first). */
  blocked: Partial<Record<DynamicBlock, number>>
  /** The workload rules behind `blocked.workload`, counted per person (a person may break several). */
  workloadRules: Partial<Record<WorkloadRule, number>>
  /** A certificate shows the seat cannot be filled on this scope. */
  proven: boolean
}

export type PersonReport = {
  volunteerId: string
  targetMinutes: number
  plannedMinutes: number
  generatedMinutes: number
  generated: number
  /** Planned minus target, in minutes (negative: below target). */
  gapMinutes: number
  categories: { category: string; days: number }[]
  nightAddOns: number
}

export type ProposalReport = {
  version: typeof REPORT_VERSION
  outcome: ProposalOutcome
  execution: SolveOutcome["execution"]
  stopReason: SolveOutcome["stopReason"]
  certificates: Certificate[]
  assignments: AssignmentReason[]
  gaps: GapReport[]
  people: PersonReport[]
  coverage: { seats: number; filled: number; criticalSeats: number; criticalFilled: number; reserveSeats: number; reserveFilled: number }
  /**
   * Set (true) when no other assignment can cover as many seats: every statically eligible pair of the
   * scope is used, so any other valid set is a strict subset and covers fewer seats (Codex
   * 2026-10-31). Absent otherwise, and on runs stored before it existed. Dropped when a person is
   * scrubbed from the run.
   */
  onlyOne?: true
}

/** The report of a search's result on its model (the model's eligibility computed). */
export function buildReport(model: Model, result: Pick<SolveOutcome, "assignments" | "score" | "execution" | "stopReason">): ProposalReport {
  const genOf = new Map<string, string[]>(model.people.map((p) => [p.id, []]))
  const onShift = new Map<string, string[]>(model.open.map((s) => [s.id, []]))
  for (const a of result.assignments) {
    genOf.get(a.volunteerId)?.push(a.shiftId)
    onShift.get(a.shiftId)?.push(a.volunteerId)
  }
  const certs = certificates(model)
  const provenShift = new Set(certs.flatMap((c) => (c.kind === "shift" ? [c.shiftId] : c.shiftIds)))

  // Seats per shift in time order: the first ones serve the reserve and the minimum.
  const assignments: AssignmentReason[] = []
  const prevDay = (day: string) => new Date(Date.parse(`${day}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10)
  for (const s of model.open) {
    const people = [...onShift.get(s.id)!].sort()
    people.forEach((volunteerId, i) => {
      const p = model.personById.get(volunteerId)!
      const all = [...p.fixedShiftIds, ...genOf.get(volunteerId)!]
      const before = prevDay(model.serviceDay.get(s.id)!)
      const yesterday = all.filter((id) => model.serviceDay.get(id) === before).map((id) => model.category.get(id))
      assignments.push({
        shiftId: s.id, volunteerId,
        seat: i < Math.max(0, s.reserve - s.held) ? "reserve" : i < model.critical.get(s.id)! ? "critical" : "need",
        plannedMinutes: unionMinutes(model, all), targetMinutes: p.targetMinutes,
        otherCategoryThanDayBefore: yesterday.length > 0 && !yesterday.includes(model.category.get(s.id)),
        preferred: p.prefer.includes(s.roleName), avoided: p.avoid.includes(s.roleName),
      })
    })
  }

  const gaps: GapReport[] = []
  for (const s of model.open) {
    const got = onShift.get(s.id)!.length
    const free = model.free.get(s.id)!
    if (got >= free) continue
    const excluded: GapReport["excluded"] = {}
    for (const e of model.exclusions.get(s.id)!.values()) excluded[e.code] = (excluded[e.code] ?? 0) + 1
    const blocked: GapReport["blocked"] = {}
    const workloadRules: GapReport["workloadRules"] = {}
    const on = new Set(onShift.get(s.id)!)
    for (const q of model.candidates.get(s.id)!) {
      if (on.has(q)) continue
      const problem = model.scheduleProblem(q, [...genOf.get(q)!, s.id])
      const code: DynamicBlock = problem ? problem.code : "addable"
      blocked[code] = (blocked[code] ?? 0) + 1
      if (problem?.code === "workload") for (const r of problem.rules) workloadRules[r] = (workloadRules[r] ?? 0) + 1
    }
    gaps.push({
      shiftId: s.id, missing: free - got, missingCritical: Math.max(0, model.critical.get(s.id)! - got),
      reserveMissing: Math.max(0, s.reserve - s.held - got), eligible: model.candidates.get(s.id)!.length,
      excluded, blocked, workloadRules, proven: provenShift.has(s.id),
    })
  }

  const people: PersonReport[] = model.people.map((p) => {
    const gen = genOf.get(p.id)!
    const stats = personStats(model, p.id, gen)
    const all = [...p.fixedShiftIds, ...gen]
    return {
      volunteerId: p.id, targetMinutes: p.targetMinutes, plannedMinutes: stats.minutes, generatedMinutes: unionMinutes(model, gen), generated: gen.length,
      gapMinutes: stats.minutes - p.targetMinutes,
      categories: [...stats.categoryDays].map(([category, days]) => ({ category, days })),
      nightAddOns: all.filter((id) => model.shiftById.get(id)?.night).length,
    }
  })

  let seats = 0, criticalSeats = 0, reserveSeats = 0, filled = 0, criticalFilled = 0, reserveFilled = 0
  for (const s of model.open) {
    const got = onShift.get(s.id)!.length
    const free = model.free.get(s.id)!
    const crit = model.critical.get(s.id)!
    const reserve = Math.max(0, s.reserve - s.held)
    seats += free; criticalSeats += crit; reserveSeats += reserve
    filled += Math.min(got, free); criticalFilled += Math.min(got, crit); reserveFilled += Math.min(got, reserve)
  }

  const eligiblePairs = model.open.reduce((n, s) => n + model.candidates.get(s.id)!.length, 0)
  const onlyOne = result.execution === "finished" && model.ready() && assignments.length === eligiblePairs
  return {
    version: REPORT_VERSION, outcome: outcomeOf(result.score, certs), execution: result.execution, stopReason: result.stopReason,
    certificates: certs, assignments, gaps, people,
    coverage: { seats, filled, criticalSeats, criticalFilled, reserveSeats, reserveFilled },
    ...(onlyOne ? { onlyOne: true as const } : {}),
  }
}

// ── Words ─────────────────────────────────────────────────────────────────────────────────────

/** The state shown to the organiser: the execution first (an interruption), then the outcome. */
export function stateLabel(r: Pick<ProposalReport, "outcome" | "execution">): string {
  if (r.execution === "interrupted") return "Calcul arrêté avant la fin"
  return r.outcome === "complete" ? "Toutes les places couvertes" : r.outcome === "proven_impossible" ? "Couverture complète impossible" : "Couverture partielle"
}

/** One sentence about the state, never a claim of optimality. */
export function stateSentence(r: Pick<ProposalReport, "outcome" | "execution" | "stopReason">): string {
  if (r.execution === "interrupted") {
    return r.stopReason === "cancelled"
      ? "Vous avez arrêté la recherche : la proposition montrée est la meilleure trouvée jusque-là. Elle n'est écrite dans les brouillons que si vous le choisissez."
      : "Le temps de calcul est écoulé : la proposition montrée est la meilleure trouvée jusque-là. Elle n'est écrite dans les brouillons que si vous le choisissez."
  }
  if (r.outcome === "complete") return "Tous les besoins choisis sont couverts, réserve comprise, sans enfreindre aucune règle. Les objectifs d'heures, la rotation et les préférences restent des objectifs : comparez avant de publier."
  if (r.outcome === "proven_impossible") return "Certains besoins de ce périmètre ne peuvent être couverts par personne, quelle que soit la répartition : les places restantes sont signalées ci-dessous, avec leur raison."
  return "Des besoins restent sans personne. Rien ne prouve qu'ils sont impossibles à couvrir : la recherche n'a pas trouvé de répartition qui les couvre en respectant toutes les règles."
}

const EXCLUSION_WORDS: Record<ExclusionCode, [string, string]> = {
  no_answer: ["n'a pas donné ses disponibilités", "n'ont pas donné leurs disponibilités"],
  availability_unknown: ["n'a pas répondu pour ces heures", "n'ont pas répondu pour ces heures"],
  availability_partial: ["n'est disponible que sur une partie du créneau", "ne sont disponibles que sur une partie du créneau"],
  availability_outside: ["n'est pas disponible à ces heures", "ne sont pas disponibles à ces heures"],
  already_on_shift: ["est déjà inscrite sur ce créneau", "sont déjà inscrites sur ce créneau"],
  birthdate_missing: ["n'a pas de date de naissance connue (âge minimum)", "n'ont pas de date de naissance connue (âge minimum)"],
  min_age: ["n'a pas l'âge minimum", "n'ont pas l'âge minimum"],
  reserved: ["n'a pas l'étiquette requise", "n'ont pas l'étiquette requise"],
  role_limit: ["a déjà atteint la limite de ce poste", "ont déjà atteint la limite de ce poste"],
  overlap: ["a une mission à la même heure", "ont une mission à la même heure"],
  workload_birthdate: ["n'a pas de date de naissance connue (protection des moins de 18 ans)", "n'ont pas de date de naissance connue (protection des moins de 18 ans)"],
  workload_existing: ["a déjà un programme hors des limites de charge", "ont déjà un programme hors des limites de charge"],
  workload: ["dépasserait les pauses et limites de charge", "dépasseraient les pauses et limites de charge"],
}

const RULE_WORDS: Record<WorkloadRule, string> = {
  continuous: "la durée maximale sans vraie pause",
  daily: "la durée maximale par journée de service",
  event: "la durée maximale sur l'événement",
  rest: "le repos entre deux journées de service",
  idle: "l'attente maximale entre deux missions",
  meal: "la pause repas",
  offday: "les jours sans mission",
  travel: "le trajet entre deux lieux",
  places: "deux lieux en même temps",
}

const count = (n: number, one: string, many: string) => `${n} ${n > 1 ? many : one}`

/** « Disponible sur tout le créneau. Charge prévue : 24 h pour un objectif de 30 h. Autre catégorie que la veille. » */
export function assignmentSentence(r: AssignmentReason): string {
  const parts = ["Disponible sur tout le créneau."]
  if (r.seat === "reserve") parts.push("Place de la réserve demandée.")
  else if (r.seat === "critical") parts.push("Place du minimum de ce créneau.")
  parts.push(r.targetMinutes > 0 ? `Charge prévue : ${dur(r.plannedMinutes)} pour un objectif de ${dur(r.targetMinutes)}.` : `Charge prévue : ${dur(r.plannedMinutes)}, sans objectif d'heures.`)
  if (r.otherCategoryThanDayBefore) parts.push("Autre activité que la veille.")
  if (r.preferred) parts.push("Poste souhaité.")
  if (r.avoided) parts.push("Poste à éviter : aucune autre personne ne convenait mieux selon les critères de la proposition.")
  return parts.join(" ")
}

/** Why a seat is empty, in words: who is excluded and why, then what blocks the others here. */
export function gapSentence(g: GapReport): string {
  const parts = [`${count(g.missing, "place reste", "places restent")} sans personne${g.missingCritical > 0 ? `, dont ${count(g.missingCritical, "place", "places")} du minimum` : ""}${g.reserveMissing > 0 ? ` et ${count(g.reserveMissing, "place", "places")} de la réserve` : ""}.`]
  if (g.eligible === 0 && (g.excluded.no_answer ?? 0) + (g.excluded.availability_unknown ?? 0) + (g.excluded.availability_partial ?? 0) + (g.excluded.availability_outside ?? 0) === Object.values(g.excluded).reduce((n, v) => n + (v ?? 0), 0)) {
    parts.push("Aucune disponibilité ne couvre entièrement ce créneau.")
  } else {
    const excluded = (Object.entries(g.excluded) as [ExclusionCode, number][]).filter(([, n]) => n > 0)
    if (excluded.length > 0) parts.push(`Parmi les personnes choisies, ${excluded.map(([code, n]) => `${n} ${EXCLUSION_WORDS[code][n > 1 ? 1 : 0]}`).join(", ")}.`)
    const blocked = g.blocked
    const words: string[] = []
    if (blocked.overlap) words.push(`${blocked.overlap} ${blocked.overlap > 1 ? "ont" : "a"} une autre mission proposée à la même heure`)
    if (blocked.role_limit) words.push(`${blocked.role_limit} ${blocked.role_limit > 1 ? "atteindraient" : "atteindrait"} la limite de ce poste`)
    if (blocked.workload) {
      const rules = (Object.entries(g.workloadRules) as [WorkloadRule, number][]).sort((a, b) => b[1] - a[1]).map(([r]) => RULE_WORDS[r])
      words.push(`${blocked.workload} ${blocked.workload > 1 ? "dépasseraient" : "dépasserait"} ${rules.join(", ")}`)
    }
    if (words.length > 0) parts.push(`Parmi les ${count(g.eligible, "personne disponible", "personnes disponibles")} sur tout le créneau, ${words.join(", ")}.`)
    if (blocked.addable) parts.push("Aucune affectation supplémentaire trouvée dans le temps de calcul.")
  }
  if (g.proven) parts.push("Impossible à pourvoir : il n'y a pas assez de personnes pouvant prendre ce créneau.")
  return parts.join(" ")
}

/** The person's line: target, planned and the gap, in words. */
export function personSentence(p: PersonReport): string {
  if (p.targetMinutes === 0) return `${dur(p.plannedMinutes)} prévues, sans objectif d'heures.`
  const gap = p.gapMinutes === 0 ? "objectif atteint" : p.gapMinutes < 0 ? `${dur(-p.gapMinutes)} sous l'objectif` : `${dur(p.gapMinutes)} au-dessus de l'objectif`
  return `${dur(p.plannedMinutes)} prévues pour un objectif de ${dur(p.targetMinutes)} : ${gap}.`
}

/** The generated assignments a report explains, for a caller that only kept the report. */
export function assignmentsOf(r: Pick<ProposalReport, "assignments">): ProposalAssignment[] {
  return r.assignments.map(({ shiftId, volunteerId }) => ({ shiftId, volunteerId }))
}
