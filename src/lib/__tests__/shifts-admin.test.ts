import { describe, it, expect } from "vitest"
import {
  activeShiftsByDay,
  applyRoleOrder,
  eventDates,
  moveItem,
  normalizeTime,
  renameRole,
  roleDeletionWarning,
  roleOrder,
  sortShifts,
} from "../shifts-admin"

const s = (id: string, over: Partial<{ roleName: string; label: string; date: string; startTime: string; status: string; displayOrder: number; registrationCount: number }> = {}) => ({
  id, roleName: "Bar", label: "Bar", date: "2030-06-01", startTime: "10:00", status: "open", displayOrder: 0, registrationCount: 0, ...over,
})

describe("eventDates", () => {
  it("every day from start to end inclusive", () => {
    expect(eventDates("2030-06-01", "2030-06-03")).toEqual(["2030-06-01", "2030-06-02", "2030-06-03"])
    expect(eventDates("2030-06-01", "2030-06-01")).toEqual(["2030-06-01"])
  })

  it("across a month boundary and a DST change", () => {
    expect(eventDates("2030-03-30", "2030-04-01")).toEqual(["2030-03-30", "2030-03-31", "2030-04-01"])
  })
})

describe("normalizeTime", () => {
  it("pads hours and minutes", () => {
    expect(normalizeTime("9")).toBe("09:00")
    expect(normalizeTime(" 9:5 ")).toBe("09:05")
    expect(normalizeTime("")).toBe("")
  })

  it("keeps out-of-range or unparsable values as typed, for the server to report", () => {
    expect(normalizeTime("24:00")).toBe("24:00")
    expect(normalizeTime("10:75")).toBe("10:75")
    expect(normalizeTime("abc")).toBe("abc")
  })
})

describe("roles", () => {
  const shifts = [
    s("a", { roleName: "Bar", displayOrder: 100 }),
    s("b", { roleName: "Accueil", displayOrder: 0 }),
    s("c", { roleName: "Sono", displayOrder: 50, status: "cancelled" }),
  ]

  it("order by displayOrder, cancelled shifts ignored", () => {
    expect(roleOrder(shifts)).toEqual(["Accueil", "Bar"])
  })

  it("moves an item for drag and drop", () => {
    expect(moveItem(["a", "b", "c"], 0, 2)).toEqual(["b", "c", "a"])
    expect(moveItem(["a", "b", "c"], 2, 0)).toEqual(["c", "a", "b"])
  })

  it("applies a role order as displayOrder = index × 100", () => {
    expect(applyRoleOrder(shifts, ["Bar", "Accueil"]).map((x) => [x.id, x.displayOrder])).toEqual([["a", 0], ["b", 100], ["c", 50]])
  })

  it("renames a role, and labels equal to the old name follow", () => {
    const renamed = renameRole([s("a"), s("b", { label: "Bar du soir" })], "Bar", "Buvette")
    expect(renamed.map((x) => [x.roleName, x.label])).toEqual([["Buvette", "Buvette"], ["Buvette", "Bar du soir"]])
  })

  it("warns about volunteers who'll be emailed when deleting a role", () => {
    expect(roleDeletionWarning([s("a"), s("b")], "Bar")).toBe("Supprimer le poste « Bar » (2 créneaux) ?")
    expect(roleDeletionWarning([s("a", { registrationCount: 1 })], "Bar")).toBe("Supprimer le poste « Bar » (1 créneau) ? 1 bénévole inscrit sera prévenu par email.")
    expect(roleDeletionWarning([s("a", { registrationCount: 2 }), s("b", { registrationCount: 1 })], "Bar")).toContain("3 bénévoles inscrits seront prévenus")
  })
})

describe("grouping and sorting", () => {
  const shifts = [
    s("late", { date: "2030-06-02", startTime: "14:00" }),
    s("early-b", { date: "2030-06-01", startTime: "09:00", displayOrder: 100 }),
    s("early-a", { date: "2030-06-01", startTime: "11:00", displayOrder: 0 }),
    s("gone", { date: "2030-06-01", status: "cancelled" }),
  ]

  it("groups active shifts by day", () => {
    const byDay = activeShiftsByDay(shifts)
    expect(Object.keys(byDay).sort()).toEqual(["2030-06-01", "2030-06-02"])
    expect(byDay["2030-06-01"].map((x) => x.id)).toEqual(["early-b", "early-a"])
  })

  it("sorts by day, then role order, then start time", () => {
    expect(sortShifts(shifts).map((x) => x.id)).toEqual(["early-a", "early-b", "late"])
  })
})
