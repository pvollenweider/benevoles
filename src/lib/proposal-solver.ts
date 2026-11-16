// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { startModel, type Model, type ScheduleProblem } from "./proposal-eligibility"
import { PROPOSAL_INPUT_VERSION, type ProposalBudget, type ProposalInput } from "./proposal-input"
import { assembleScore, compareScores, coverage, personStats, type PersonStats, type Score } from "./proposal-objectives"
import { createPrng, normaliseSeed, PRNG_VERSION, type Prng } from "./proposal-prng"

/**
 * The search of the assignment proposal (#1172): deterministic, explainable, no generative model.
 * Pure and Prisma-free; the server runs it in slices (`ProposalSearch.step`) and decides when to
 * stop (deadline, cancellation). Chosen after the benchmark of scripts/proposal-benchmark.ts
 * (greedy alone, greedy + local search, exhaustive search on tiny cases):
 *
 * 1. construction: seats with a critical minimum first, then the remaining needs, the hardest
 *    seats first (fewest eligible people); each seat goes to the valid candidate that gives the
 *    best score. When the only thing wrong is an idle gap (a later mission could close it), the
 *    person is tried with a second mission of the same service day at once (a bundle);
 * 2. improvement: seeded moves (fill a gap, give a seat to someone else, swap two people, move a
 *    person, free a person for a gap and refill their seat), each judged on every person it
 *    touches, whole schedules, kept only when the score is better (or equal, rarely, to leave a
 *    plateau); after a stagnation, a restart from the best proposal with part of it removed.
 *
 * Every state the search keeps is valid: capacity, availability, age, reserved postes, overlaps,
 * poste limits and the workload protection on each whole schedule. The budget is counted in
 * workload evaluations, never in time: the same input, seed and budget always give the same
 * proposal. A deadline or a cancellation stops it earlier (« recherche interrompue »), with the
 * best valid proposal found so far.
 */

export const SOLVER_VERSION = "greedy-ls-1"

export type ProposalAssignment = { shiftId: string; volunteerId: string }

export type StopReason = "budget" | "iterations" | "deadline" | "cancelled"

type Change = Map<string, string[]>

type Evaluated = { ok: true; score: Score; stats: Map<string, PersonStats>; counts: Map<string, number> } | { ok: false; problem: ScheduleProblem | { code: "capacity" } }

const byId = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)

export class ProposalSearch {
  readonly model: Model
  private readonly rng: Prng
  private readonly budget: ProposalBudget
  /** Generated shifts per selected person. */
  private gen = new Map<string, string[]>()
  /** Generated people per open shift. */
  private onShift = new Map<string, string[]>()
  private stats = new Map<string, PersonStats>()
  private score: Score
  private bestGen = new Map<string, string[]>()
  private bestScore: Score
  private phase: "setup" | "construct" | "improve" | "done" = "setup"
  /** The step-by-step work of the current phase (setup, construction or a restart). */
  private work: Generator<void, void, void> | null = null
  private stopped: StopReason | null = null
  iterations = 0
  restarts = 0
  private sinceBest = 0
  private readonly maxIterations: number
  private readonly targetOf = new Map<string, boolean>()
  private readonly diversify: boolean

  constructor(input: ProposalInput) {
    this.model = startModel(input)
    this.rng = createPrng(normaliseSeed(input.seed))
    this.budget = input.budget
    this.maxIterations = Math.max(1_000, input.budget.evaluations * 4)
    this.diversify = input.diversify === true
    for (const p of this.model.people) {
      this.gen.set(p.id, [])
      this.targetOf.set(p.id, p.targetMinutes > 0)
      this.stats.set(p.id, personStats(this.model, p.id, []))
    }
    for (const s of this.model.open) this.onShift.set(s.id, [])
    this.score = this.fullScore(this.stats, (id) => this.onShift.get(id)!.length)
    this.bestScore = this.score
    this.snapshotBest()
  }

  /** Where the search is: computing eligibility, building, improving, or done. */
  get stage(): "setup" | "construct" | "improve" | "done" {
    return this.phase
  }

  get done(): boolean {
    return this.phase === "done"
  }

  get stopReason(): StopReason | null {
    return this.stopped
  }

  evaluations(): number {
    return this.model.evaluations()
  }

