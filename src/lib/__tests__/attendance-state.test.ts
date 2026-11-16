// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { describe, it, expect } from "vitest"
import {
  ATTENDANCE_LABELS,
  ATTENDANCE_TRANSITIONS,
  attendanceStateOf,
  canTransition,
  type AttendanceState,
  type AttendanceTransition,
} from "../attendance-state"

// The four attendance states (#1141): expected, present, absent, and gone before the end.
describe("attendanceStateOf", () => {
  it("expected: no check-in, no status", () => {
    expect(attendanceStateOf({ checkedInAt: null, attendanceStatus: null })).toBe("expected")
    // A row read without the new columns (before #1141) is expected or present.
    expect(attendanceStateOf({ checkedInAt: null })).toBe("expected")
    expect(attendanceStateOf({})).toBe("expected")
  })

  it("present: a check-in, as a Date or as the ISO text sent to the browser", () => {
    expect(attendanceStateOf({ checkedInAt: new Date("2026-07-04T08:05:00Z"), attendanceStatus: null })).toBe("present")
    expect(attendanceStateOf({ checkedInAt: "2026-07-04T08:05:00.000Z" })).toBe("present")
  })

  it("absent: the status says so, and the check-in is null", () => {
    expect(attendanceStateOf({ checkedInAt: null, attendanceStatus: "absent" })).toBe("absent")
  })

  it("left_early: the arrival is kept, the status says the person left before the end", () => {
    expect(attendanceStateOf({ checkedInAt: new Date("2026-07-04T08:05:00Z"), attendanceStatus: "left_early" })).toBe("left_early")
    expect(attendanceStateOf({ checkedInAt: "2026-07-04T08:05:00.000Z", attendanceStatus: "left_early" })).toBe("left_early")
  })

  it("a check-in wins over a stray « absent »: a row with both marks is present (rolling deployment)", () => {
    // The previous release's check-in sets `checkedInAt` and does not know `attendanceStatus`:
    // on a row marked absent it leaves both. Every reader of `checkedInAt` alone says present.
    expect(attendanceStateOf({ checkedInAt: new Date("2026-07-04T08:05:00Z"), attendanceStatus: "absent" })).toBe("present")
    expect(attendanceStateOf({ checkedInAt: "2026-07-04T08:05:00.000Z", attendanceStatus: "absent" })).toBe("present")
  })

  it("a stray « left_early » with no arrival was never written here: it reads as expected", () => {
    expect(attendanceStateOf({ checkedInAt: null, attendanceStatus: "left_early" })).toBe("expected")
  })
})

describe("labels", () => {
  it("are the French words of the badges and counts", () => {
    expect(ATTENDANCE_LABELS).toEqual({ expected: "Attendu", present: "Présent", absent: "Absent", left_early: "Parti avant la fin" })
  })
})

describe("transitions", () => {
  it("are the six reversible actions", () => {
    expect(ATTENDANCE_TRANSITIONS).toEqual({
      check_in: { from: "expected", to: "present" },
      undo_check_in: { from: "present", to: "expected" },
      mark_absent: { from: "expected", to: "absent" },
      undo_absent: { from: "absent", to: "expected" },
      mark_left_early: { from: "present", to: "left_early" },
      undo_left_early: { from: "left_early", to: "present" },
    })
  })

  it("each action runs from its starting state only", () => {
    const allowed: Record<AttendanceTransition, AttendanceState> = {
      check_in: "expected", undo_check_in: "present", mark_absent: "expected", undo_absent: "absent",
      mark_left_early: "present", undo_left_early: "left_early",
    }
    for (const [transition, from] of Object.entries(allowed) as [AttendanceTransition, AttendanceState][]) {
      for (const state of ["expected", "present", "absent", "left_early"] as const) {
        expect(canTransition(state, transition), `${transition} from ${state}`).toBe(state === from)
      }
    }
  })

  it("nothing leads to or from left_early except its own two actions", () => {
    for (const { from, to } of Object.values(ATTENDANCE_TRANSITIONS)) {
      if (from === "left_early" || to === "left_early") {
        expect([from, to].sort()).toEqual(["left_early", "present"])
      }
    }
    expect(canTransition("left_early", "mark_absent")).toBe(false)
    expect(canTransition("left_early", "check_in")).toBe(false)
    expect(canTransition("present", "undo_left_early")).toBe(false)
  })

  it("present and absent never go directly from one to the other: undo first", () => {
    const direct = Object.values(ATTENDANCE_TRANSITIONS).filter((t) => t.from !== "expected" && t.to !== "expected")
    expect(direct).toEqual([
      { from: "present", to: "left_early" },
      { from: "left_early", to: "present" },
    ])
    expect(canTransition("present", "mark_absent")).toBe(false)
    expect(canTransition("absent", "check_in")).toBe(false)
  })

  it("every action is undone by one press", () => {
    for (const { from, to } of Object.values(ATTENDANCE_TRANSITIONS)) {
      expect(Object.values(ATTENDANCE_TRANSITIONS)).toContainEqual({ from: to, to: from })
    }
  })
})
