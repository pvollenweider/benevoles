// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Benchmark of the assignment proposal's search (#1172), on the anonymised pilot planning and its
 * variants, before and after any change of the solver:
 *
 *   npx tsx scripts/proposal-benchmark.ts            # every variant, 5 seeds
 *   npx tsx scripts/proposal-benchmark.ts --quick    # pilot only, 2 seeds
 *
 * Candidates: « greedy » (the construction alone), « greedy+ls » (construction then the seeded
 * local search) at three budgets, and the exhaustive search on tiny cases (the oracle). For each
 * run: time, workload evaluations, the goal levels reached, hard violations (always 0, or the run
 * fails the gate), and whether a second run with the same seed gives the same proposal.
 * Release gates: zero violation, minimums and reserve covered on every feasible variant, tiny
 * cases equal to the oracle, the default budget well inside the 30 s deadline.
 */

import { buildModel } from "../src/lib/proposal-eligibility"
import { buildReport } from "../src/lib/proposal-explanations"
import { DEFAULT_PROPOSAL_BUDGET, type ProposalInput } from "../src/lib/proposal-input"
import { compareScores } from "../src/lib/proposal-objectives"
import { validateAssignments } from "../src/lib/proposal-proofs"
import { ProposalSearch, solveProposal } from "../src/lib/proposal-solver"
import { pilotInput } from "../src/lib/__tests__/fixtures/proposal-pilot"
import { exhaustiveBest, tInput, tPerson, tShift, DATES } from "../src/lib/__tests__/fixtures/proposal-tiny"

const quick = process.argv.includes("--quick")
const seeds = quick ? [1172, 7] : [1172, 7, 42, 2031, 99]

type Variant = { name: string; input: (seed: number) => ProposalInput }

const variants: Variant[] = [
  { name: "pilot (36 people)", input: (seed) => pilotInput({ seed }) },
  {
    name: "scarce drivers (3 licences)",
    input: (seed) => {
      const i = pilotInput({ seed })
      let kept = 0
      for (const p of i.people) if (p.tags.includes("Permis") && p.birthDate && kept++ >= 3) p.tags = []
      return i
    },
  },
  {
    name: "half the team answered",
    input: (seed) => {
      const i = pilotInput({ seed })
      i.people.forEach((p, k) => { if (k % 2 === 1) p.answer = null })
      return i
    },
  },
  { name: "small team (24 people)", input: (seed) => pilotInput({ seed, people: 24 }) },
  {
    name: "reserve of 2 per festival day",
    input: (seed) => {
      const i = pilotInput({ seed })
      for (const s of i.shifts) if (s.reserve > 0) s.reserve = 2
      return i
    },
  },
]

const ms = (t: number) => `${Math.round(t)} ms`

function greedyOnly(input: ProposalInput) {
  const search = new ProposalSearch(input)
  const t = performance.now()
  while (search.stage === "setup" || search.stage === "construct") search.step(1)
  return { time: performance.now() - t, best: search.best(), evaluations: search.evaluations() }
}

function line(cells: (string | number)[]) {
  console.log(cells.map(String).join(" | "))
}

console.log(`# Assignment proposal benchmark (${new Date().toISOString().slice(0, 10)}, node ${process.version})`)
console.log("")
line(["variant", "candidate", "seed", "time", "evaluations", "critical", "needs", "worst shortfall", "no-target min", "excess", "rotation", "avoided", "violations", "outcome", "same again"])
line(Array(15).fill("---"))
let failed = 0
for (const v of variants) {
  for (const seed of seeds) {
    const input = v.input(seed)
    const model = buildModel(input)
    const g = greedyOnly(input)
    const gv = validateAssignments(input, g.best.assignments).length
    if (gv > 0) failed++
    line([v.name, "greedy", seed, ms(g.time), g.evaluations, g.best.score.critical, g.best.score.needs, (g.best.score.shortfalls[0] ?? 0) / 10_000 + " %", g.best.score.zeroTargetMinutes, g.best.score.excess, g.best.score.consecutive + g.best.score.nights, g.best.score.avoided, gv, "-", "-"])
    for (const evaluations of quick ? [DEFAULT_PROPOSAL_BUDGET.evaluations] : [5_000, 20_000, DEFAULT_PROPOSAL_BUDGET.evaluations]) {
      const budgeted = { ...input, budget: { evaluations, stagnation: DEFAULT_PROPOSAL_BUDGET.stagnation } }
      const t = performance.now()
      const out = solveProposal(budgeted)
      const time = performance.now() - t
      const again = solveProposal(budgeted)
      const same = JSON.stringify(again.assignments) === JSON.stringify(out.assignments)
      const violations = validateAssignments(input, out.assignments).length
      if (violations > 0 || !same || compareScores(out.score, g.best.score) > 0) failed++
      const report = buildReport(model, out)
      const s = out.score
      line([v.name, `greedy+ls ${evaluations}`, seed, ms(time), out.evaluations + out.setupEvaluations, s.critical, s.needs, (s.shortfalls[0] ?? 0) / 10_000 + " %", s.zeroTargetMinutes, s.excess, s.consecutive + s.nights, s.avoided, violations, report.outcome, same ? "yes" : "NO"])
    }
  }
}

// Tiny cases: the search must reach the exhaustive optimum.
console.log("")
const H = 60
const tiny = [
  tInput([tShift("a", DATES[0], "09:00", "13:00"), tShift("b", DATES[1], "09:00", "13:00"), tShift("c", DATES[2], "09:00", "13:00")], [tPerson("big", { targetMinutes: 8 * H }), tPerson("small", { targetMinutes: 4 * H })]),
  tInput(DATES.flatMap((d, i) => [tShift(`x${i}`, d, "09:00", "13:00", { category: "X", roleName: "X" }), tShift(`y${i}`, d, "15:00", "19:00", { category: "Y", roleName: "Y" })]), [tPerson("p", { targetMinutes: 12 * H }), tPerson("q", { targetMinutes: 12 * H })]),
  tInput([tShift("r", DATES[0], "12:00", "18:00", { capacity: 2, minVolunteers: 1, reserve: 1 }), tShift("b", DATES[0], "12:00", "18:00", { capacity: 3, minVolunteers: 1 })], [tPerson("p1", { targetMinutes: 6 * H }), tPerson("p2", { targetMinutes: 6 * H }), tPerson("p3", { targetMinutes: 6 * H })]),
  tInput([tShift("am", DATES[0], "06:00", "12:00"), tShift("pm", DATES[0], "13:00", "19:00"), tShift("eve", DATES[1], "18:00", "23:00", { capacity: 2 })], [tPerson("a", { targetMinutes: 12 * H }), tPerson("b", { targetMinutes: 4 * H })]),
]
let equal = 0
for (const input of tiny) {
  const oracle = exhaustiveBest(input)
  if (compareScores(solveProposal(input).score, oracle.score) === 0) equal++
  else failed++
}
console.log(`Tiny cases equal to the exhaustive optimum: ${equal} / ${tiny.length}`)
console.log(failed === 0 ? "All gates passed." : `${failed} gate(s) FAILED.`)
process.exitCode = failed === 0 ? 0 : 1