  /** Runs at most `iterations` steps; returns true when the search finished (budget or iteration cap). */
  step(iterations: number): boolean {
    for (let i = 0; i < iterations && this.phase !== "done"; i++) {
      if (this.evaluations() >= this.budget.evaluations) return this.finish("budget")
      if (this.iterations >= this.maxIterations) return this.finish("iterations")
      if (this.phase === "setup") {
        this.work ??= this.model.prepare()
        if (this.work.next().done) {
          this.work = this.construct(this.diversify)
          this.phase = "construct"
        }
        continue
      }
      if (this.phase === "construct") {
        // Construction and restarts advance one seat per step, so a deadline or a yield can come in between.
        if (this.work!.next().done) {
          this.work = null
          this.considerBest()
          this.phase = "improve"
        }
        continue
      }
      this.iterations++
      this.improveOnce()
      if (this.considerBest()) this.sinceBest = 0
      else if (++this.sinceBest >= this.budget.stagnation) {
        this.work = this.restart()
        this.phase = "construct"
        this.sinceBest = 0
      }
    }
    return this.phase === "done"
  }

  /** Stops early: deadline or cancellation. The best valid proposal stays available. */
  interrupt(reason: "deadline" | "cancelled"): void {
    if (this.phase === "done") return
    this.stopped = reason
    this.phase = "done"
  }

  /** The best proposal found so far, as sorted assignments, with its score. */
  best(): { assignments: ProposalAssignment[]; score: Score } {
    const assignments: ProposalAssignment[] = []
    for (const [volunteerId, ids] of this.bestGen) for (const shiftId of ids) assignments.push({ shiftId, volunteerId })
    assignments.sort((a, b) => byId(a.shiftId, b.shiftId) || byId(a.volunteerId, b.volunteerId))
    return { assignments, score: this.bestScore }
  }

  private finish(reason: StopReason): true {
    this.stopped = reason
    this.phase = "done"
    return true
  }

  // ── State ───────────────────────────────────────────────────────────────────────────────────

  private fullScore(stats: Map<string, PersonStats>, filled: (shiftId: string) => number): Score {
    return assembleScore(coverage(this.model, filled), this.model.people.map((p) => ({ stats: stats.get(p.id)!, hasTarget: this.targetOf.get(p.id)! })))
  }

  /** Judges a change (new generated lists for some people): capacity, validity of each touched schedule, score. */
  private evaluate(change: Change): Evaluated {
    const counts = new Map<string, number>()
    for (const [personId, next] of change) {
      for (const id of this.gen.get(personId)!) counts.set(id, (counts.get(id) ?? this.onShift.get(id)!.length) - 1)
      for (const id of next) counts.set(id, (counts.get(id) ?? this.onShift.get(id)!.length) + 1)
    }
    for (const [id, n] of counts) if (n > this.model.free.get(id)!) return { ok: false, problem: { code: "capacity" } }
    for (const [personId, next] of change) {
      const problem = this.model.scheduleProblem(personId, next)
      if (problem) return { ok: false, problem }
    }
    const stats = new Map(this.stats)
    for (const [personId, next] of change) stats.set(personId, personStats(this.model, personId, next))
    const score = this.fullScore(stats, (id) => counts.get(id) ?? this.onShift.get(id)!.length)
    return { ok: true, score, stats, counts }
  }

  private commit(change: Change, e: Extract<Evaluated, { ok: true }>): void {
    for (const [personId, next] of change) {
      for (const id of this.gen.get(personId)!) {
        const list = this.onShift.get(id)!
        list.splice(list.indexOf(personId), 1)
      }
      this.gen.set(personId, [...next].sort(byId))
      for (const id of next) this.onShift.get(id)!.push(personId)
    }
    for (const list of this.onShift.values()) list.sort(byId)
    this.stats = e.stats
    this.score = e.score
  }

  /** Tries a change; keeps it when better (or, with `sideways`, equal). */
  private attempt(change: Change, sideways = false): boolean {
    const e = this.evaluate(change)
    if (!e.ok) return false
    const c = compareScores(e.score, this.score)
    if (c < 0 || (c === 0 && sideways)) {
      this.commit(change, e)
      return true
    }
    return false
  }

