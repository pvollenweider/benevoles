import { describe, it, expect } from "vitest"
import { leadersOfPostes, livePosteNames } from "../leader-postes"

// Sector leaders of a poste without live shift (#1010).
describe("livePosteNames", () => {
  it("keeps the roleNames of shifts that are not cancelled, once, sorted", () => {
    expect(livePosteNames([
      { roleName: "Bar", status: "open" },
      { roleName: "Vestiaire", status: "cancelled" },
      { roleName: "Accueil", status: "closed" },
      { roleName: "Bar", status: "full" },
    ])).toEqual(["Accueil", "Bar"])
  })

  it("drops a poste whose every shift is cancelled", () => {
    expect(livePosteNames([{ roleName: "Bar", status: "cancelled" }])).toEqual([])
  })
})

describe("leadersOfPostes", () => {
  it("keeps only the leaders of the given postes, in order", () => {
    const leaders = [{ roleName: "Bar", name: "Léa" }, { roleName: "Vestiaire", name: "Noé" }, { roleName: "Bar", name: "Marc" }]
    expect(leadersOfPostes(leaders, ["Bar"])).toEqual([leaders[0], leaders[2]])
    expect(leadersOfPostes(leaders, new Set<string>())).toEqual([])
  })
})
