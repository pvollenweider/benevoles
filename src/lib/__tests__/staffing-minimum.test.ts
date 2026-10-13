import { describe, it, expect } from "vitest"
import {
  belowMinimumSentence, effectiveMinimum, minVolunteersProblem, parseMinVolunteers, shiftStaffingState,
  spokenStaffingState, staffingStateText, staffingSummary, type StaffingShift,
} from "../staffing"

// Minimum per shift (#949): below minimum, minimum reached, full.

const shift = (over: Partial<StaffingShift> & { id: string }): StaffingShift => ({
  roleName: "Bar", label: "Bar", date: "2026-07-04", startTime: "10:00", endTime: "12:00",
  capacity: 4, active: 0, waiting: 0, closed: false, ...over,
})

describe("shiftStaffingState", () => {
  it("without a minimum: « open » until full, as before", () => {
    expect(shiftStaffingState({ capacity: 4, active: 0 })).toBe("open")
    expect(shiftStaffingState({ capacity: 4, minVolunteers: null, active: 3 })).toBe("open")
    expect(shiftStaffingState({ capacity: 4, active: 4 })).toBe("full")
  })

  it("with a minimum: below it, reached, then full", () => {
    expect(shiftStaffingState({ capacity: 4, minVolunteers: 2, active: 1 })).toBe("below_minimum")
    expect(shiftStaffingState({ capacity: 4, minVolunteers: 2, active: 2 })).toBe("minimum_reached")
    expect(shiftStaffingState({ capacity: 4, minVolunteers: 2, active: 3 })).toBe("minimum_reached")
    expect(shiftStaffingState({ capacity: 4, minVolunteers: 2, active: 4 })).toBe("full")
  })

  it("a minimum equal to the places is below it until the shift is full", () => {
    expect(shiftStaffingState({ capacity: 3, minVolunteers: 3, active: 2 })).toBe("below_minimum")
    expect(shiftStaffingState({ capacity: 3, minVolunteers: 3, active: 3 })).toBe("full")
  })

  it("counts the requests awaiting a decision, as the people missing do; never the waitlist", () => {
    expect(shiftStaffingState({ capacity: 4, minVolunteers: 2, active: 1, requested: 1 })).toBe("minimum_reached")
    expect(shiftStaffingState({ capacity: 2, minVolunteers: 1, active: 1, requested: 1 })).toBe("full")
    // StaffingShift.waiting is not an input: a full waitlist leaves the shift below its minimum.
    expect(shiftStaffingState(shift({ id: "w", minVolunteers: 2, active: 1, waiting: 5 }))).toBe("below_minimum")
  })

  it("ignores an invalid minimum (0, negative, above the places, not whole): the shift reads as without one", () => {
    expect(shiftStaffingState({ capacity: 4, minVolunteers: 0, active: 0 })).toBe("open")
    expect(shiftStaffingState({ capacity: 4, minVolunteers: -1, active: 0 })).toBe("open")
    expect(shiftStaffingState({ capacity: 4, minVolunteers: 5, active: 0 })).toBe("open")
    expect(shiftStaffingState({ capacity: 4, minVolunteers: 1.5, active: 0 })).toBe("open")
    expect(effectiveMinimum({ capacity: 4, minVolunteers: 0 })).toBeNull()
    expect(effectiveMinimum({ capacity: 4, minVolunteers: 4 })).toBe(4)
  })
})

describe("staffingStateText", () => {
  it("says the state in words, with the minimum when below it", () => {
    const s = { capacity: 4, minVolunteers: 2 }
    expect(staffingStateText(s, "below_minimum")).toBe("sous le minimum (2)")
    expect(staffingStateText(s, "minimum_reached")).toBe("minimum atteint")
    expect(staffingStateText(s, "full")).toBe("complet")
    expect(spokenStaffingState(s, "below_minimum")).toBe("sous le minimum de 2")
    expect(spokenStaffingState(s, "minimum_reached")).toBe("minimum atteint")
  })

  it("says nothing without a minimum, so the shift reads as before", () => {
    expect(staffingStateText({ capacity: 4 }, "open")).toBeNull()
    expect(staffingStateText({ capacity: 4, minVolunteers: null }, "full")).toBeNull()
    expect(spokenStaffingState({ capacity: 4 }, "open")).toBeNull()
  })
})

