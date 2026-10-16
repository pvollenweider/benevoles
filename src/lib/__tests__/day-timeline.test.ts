import { describe, it, expect } from "vitest"
import {
  GAP,
  LANE_GAP,
  PX_PER_MIN,
  ROW_H,
  dayRange,
  draftEnd,
  draftStart,
  hourTicks,
  layoutRoles,
  offsetToMin,
  resizedTimes,
  endMayPassMidnight,
  snapTo,
} from "../day-timeline"

const s = (id: string, over: Partial<{ roleName: string; displayOrder: number; startTime: string; endTime: string }> = {}) => ({
  id, roleName: "Bar", displayOrder: 0, startTime: "10:00", endTime: "12:00", ...over,
})

describe("time range", () => {
  it("whole hours around the items plus one hour of padding", () => {
    expect(dayRange([{ startTime: "09:30", endTime: "11:15" }])).toEqual({ dayStart: 8 * 60, dayEnd: 13 * 60 })
  })

  it("an overnight end counts past midnight", () => {
    expect(dayRange([{ startTime: "22:00", endTime: "01:00" }])).toEqual({ dayStart: 21 * 60, dayEnd: 26 * 60 })
  })

  it("defaults to 08:00–20:00 when empty", () => {
    expect(dayRange([])).toEqual({ dayStart: 7 * 60, dayEnd: 21 * 60 })
  })

  it("ticks every whole hour", () => {
    expect(hourTicks(8 * 60, 11 * 60)).toEqual([8, 9, 10, 11])
  })
})

describe("pointer to minutes", () => {
  it("snaps to 15 minutes", () => {
    expect(snapTo(52)).toBe(45)
    expect(snapTo(53)).toBe(60)
    expect(offsetToMin(60 * PX_PER_MIN, 8 * 60, 12 * 60)).toBe(9 * 60)
    expect(offsetToMin(68 * PX_PER_MIN, 8 * 60, 12 * 60)).toBe(9 * 60 + 15)
  })

  it("stays within the day even over the padding hours", () => {
    expect(offsetToMin(-100, -60, 5 * 60)).toBe(0)
    expect(offsetToMin(10_000, 20 * 60, 25 * 60)).toBe(1440)
  })

  it("goes past midnight only when asked, within the visible range (#1024)", () => {
    expect(offsetToMin(10_000, 20 * 60, 27 * 60, 2880)).toBe(27 * 60)
  })
})

describe("drag to create", () => {
  it("starts at least one step before midnight and lasts at least one step", () => {
    expect(draftStart(1440)).toBe(1425)
    expect(draftEnd(600, 590)).toBe(615)
    expect(draftEnd(600, 720)).toBe(720)
    expect(draftEnd(1425, 1500)).toBe(1440)
  })
})

describe("resize", () => {
  const range = { dayStart: 7 * 60, dayEnd: 14 * 60 }
  const orig = { startTime: "10:00", endTime: "12:00" }

  it("moves the dragged edge only, snapped", () => {
    expect(resizedTimes(orig, "right", 13 * 60 + 7, range)).toEqual({ startTime: "10:00", endTime: "13:00" })
    expect(resizedTimes(orig, "left", 9 * 60 + 8, range)).toEqual({ startTime: "09:15", endTime: "12:00" })
  })

  it("keeps at least 15 minutes", () => {
    expect(resizedTimes(orig, "right", 9 * 60, range)).toEqual({ startTime: "10:00", endTime: "10:15" })
    expect(resizedTimes(orig, "left", 13 * 60, range)).toEqual({ startTime: "11:45", endTime: "12:00" })
  })

  it("stays within the visible range and the day", () => {
    expect(resizedTimes(orig, "right", 20 * 60, range).endTime).toBe("14:00")
    expect(resizedTimes(orig, "left", 0, range).startTime).toBe("07:00")
  })
})