  private considerBest(): boolean {
    if (compareScores(this.score, this.bestScore) < 0) {
      this.bestScore = this.score
      this.snapshotBest()
      return true
    }
    return false
  }

  private snapshotBest(): void {
    this.bestGen = new Map([...this.gen].map(([k, v]) => [k, [...v]]))
  }

  private deficit(shiftId: string, level: "critical" | "needs"): number {
    const got = this.onShift.get(shiftId)!.length
    return level === "critical" ? Math.max(0, this.model.critical.get(shiftId)! - got) : Math.max(0, this.model.free.get(shiftId)! - got)
  }

  // ── Construction ────────────────────────────────────────────────────────────────────────────

  /** Fills seats level by level, hardest first. `shuffle`: seeded order among equally hard seats (restarts). */
  private *construct(shuffle: boolean): Generator<void, void, void> {
    for (const level of ["critical", "needs"] as const) {
      let progress = true
      while (progress) {
        progress = false
        const tie = new Map(this.model.open.map((s) => [s.id, shuffle ? this.rng.next() : 0]))
        const order = this.model.open
          .filter((s) => this.deficit(s.id, level) > 0)
          .sort((a, b) => this.model.candidates.get(a.id)!.length - this.model.candidates.get(b.id)!.length || tie.get(a.id)! - tie.get(b.id)! || 0)
        for (const s of order) {
          while (this.deficit(s.id, level) > 0) {
            if (this.evaluations() >= this.budget.evaluations) return
            const filled = this.fill(s.id, shuffle)
            yield
            if (!filled) break
            progress = true
          }
        }
      }
    }
  }

  /** Gives one more seat of the shift to the best valid candidate, alone or with a bundle. */
  private fill(shiftId: string, shuffle: boolean): boolean {
    const on = new Set(this.onShift.get(shiftId)!)
    const ranked = this.rank(shiftId, this.model.candidates.get(shiftId)!.filter((p) => !on.has(p)), shuffle)
    let idleOnly: string[] = []
    for (const { personId } of ranked) {
      const change: Change = new Map([[personId, [...this.gen.get(personId)!, shiftId]]])
      const e = this.evaluate(change)
      if (e.ok) {
        if (compareScores(e.score, this.score) < 0) {
          this.commit(change, e)
          return true
        }
        continue
      }
      if (e.problem.code === "workload" && e.problem.rules.every((r) => r === "idle")) idleOnly.push(personId)
    }
    // Bundles: the person with another mission of the same service day that closes the gap.
    idleOnly = idleOnly.slice(0, 8)
    for (const personId of idleOnly) {
      if (this.bundle(personId, shiftId)) return true
    }
    return false
  }

  private bundle(personId: string, shiftId: string): boolean {
    const day = this.model.serviceDay.get(shiftId)
    const mine = new Set(this.gen.get(personId)!)
    const partners = this.model.options.get(personId)!.filter((id) => id !== shiftId && !mine.has(id) && this.model.serviceDay.get(id) === day && this.onShift.get(id)!.length < this.model.free.get(id)!)
    for (const other of partners.slice(0, 12)) {
      if (this.attempt(new Map([[personId, [...this.gen.get(personId)!, shiftId, other]]]))) return true
    }
    return false
  }

  /** Candidates ordered by the score they would give (validity checked later), ties by seed or id. */
  private rank(shiftId: string, people: string[], shuffle: boolean): { personId: string }[] {
    const scored = people.map((personId) => {
      const stats = new Map(this.stats)
      stats.set(personId, personStats(this.model, personId, [...this.gen.get(personId)!, shiftId]))
      const score = this.fullScore(stats, (id) => this.onShift.get(id)!.length + (id === shiftId ? 1 : 0))
      return { personId, score, tie: shuffle ? this.rng.next() : 0 }
    })
    scored.sort((a, b) => compareScores(a.score, b.score) || a.tie - b.tie || byId(a.personId, b.personId))
    return scored
  }

  // ── Improvement ─────────────────────────────────────────────────────────────────────────────

  private assigned(): ProposalAssignment[] {
    const out: ProposalAssignment[] = []
    for (const p of this.model.people) for (const shiftId of this.gen.get(p.id)!) out.push({ shiftId, volunteerId: p.id })
    return out
  }

