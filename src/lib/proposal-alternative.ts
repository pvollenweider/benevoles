// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { anotherSeed } from "./proposal-config"

/**
 * « Proposer une autre répartition » (#1172, coordinator review and Codex 2026-10-31): seed after
 * seed on the same frozen input, until a complete result differs from every earlier result with the
 * same choices, or the attempts or the time run out. Pure but for the callbacks: the server gives the
 * search (`attempt`) and records each seed before it is tried (`beforeAttempt`).
 */

/** Assignments as a canonical set, to compare two results. */
export function assignmentSet(list: readonly { shiftId: string; volunteerId: string }[] | null | undefined): string {
  return (list ?? []).map((a) => `${a.shiftId}|${a.volunteerId}`).sort().join(",")
}

export type AttemptResult<T> = { execution: "finished" | "interrupted"; assignments: readonly { shiftId: string; volunteerId: string }[]; value: T }

export type AlternativeOutcome<T> =
  | { kind: "found"; seed: number; seedsTried: number[]; value: T }
  /** Nothing different within the attempts or the time: nothing to write. */
  | { kind: "none"; seedsTried: number[] }
  /** Stopped (a stop asked, the lease lost, an error): the caller ends the run its own way. */
  | { kind: "stopped"; seedsTried: number[] }

export async function findAlternative<T>(opts: {
  firstSeed: number
  /** Seeds already used by runs with the same choices: never tried again. */
  tried: readonly number[]
  /** The earlier results (`assignmentSet`) to differ from. */
  avoid: ReadonlySet<string>
  maxAttempts: number
  timeLeft: () => number
  /** Before each attempt, with every seed tried so far, this one included; false stops. */
  beforeAttempt: (seedsTried: readonly number[]) => Promise<boolean>
  /** One search with this seed; null stops. An interrupted search is never accepted. */
  attempt: (seed: number) => Promise<AttemptResult<T> | null>
}): Promise<AlternativeOutcome<T>> {
  const seedsTried: number[] = []
  for (let k = 0; k < opts.maxAttempts; k++) {
    if (opts.timeLeft() <= 0) break
    const seed = k === 0 && !opts.tried.includes(opts.firstSeed) ? opts.firstSeed : anotherSeed([...opts.tried, ...seedsTried])
    seedsTried.push(seed)
    if (!(await opts.beforeAttempt([...seedsTried]))) return { kind: "stopped", seedsTried }
    const result = await opts.attempt(seed)
    if (!result) return { kind: "stopped", seedsTried }
    if (result.execution === "finished" && !opts.avoid.has(assignmentSet(result.assignments))) return { kind: "found", seed, seedsTried, value: result.value }
  }
  return { kind: "none", seedsTried }
}