describe("layoutRoles", () => {
  it("orders roles by their smallest displayOrder, or by the parent's order", () => {
    const shifts = [s("a", { roleName: "Bar", displayOrder: 100 }), s("b", { roleName: "Accueil", displayOrder: 0 }), s("c", { roleName: "Bar", displayOrder: 50 })]
    expect(layoutRoles(shifts).roles).toEqual(["Accueil", "Bar"])
    expect(layoutRoles(shifts, ["Bar", "Sono", "Accueil"]).roles).toEqual(["Bar", "Accueil"])
  })

  it("packs overlapping shifts of a role on separate lanes, taller row", () => {
    const shifts = [
      s("late", { startTime: "14:00", endTime: "15:00" }),
      s("x", { startTime: "10:00", endTime: "12:00" }),
      s("y", { startTime: "11:00", endTime: "13:00" }),
      s("solo", { roleName: "Accueil", displayOrder: 10 }),
    ]
    const rows = layoutRoles(shifts)
    expect(rows.roleLane.Bar.x).not.toBe(rows.roleLane.Bar.y)
    expect(rows.roleHeight.Bar).toBe(2 * ROW_H + LANE_GAP)
    expect(rows.roleHeight.Accueil).toBe(ROW_H)
    expect(rows.byRole.Bar.map((x) => x.id)).toEqual(["x", "y", "late"])
    expect(rows.roleTop).toEqual({ Bar: 0, Accueil: rows.roleHeight.Bar + GAP })
    expect(rows.rowsH).toBe(rows.roleHeight.Bar + rows.roleHeight.Accueil + 2 * GAP)
  })

  it("is empty without shifts", () => {
    expect(layoutRoles([])).toMatchObject({ roles: [], rowsH: 0 })
  })
})

describe("resize of an overnight shift (#1024)", () => {
  const night = { startTime: "22:00", endTime: "02:00" }
  const range = { dayStart: 21 * 60, dayEnd: 27 * 60 }

  it("may end past midnight only when it already did", () => {
    expect(endMayPassMidnight(night)).toBe(true)
    expect(endMayPassMidnight({ startTime: "22:00", endTime: "00:00" })).toBe(true)
    expect(endMayPassMidnight({ startTime: "20:00", endTime: "23:00" })).toBe(false)
  })

  it("keeps the next-morning end when the start edge moves (regression: end became 00:00)", () => {
    expect(resizedTimes(night, "left", 23 * 60, range)).toEqual({ startTime: "23:00", endTime: "02:00" })
    expect(resizedTimes(night, "left", 21 * 60 + 8, range)).toEqual({ startTime: "21:15", endTime: "02:00" })
  })

  it("moves the end edge on the next morning instead of clamping it to midnight", () => {
    expect(resizedTimes(night, "right", 25 * 60 + 7, range)).toEqual({ startTime: "22:00", endTime: "01:00" })
    expect(resizedTimes(night, "right", 26 * 60 + 30, range)).toEqual({ startTime: "22:00", endTime: "02:30" })
    expect(resizedTimes(night, "right", 30 * 60, range)).toEqual({ startTime: "22:00", endTime: "03:00" })
    expect(resizedTimes({ startTime: "22:00", endTime: "00:00" }, "right", 25 * 60, range).endTime).toBe("01:00")
  })

  it("keeps a daytime end within the day", () => {
    expect(resizedTimes({ startTime: "20:00", endTime: "23:00" }, "right", 25 * 60, range).endTime).toBe("00:00")
  })

  it("never lasts a day or more, and snaps inside the bounds", () => {
    const wide = { dayStart: 0, dayEnd: 48 * 60 }
    expect(resizedTimes({ startTime: "22:10", endTime: "02:00" }, "right", 48 * 60, wide).endTime).toBe("21:45")
    // The start edge of a shift ending 02:00 the next morning stops after 02:00 on its date.
    expect(resizedTimes(night, "left", 0, wide).startTime).toBe("02:15")
  })
})
