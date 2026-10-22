import { describe, it, expect } from "vitest"
import { deletedPosteNames, leadersOutsideDeletedPostes, livePosteNames } from "../leader-postes"

// Sector leaders of a deleted poste, every shift cancelled (#1010).
const shifts = [
  { roleName: "Bar", status: "open" },
  { roleName: "Vestiaire", status: "cancelled" },
  { roleName: "Accueil", status: "closed" },
  { roleName: "Bar", status: "cancelled" },
  { roleName: "Vestiaire", status: "cancelled" },
]

describe("livePosteNames", () => {
  it("keeps the roleNames of shifts that are not cancelled, once, sorted", () => {
    expect(livePosteNames(shifts)).toEqual(["Accueil", "Bar"])
  })
})

describe("deletedPosteNames", () => {
  it("is the postes whose every shift is cancelled", () => {
    expect(deletedPosteNames(shifts)).toEqual(["Vestiaire"])
    expect(deletedPosteNames([])).toEqual([])
  })
})

describe("leadersOutsideDeletedPostes", () => {
  it("leaves out the leaders of a deleted poste, keeps the others in order, a poste with no shift yet too", () => {
    const leaders = [{ roleName: "Bar", name: "Léa" }, { roleName: "Vestiaire", name: "Noé" }, { roleName: "Sécurité", name: "Marc" }]
    expect(leadersOutsideDeletedPostes(leaders, ["Vestiaire"])).toEqual([leaders[0], leaders[2]])
    expect(leadersOutsideDeletedPostes(leaders, [])).toEqual(leaders)
  })
})
