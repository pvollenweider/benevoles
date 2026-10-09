import { describe, it, expect } from "vitest"
import { formatDelay, median, signupIndicatorRows } from "../signup-indicators"

const MIN = 60_000
const H = 60 * MIN

describe("sign-up indicators (#810)", () => {
  it("takes the median, odd or even, and none without values", () => {
    expect(median([])).toBeNull()
    expect(median([5, 1, 3])).toBe(3)
    expect(median([4, 1, 3, 2])).toBe(2.5)
  })

  it("says a delay in plain French", () => {
    expect(formatDelay(null)).toBe("Aucune validation")
    expect(formatDelay(45 * MIN)).toBe("45 min")
    expect(formatDelay(3 * H)).toBe("3 h")
    expect(formatDelay(3 * H + 20 * MIN)).toBe("3 h 20 min")
    expect(formatDelay(52 * H)).toBe("2 j 4 h")
    expect(formatDelay(48 * H)).toBe("2 j")
  })

  it("lists every indicator of #810, counts formatted", () => {
    const rows = signupIndicatorRows({ requests: 1234, spaces: 40, approved: 30, refused: 5, validationDelays: [2 * H, 6 * H, 30 * H], pending: 3, unused: 7, held: 12, dropped: 1, suspended: 2 })
    expect(rows.map((r) => r.key)).toEqual(["requests", "spaces", "approved", "refused", "delay", "pending", "unused", "held", "dropped", "suspended"])
    expect(rows.find((r) => r.key === "delay")?.value).toBe("6 h")
    expect(rows.find((r) => r.key === "requests")?.value).toMatch(/^1\s?234$/)
  })
})
