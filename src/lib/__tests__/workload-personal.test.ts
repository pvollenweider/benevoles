import { describe, it, expect } from "vitest"
import { checkPersonalLimits, parsePersonalLayers, parsePersonalLimits, personalLimitsLines, storedPersonalLayers, stricterLimits } from "../workload-personal"

// #1171 lot 2: a person's own limits, never looser than the event's, no reason.
const EVENT = { maxContinuousMinutes: 360, minBreakMinutes: 30, maxDailyMinutes: 600, maxEventMinutes: 2400, minRestMinutes: 600 }

describe("personal limits", () => {
  it("accepts stricter or equal values, refuses looser ones and nothing at all", () => {
    expect(checkPersonalLimits({ maxDailyMinutes: 480, minRestMinutes: 720 }, EVENT)).toEqual({ ok: true, limits: { maxDailyMinutes: 480, minRestMinutes: 720 } })
    expect(checkPersonalLimits({ maxDailyMinutes: 600 }, EVENT).ok).toBe(true)
    const looser = checkPersonalLimits({ maxDailyMinutes: 660, minBreakMinutes: 20 }, EVENT)
    expect(looser.ok ? [] : looser.problems.map((p) => p.field)).toEqual(["personalMinBreakMinutes", "personalMaxDailyMinutes"])
    expect(checkPersonalLimits({}, EVENT).ok).toBe(false)
    expect(checkPersonalLimits({ reason: "santé" }, EVENT).ok).toBe(false)
    expect(checkPersonalLimits({ maxContinuousMinutes: 300, maxDailyMinutes: 240 }, EVENT).ok).toBe(false)
  })

  it("stores two layers, reads them strictly, and applies the stricter of the two", () => {
    const stored = storedPersonalLayers({ admin: { maxDailyMinutes: 480 }, volunteer: { maxDailyMinutes: 420, minRestMinutes: 720 } })
    expect(parsePersonalLayers(stored)).toEqual({ admin: { maxDailyMinutes: 480 }, volunteer: { maxDailyMinutes: 420, minRestMinutes: 720 } })
    expect(parsePersonalLimits(stored)).toEqual({ maxDailyMinutes: 420, minRestMinutes: 720 })
    expect(storedPersonalLayers({ admin: null, volunteer: null })).toBeNull()
    expect(parsePersonalLimits({ version: 2, admin: { maxDailyMinutes: 480 } })).toBeNull()
    expect(parsePersonalLimits({ version: 1, admin: { note: "x" } })).toBeNull()
    expect(parsePersonalLimits({ version: 1, reason: "santé" })).toBeNull()
    expect(parsePersonalLimits(null)).toBeNull()
  })

  it("keeps the stricter value of each field when two records merge", () => {
    expect(stricterLimits({ maxDailyMinutes: 480, minRestMinutes: 660 }, { maxDailyMinutes: 540, minRestMinutes: 720, maxEventMinutes: 1200 }))
      .toEqual({ maxDailyMinutes: 480, minRestMinutes: 720, maxEventMinutes: 1200 })
    expect(stricterLimits(null, { maxDailyMinutes: 480 })).toEqual({ maxDailyMinutes: 480 })
  })

  it("says the limits in words", () => {
    expect(personalLimitsLines({ maxDailyMinutes: 480, minRestMinutes: 720 })).toEqual(["Durée maximale par journée de service : 8 h au plus", "Repos minimum entre deux journées de service : 12 h au moins"])
  })
})