  private improveOnce(): void {
    const roll = this.rng.next()
    const sideways = this.rng.next() < 0.05
    const gaps = this.model.open.filter((s) => this.deficit(s.id, "needs") > 0)
    if (roll < 0.3 && gaps.length > 0) {
      const critical = gaps.filter((s) => this.deficit(s.id, "critical") > 0)
      const s = this.rng.pick(critical.length > 0 ? critical : gaps)
      if (!this.fill(s.id, true)) this.eject(s.id)
      return
    }
    const assigned = this.assigned()
    if (assigned.length === 0) return
    const a = this.rng.pick(assigned)
    if (roll < 0.55) {
      // Give the seat to someone else.
      const on = new Set(this.onShift.get(a.shiftId)!)
      const others = this.model.candidates.get(a.shiftId)!.filter((p) => !on.has(p))
      if (others.length === 0) return
      const q = this.rng.pick(others)
      this.attempt(new Map([
        [a.volunteerId, this.gen.get(a.volunteerId)!.filter((id) => id !== a.shiftId)],
        [q, [...this.gen.get(q)!, a.shiftId]],
      ]), sideways)
      return
    }
    if (roll < 0.85) {
      // Swap two people's seats.
      const b = this.rng.pick(assigned)
      if (b.volunteerId === a.volunteerId || b.shiftId === a.shiftId) return
      if (this.onShift.get(a.shiftId)!.includes(b.volunteerId) || this.onShift.get(b.shiftId)!.includes(a.volunteerId)) return
      if (!this.model.candidates.get(b.shiftId)!.includes(a.volunteerId) || !this.model.candidates.get(a.shiftId)!.includes(b.volunteerId)) return
      this.attempt(new Map([
        [a.volunteerId, [...this.gen.get(a.volunteerId)!.filter((id) => id !== a.shiftId), b.shiftId]],
        [b.volunteerId, [...this.gen.get(b.volunteerId)!.filter((id) => id !== b.shiftId), a.shiftId]],
      ]), sideways)
      return
    }
    // Move a person to another seat with room, or out.
    const mine = new Set(this.gen.get(a.volunteerId)!)
    const targets = this.model.options.get(a.volunteerId)!.filter((id) => !mine.has(id) && this.onShift.get(id)!.length < this.model.free.get(id)!)
    const rest = this.gen.get(a.volunteerId)!.filter((id) => id !== a.shiftId)
    if (targets.length === 0) {
      this.attempt(new Map([[a.volunteerId, rest]]), sideways)
      return
    }
    this.attempt(new Map([[a.volunteerId, [...rest, this.rng.pick(targets)]]]), sideways)
  }

  /**
   * An ejection chain for a gap: a candidate blocked by their own generated missions gives up the
   * ones in the way (same service day, or overlapping), takes the gap, and someone else takes what
   * they gave up. Kept only when the whole result is better.
   */
  private eject(shiftId: string): void {
    const on = new Set(this.onShift.get(shiftId)!)
    const people = this.model.candidates.get(shiftId)!.filter((p) => !on.has(p) && this.gen.get(p)!.length > 0)
    if (people.length === 0) return
    const p = this.rng.pick(people)
    const day = this.model.serviceDay.get(shiftId)
    const inWay = this.gen.get(p)!.filter((id) => this.model.clash(id, shiftId) || this.model.serviceDay.get(id) === day)
    if (inWay.length === 0) return
    const released = this.rng.pick(inWay)
    const change: Change = new Map([[p, [...this.gen.get(p)!.filter((id) => id !== released), shiftId]]])
    const first = this.evaluate(change)
    if (!first.ok) return
    // The released seat to someone else, the best valid one.
    const free = this.model.candidates.get(released)!.filter((q) => q !== p && !this.onShift.get(released)!.includes(q))
    for (const q of free.slice(0, 12)) {
      const next: Change = new Map([...change, [q, [...this.gen.get(q)!, released]]])
      if (this.attempt(next)) return
    }
    this.attempt(change)
  }

