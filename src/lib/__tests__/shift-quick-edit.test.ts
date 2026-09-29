import { describe, it, expect } from "vitest"
import { capacityPlan, moveProblem, slotAfter } from "../shift-quick-edit"

describe("slotAfter", () => {
  it("places the copy right after the original, same length", () => {
    expect(slotAfter({ date: "2026-07-04", startTime: "10:00", endTime: "12:00" })).toEqual({ date: "2026-07-04", startTime: "12:00", endTime: "14:00" })
    expect(slotAfter({ date: "2026-07-04", startTime: "09:30", endTime: "10:15" })).toEqual({ date: "2026-07-04", startTime: "10:15", endTime: "11:00" })
  })

  it("wraps past midnight, on the next day when the copy starts after midnight", () => {
    expect(slotAfter({ date: "2026-07-04", startTime: "20:00", endTime: "23:00" })).toEqual({ date: "2026-07-04", startTime: "23:00", endTime: "02:00" })
    expect(slotAfter({ date: "2026-07-04", startTime: "22:00", endTime: "02:00" })).toEqual({ date: "2026-07-05", startTime: "02:00", endTime: "06:00" })
    expect(slotAfter({ date: "2026-12-31", startTime: "21:00", endTime: "00:00" })).toEqual({ date: "2027-01-01", startTime: "00:00", endTime: "03:00" })
  })
})

describe("capacityPlan", () => {
  it("sets the asked capacity, never below the confirmed people, and skips unchanged shifts", () => {
    const plan = capacityPlan([
      { id: "a", capacity: 2, active: 0 },
      { id: "b", capacity: 5, active: 4 },
      { id: "c", capacity: 3, active: 1 },
    ], 3)
    expect(plan.updates).toEqual([{ id: "a", capacity: 3 }, { id: "b", capacity: 4 }])
    expect(plan.keptHigher).toEqual(["b"])
  })
})

describe("moveProblem", () => {
  it("accepts valid ranges, overnight included, and refuses bad or equal times", () => {
    expect(moveProblem("10:00", "12:00")).toBeNull()
    expect(moveProblem("22:00", "02:00")).toBeNull()
    expect(moveProblem("10:00", "10:00")).toMatch(/différente/)
    expect(moveProblem("25:00", "12:00")).toMatch(/invalide/)
    expect(moveProblem("9:00", "12:00")).toMatch(/invalide/)
  })
})
