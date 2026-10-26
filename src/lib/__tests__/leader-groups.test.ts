import { describe, it, expect } from "vitest"
import { leaderSectorGroups } from "@/lib/leader-groups"

// #1169: the « Responsables » screen of an event with sectors, grouped by sector.
const sectors = [
  { id: "a", name: "Parking", archived: false, postes: ["Parking Nord", "Parking Sud"] },
  { id: "b", name: "Bar", archived: false, postes: [] },
  { id: "old", name: "Accueil", archived: true, postes: [] },
  { id: "old2", name: "Vestiaire", archived: true, postes: [] },
]

describe("leaderSectorGroups (#1169)", () => {
  it("lists every active sector, an archived one only with leaders, the postes of no sector last", () => {
    const leaders = [
      { id: 1, roleName: "Parking Sud", sectorId: null },
      { id: 2, roleName: null, sectorId: "a" },
      { id: 3, roleName: null, sectorId: "old" },
      { id: 4, roleName: "Cuisine", sectorId: null },
      { id: 5, roleName: "Accueil", sectorId: null },
    ]
    const groups = leaderSectorGroups(leaders, sectors)
    expect(groups.map((g) => g.sector?.id ?? null)).toEqual(["a", "b", "old", null])
    expect(groups[0].postes.map((p) => [p.roleName, p.leaders.map((l) => l.id)])).toEqual([["Parking Sud", [1]]])
    expect(groups[1].postes).toEqual([])
    expect(groups[3].postes.map((p) => p.roleName)).toEqual(["Accueil", "Cuisine"])
  })

  it("no « other postes » group when every poste leader is in a sector", () => {
    expect(leaderSectorGroups([{ roleName: "Parking Nord", sectorId: null }], sectors).map((g) => g.sector?.id ?? null)).toEqual(["a", "b"])
  })
})