  private *restart(): Generator<void, void, void> {
    this.restarts++
    this.gen = new Map([...this.bestGen].map(([k, v]) => [k, [...v]]))
    for (const list of this.onShift.values()) list.length = 0
    for (const [personId, ids] of this.gen) for (const id of ids) this.onShift.get(id)!.push(personId)
    for (const list of this.onShift.values()) list.sort(byId)
    for (const p of this.model.people) this.stats.set(p.id, personStats(this.model, p.id, this.gen.get(p.id)!))
    this.score = this.fullScore(this.stats, (id) => this.onShift.get(id)!.length)
    const assigned = this.assigned()
    const k = Math.max(2, Math.ceil(assigned.length * 0.08))
    for (let i = 0; i < k && assigned.length > 0; i++) {
      const [a] = assigned.splice(this.rng.int(assigned.length), 1)
      // Removing a mission can open an idle gap: only removals that stay valid are made.
      const change: Change = new Map([[a.volunteerId, this.gen.get(a.volunteerId)!.filter((id) => id !== a.shiftId)]])
      const e = this.evaluate(change)
      if (e.ok) this.commit(change, e)
    }
    yield* this.construct(true)
  }
}

export type SolveOptions = {
  /** A monotonic clock in ms (performance.now): only to stop at the deadline, never to steer the search. */
  clock?: () => number
  deadlineMs?: number
  shouldStop?: () => boolean
  /** Iterations between two checks of the clock and of `shouldStop`. */
  slice?: number
}

export type SolveOutcome = {
  solverVersion: string
  prngVersion: string
  inputVersion: number
  seed: number
  budget: ProposalBudget
  execution: "finished" | "interrupted"
  stopReason: StopReason
  assignments: ProposalAssignment[]
  score: Score
  evaluations: number
  setupEvaluations: number
  iterations: number
  restarts: number
}

function outcomeOf(search: ProposalSearch, input: ProposalInput): SolveOutcome {
  const best = search.best()
  const reason = search.stopReason ?? "budget"
  return {
    solverVersion: SOLVER_VERSION, prngVersion: PRNG_VERSION, inputVersion: PROPOSAL_INPUT_VERSION,
    seed: normaliseSeed(input.seed), budget: input.budget,
    execution: reason === "deadline" || reason === "cancelled" ? "interrupted" : "finished", stopReason: reason,
    assignments: best.assignments, score: best.score,
    evaluations: search.evaluations(), setupEvaluations: search.model.setupEvaluations(), iterations: search.iterations, restarts: search.restarts,
  }
}

/** Runs a whole search synchronously (tests, benchmark). The server uses `runProposalSearch`. */
export function solveProposal(input: ProposalInput, opts: SolveOptions = {}): SolveOutcome {
  const clock = opts.clock ?? (() => performance.now())
  const start = clock()
  const search = new ProposalSearch(input)
  const slice = opts.slice ?? 50
  while (!search.step(slice)) {
    if (opts.shouldStop?.()) search.interrupt("cancelled")
    else if (opts.deadlineMs != null && clock() - start >= opts.deadlineMs) search.interrupt("deadline")
  }
  return outcomeOf(search, input)
}

/**
 * Runs a search in slices, yielding to the event loop between them so the server keeps answering
 * (setImmediate), until it finishes, the deadline passes or `shouldStop` says so (a cancellation).
 */
export async function runProposalSearch(input: ProposalInput, opts: SolveOptions & { onProgress?: (p: { evaluations: number; iterations: number }) => void | Promise<void>; sliceMs?: number; search?: ProposalSearch } = {}): Promise<SolveOutcome> {
  const clock = opts.clock ?? (() => performance.now())
  const start = clock()
  // A caller that needs the model afterwards (the report) builds the search itself.
  const search = opts.search ?? new ProposalSearch(input)
  const sliceMs = opts.sliceMs ?? 15
  while (!search.done) {
    const sliceStart = clock()
    while (!search.done && clock() - sliceStart < sliceMs) search.step(opts.slice ?? 10)
    if (search.done) break
    if (opts.shouldStop?.()) search.interrupt("cancelled")
    else if (opts.deadlineMs != null && clock() - start >= opts.deadlineMs) search.interrupt("deadline")
    else {
      await opts.onProgress?.({ evaluations: search.evaluations(), iterations: search.iterations })
      await new Promise<void>((resolve) => setImmediate(resolve))
    }
  }
  return outcomeOf(search, input)
}
