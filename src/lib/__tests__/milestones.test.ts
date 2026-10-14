import { describe, it, expect } from "vitest"
import { dueDateInputValue, milestoneChanges, replaceMilestone, sortMilestones, validateMilestoneInput } from "../milestones"

describe("validateMilestoneInput (#989)", () => {
  it("accepts a title and a date, and trims the title", () => {
    expect(validateMilestoneInput({ title: "  Fermer les inscriptions ", dueDate: "2026-09-20" }))
      .toEqual({ ok: true, value: { title: "Fermer les inscriptions", dueDate: "2026-09-20" } })
  })

  it("asks for the title first, even when the date is missing too", () => {
    expect(validateMilestoneInput({ title: "   ", dueDate: "" }))
      .toEqual({ ok: false, field: "title", message: "Indiquez le titre du jalon." })
  })

  it("asks for the due date when it is empty or not a date", () => {
    for (const dueDate of ["", "20.09.2026", "2026-13-45"]) {
      expect(validateMilestoneInput({ title: "Rappels", dueDate }))
        .toEqual({ ok: false, field: "dueDate", message: "Indiquez l'échéance." })
    }
  })

  it("refuses a title longer than the API allows", () => {
    const result = validateMilestoneInput({ title: "a".repeat(141), dueDate: "2026-09-20" })
    expect(result).toMatchObject({ ok: false, field: "title" })
    expect(validateMilestoneInput({ title: "a".repeat(140), dueDate: "2026-09-20" }).ok).toBe(true)
  })

  it("accepts a past date, as the API does", () => {
    expect(validateMilestoneInput({ title: "Commander les t-shirts", dueDate: "2020-01-01" }).ok).toBe(true)
  })
})

describe("dueDateInputValue", () => {
  it("gives back the day stored at midnight UTC", () => {
    expect(dueDateInputValue("2026-09-20T00:00:00.000Z")).toBe("2026-09-20")
  })

  it("is empty for a value that is not a date", () => {
    expect(dueDateInputValue("pas une date")).toBe("")
  })
})

describe("milestoneChanges", () => {
  const before = { title: "Fermer les inscriptions", dueDate: "2026-09-20T00:00:00.000Z" }

  it("sends only the changed fields", () => {
    expect(milestoneChanges(before, { title: "Fermer les inscriptions", dueDate: "2026-09-25" })).toEqual({ dueDate: "2026-09-25" })
    expect(milestoneChanges(before, { title: "Clore les inscriptions", dueDate: "2026-09-20" })).toEqual({ title: "Clore les inscriptions" })
  })

  it("is empty when nothing changed", () => {
    expect(milestoneChanges(before, { title: "Fermer les inscriptions", dueDate: "2026-09-20" })).toEqual({})
  })
})

describe("sortMilestones / replaceMilestone", () => {
  const list = [
    { id: "a", title: "A", dueDate: "2026-09-01T00:00:00.000Z" },
    { id: "b", title: "B", dueDate: "2026-09-10T00:00:00.000Z" },
    { id: "c", title: "C", dueDate: "2026-09-20T00:00:00.000Z" },
  ]

  it("moves an edited milestone to its new place by due date", () => {
    const moved = replaceMilestone(list, { id: "a", title: "A", dueDate: "2026-09-15T00:00:00.000Z" })
    expect(moved.map((m) => m.id)).toEqual(["b", "a", "c"])
  })

  it("keeps the order of milestones on the same day and does not mutate the list", () => {
    const sameDay = [...list, { id: "d", title: "D", dueDate: "2026-09-10T00:00:00.000Z" }]
    expect(sortMilestones(sameDay).map((m) => m.id)).toEqual(["a", "b", "d", "c"])
    const renamed = replaceMilestone(list, { id: "b", title: "B2", dueDate: "2026-09-10T00:00:00.000Z" })
    expect(renamed.map((m) => m.title)).toEqual(["A", "B2", "C"])
    expect(list[1].title).toBe("B")
  })
})