describe("minVolunteersProblem", () => {
  it("accepts no minimum, or 1 to the places", () => {
    expect(minVolunteersProblem(null, 4)).toBeNull()
    expect(minVolunteersProblem(undefined, 4)).toBeNull()
    expect(minVolunteersProblem(1, 4)).toBeNull()
    expect(minVolunteersProblem(4, 4)).toBeNull()
  })

  it("refuses 0, a negative or a decimal minimum, and one above the places, with a clear message", () => {
    expect(minVolunteersProblem(0, 4)).toMatch(/au moins 1 personne/)
    expect(minVolunteersProblem(-2, 4)).toMatch(/au moins 1 personne/)
    expect(minVolunteersProblem(1.5, 4)).toMatch(/nombre entier/)
    expect(minVolunteersProblem(5, 4)).toBe("Le minimum (5) dépasse les places (4) : baissez le minimum ou augmentez les places.")
  })

  it("reads an empty field as no minimum", () => {
    expect(parseMinVolunteers("")).toBeNull()
    expect(parseMinVolunteers("  ")).toBeNull()
    expect(parseMinVolunteers(null)).toBeNull()
    expect(parseMinVolunteers("3")).toBe(3)
    expect(parseMinVolunteers(2)).toBe(2)
  })
})

describe("staffingSummary with minimums", () => {
  const shifts = [
    shift({ id: "nomin", capacity: 2, active: 0 }),                   // no minimum, 2 missing: critical
    shift({ id: "below", minVolunteers: 2, active: 1 }),               // 1/4, minimum 2: critical, 3 missing
    shift({ id: "reached", minVolunteers: 2, active: 2, startTime: "08:00" }), // 2/4: can run, 2 missing
    shift({ id: "reached2", minVolunteers: 1, active: 1, capacity: 6 }), // 1/6: can run, 5 missing
    shift({ id: "full", minVolunteers: 2, active: 4 }),
    shift({ id: "closed", minVolunteers: 3, active: 0, closed: true }), // closed: not counted
  ]
  const s = staffingSummary(shifts, [])

  it("puts the shifts below their minimum (and those without one) first, then by people missing", () => {
    expect(s.underfilled.map((x) => [x.id, x.state, x.missing])).toEqual([
      ["below", "below_minimum", 3],
      ["nomin", "open", 2],
      ["reached2", "minimum_reached", 5],
      ["reached", "minimum_reached", 2],
    ])
  })

  it("lists the open shifts below their minimum, and says when minimums are used", () => {
    expect(s.belowMinimum.map((x) => x.id)).toEqual(["below"])
    expect(s.usesMinimum).toBe(true)
    expect(s.full.map((x) => [x.id, x.state])).toEqual([["full", "full"]])
  })

  it("keeps the order and the groups of an event without any minimum", () => {
    const plain = staffingSummary(shifts.map((s) => ({ ...s, minVolunteers: undefined })), [])
    // By people missing, then time (« reached » starts at 08:00, « nomin » at 10:00).
    expect(plain.underfilled.map((x) => x.id)).toEqual(["reached2", "below", "reached", "nomin"])
    expect(plain.underfilled.every((x) => x.state === "open")).toBe(true)
    expect(plain.belowMinimum).toEqual([])
    expect(plain.usesMinimum).toBe(false)
  })

  it("sums up the shifts below their minimum in one sentence", () => {
    expect(belowMinimumSentence(0)).toBeNull()
    expect(belowMinimumSentence(1)).toBe("1 créneau est sous son minimum.")
    expect(belowMinimumSentence(3)).toBe("3 créneaux sont sous leur minimum.")
  })
})
