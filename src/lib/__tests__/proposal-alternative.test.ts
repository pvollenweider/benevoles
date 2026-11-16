// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { describe, it, expect, vi } from "vitest"
import { assignmentSet, findAlternative, type AttemptResult } from "../proposal-alternative"

// « Proposer une autre répartition » (#1172, coordinator review 2026-10-31): seed after seed until the result differs.
const A = [{ shiftId: "s1", volunteerId: "a" }]
const B = [{ shiftId: "s1", volunteerId: "b" }]
const finished = (assignments: typeof A): AttemptResult<string> => ({ execution: "finished", assignments, value: assignmentSet(assignments) })

function run(results: Record<number, AttemptResult<string> | null>, extra: Partial<Parameters<typeof findAlternative<string>>[0]> = {}) {
  const attempt = vi.fn(async (seed: number) => (seed in results ? results[seed] : finished(A)))
  const beforeAttempt = vi.fn(async (list: readonly number[]) => list.length > 0)
  return { attempt, beforeAttempt, out: findAlternative({ firstSeed: 2027, tried: [2026], avoid: new Set([assignmentSet(A)]), maxAttempts: 20, timeLeft: () => 1_000, beforeAttempt, attempt, ...extra }) }
}

describe("findAlternative", () => {
  it("compares assignments as sets, whatever their order", () => {
    expect(assignmentSet([{ shiftId: "s2", volunteerId: "a" }, ...A])).toBe(assignmentSet([...A, { shiftId: "s2", volunteerId: "a" }]))
    expect(assignmentSet(A)).not.toBe(assignmentSet(B))
  })

  it("keeps the first seed when its result already differs", async () => {
    const { out, attempt } = run({ 2027: finished(B) })
    expect(await out).toEqual({ kind: "found", seed: 2027, seedsTried: [2027], value: assignmentSet(B) })
    expect(attempt).toHaveBeenCalledTimes(1)
  })

  it("tries the next untried seeds until a result differs, and says which seed gave it", async () => {
    const { out, beforeAttempt } = run({ 2030: finished(B) }, { tried: [2026, 2028] })
    expect(await out).toEqual({ kind: "found", seed: 2030, seedsTried: [2027, 2029, 2030], value: assignmentSet(B) })
    // Each seed is announced before its search, with every seed tried so far.
    expect(beforeAttempt.mock.calls.map((c) => [...c[0]])).toEqual([[2027], [2027, 2029], [2027, 2029, 2030]])
  })

  it("never accepts a search stopped by the deadline, even if it differs", async () => {
    const { out } = run({ 2027: { execution: "interrupted", assignments: B, value: "partial" }, 2028: finished(B) })
    expect(await out).toMatchObject({ kind: "found", seed: 2028 })
  })

  it("finds nothing within the attempts or the time: nothing to write", async () => {
    expect(await run({}, { maxAttempts: 3 }).out).toEqual({ kind: "none", seedsTried: [2027, 2028, 2029] })
    let left = 2
    expect(await run({}, { timeLeft: () => left-- }).out).toEqual({ kind: "none", seedsTried: [2027, 2028] })
  })

  it("stops when the server says so, before or during an attempt", async () => {
    expect(await run({}, { beforeAttempt: async () => false }).out).toEqual({ kind: "stopped", seedsTried: [2027] })
    expect(await run({ 2028: null }).out).toEqual({ kind: "stopped", seedsTried: [2027, 2028] })
  })

  it("skips a first seed another run already used", async () => {
    expect(await run({ 2028: finished(B) }, { tried: [2026, 2027] }).out).toMatchObject({ kind: "found", seed: 2028, seedsTried: [2028] })
  })
})
