import { describe, it, expect } from "vitest"
import { mealOnTheGoAnnouncement, posteMealOnTheGo, posteMealOnTheGoLabel } from "../meal-on-the-go"

// #1171 lot 2: the poste panel reads and sets « repas sur le pouce possible » for all live shifts.
describe("posteMealOnTheGo", () => {
  const s = (roleName: string, mealOnTheGo: boolean, status = "open") => ({ roleName, mealOnTheGo, status })
  it("says all, none or some, cancelled shifts left out", () => {
    expect(posteMealOnTheGo([s("Bar", true), s("Bar", true), s("Scène", false)], "Bar")).toBe("all")
    expect(posteMealOnTheGo([s("Bar", true), s("Bar", false)], "Bar")).toBe("some")
    expect(posteMealOnTheGo([s("Bar", false), s("Bar", true, "cancelled")], "Bar")).toBe("none")
    expect(posteMealOnTheGo([], "Bar")).toBe("none")
  })
  it("names the button and the announcement in words", () => {
    expect(posteMealOnTheGoLabel("some", "Bar")).toEqual({ text: "Repas : sur certains créneaux", name: "Repas : sur certains créneaux, poste « Bar », repas sur le pouce possible" })
    expect(posteMealOnTheGoLabel("none", "Bar").name).toBe("Repas : non, poste « Bar » sans repas sur le pouce")
    expect(posteMealOnTheGoLabel("all", "Bar").text).toBe("Repas : sur le pouce")
    expect(mealOnTheGoAnnouncement("Bar", false)).toBe("Poste « Bar » : repas sur le pouce retiré de tous ses créneaux.")
  })
})
