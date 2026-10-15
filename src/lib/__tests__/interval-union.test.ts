import { describe, it, expect } from "vitest"
import { hasParallelTime, mergeIntervals, unionLength } from "../interval-union"

// A person's time when shifts run in parallel (#986): the union of the intervals, not their sum.
const iv = (start: number, end: number) => ({ start, end })

describe("unionLength", () => {
  it("is 0 for nothing", () => {
    expect(unionLength([])).toBe(0)
  })

  it("is the length of one interval", () => {
    expect(unionLength([iv(60, 180)])).toBe(120)
  })

  it("adds disjoint intervals", () => {
    expect(unionLength([iv(0, 60), iv(120, 180)])).toBe(120)
  })

  it("adds touching intervals without a gap or a double count", () => {
    expect(unionLength([iv(0, 60), iv(60, 120)])).toBe(120)
  })

  it("counts overlapping time once", () => {
    // Coffee 10–14, first aid 12–16: 6 hours, not 8.
    expect(unionLength([iv(600, 840), iv(720, 960)])).toBe(360)
  })

  it("counts a nested interval once", () => {
    // First aid 9–17 covers coffee 10–14: 8 hours.
    expect(unionLength([iv(540, 1020), iv(600, 840)])).toBe(480)
  })

  it("counts identical intervals once", () => {
    expect(unionLength([iv(0, 60), iv(0, 60), iv(0, 60)])).toBe(60)
  })

  it("chains several overlaps, in any order", () => {
    expect(unionLength([iv(200, 300), iv(0, 100), iv(50, 150), iv(140, 210)])).toBe(300)
  })

  it("ignores empty and inverted intervals", () => {
    expect(unionLength([iv(10, 10), iv(50, 20), iv(0, 30)])).toBe(30)
  })

  it("works on instants in milliseconds, across midnight", () => {
    const h = 3_600_000
    const night = iv(Date.UTC(2026, 6, 4, 20), Date.UTC(2026, 6, 5, 0))
    const parallel = iv(Date.UTC(2026, 6, 4, 22), Date.UTC(2026, 6, 5, 2))
    expect(unionLength([night, parallel])).toBe(6 * h)
  })
})

describe("mergeIntervals", () => {
  it("merges overlapping and touching intervals, sorted, without changing its input", () => {
    const input = [iv(120, 180), iv(0, 60), iv(60, 90), iv(170, 200)]
    expect(mergeIntervals(input)).toEqual([iv(0, 90), iv(120, 200)])
    expect(input[0]).toEqual(iv(120, 180))
  })
})

describe("hasParallelTime", () => {
  it("is true only when two intervals share time", () => {
    expect(hasParallelTime([iv(0, 60), iv(30, 90)])).toBe(true)
    expect(hasParallelTime([iv(0, 60), iv(60, 90)])).toBe(false)
    expect(hasParallelTime([iv(0, 60)])).toBe(false)
    expect(hasParallelTime([])).toBe(false)
  })
})
