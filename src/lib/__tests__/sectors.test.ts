import { describe, it, expect } from "vitest"
import {
  activeSectors, archiveSectorSentence, archivedSectors, firstSectorDecision, groupedRoleOrder, groupRolesBySector,
  isSectorPermutation, managePostesLabel, MANAGE_POSTES_LABEL, MANAGE_SECTORS_POSTES_LABEL, moveSector, NO_SECTOR_LABEL, sectorName, sectorNameTaken, sectorsAdopted, sectorsManaged,
  sectorsOptionOffered, sectorsSwitchDecision, sectorGroupKey, SECTORS_CLOSED_ERROR, SECTORS_LOCKED_ERROR,
  SECTORS_NOT_ENABLED_ERROR,
} from "../sectors"

// Sectors grouping postes (#1147): the option, its adoption lock rules, names and the grouping.
const OFF = { sectorsEnabled: false, sectorsAdoptedAt: null }
const ON = { sectorsEnabled: true, sectorsAdoptedAt: null }
const ADOPTED = { sectorsEnabled: true, sectorsAdoptedAt: "2026-10-26T10:00:00Z" }

describe("the event option", () => {
  it("is offered while the capability can be adopted, or while the event has it on or adopted (BE06)", () => {
    expect(sectorsOptionOffered(OFF, true)).toBe(true)
    expect(sectorsOptionOffered(OFF, false)).toBe(false)
    expect(sectorsOptionOffered(ON, false)).toBe(true)
    expect(sectorsOptionOffered(ADOPTED, false)).toBe(true)
  })

  it("shows the sectors in « Gérer les postes » only when on or adopted (A01)", () => {
    expect(sectorsManaged(OFF)).toBe(false)
    expect(sectorsManaged(ON)).toBe(true)
    expect(sectorsManaged(ADOPTED)).toBe(true)
    expect(sectorsManaged(null)).toBe(false)
    expect(sectorsAdopted(ON)).toBe(false)
    expect(sectorsAdopted(ADOPTED)).toBe(true)
  })

  it("names the panel and its button « Gérer les secteurs et postes » once sectors are adopted, else « Gérer les postes »", () => {
    expect(MANAGE_POSTES_LABEL).toBe("Gérer les postes")
    expect(MANAGE_SECTORS_POSTES_LABEL).toBe("Gérer les secteurs et postes")
    expect(managePostesLabel(OFF)).toBe(MANAGE_POSTES_LABEL)
    // The option on with no sector saved yet keeps the old name.
    expect(managePostesLabel(ON)).toBe(MANAGE_POSTES_LABEL)
    expect(managePostesLabel(null)).toBe(MANAGE_POSTES_LABEL)
    expect(managePostesLabel(undefined)).toBe(MANAGE_POSTES_LABEL)
    expect(managePostesLabel(ADOPTED)).toBe(MANAGE_SECTORS_POSTES_LABEL)
    // Adoption stays even with the option flag off (every sector archived, BE06).
    expect(managePostesLabel({ sectorsEnabled: false, sectorsAdoptedAt: new Date("2026-10-26T10:00:00Z") })).toBe(MANAGE_SECTORS_POSTES_LABEL)
  })

  it("turns on only through the gate, and off only before the first sector (A02, A03)", () => {
    expect(sectorsSwitchDecision(OFF, true, true)).toEqual({ ok: true, change: true })
    expect(sectorsSwitchDecision(OFF, true, false)).toEqual({ ok: false, status: 403, error: SECTORS_CLOSED_ERROR })
    expect(sectorsSwitchDecision(ON, false, false)).toEqual({ ok: true, change: true })
    expect(sectorsSwitchDecision(ADOPTED, false, true)).toEqual({ ok: false, status: 409, error: SECTORS_LOCKED_ERROR })
    // Asking for the current value changes nothing, gate or not.
    expect(sectorsSwitchDecision(ON, true, false)).toEqual({ ok: true, change: false })
    expect(sectorsSwitchDecision(OFF, false, false)).toEqual({ ok: true, change: false })
    expect(sectorsSwitchDecision(ADOPTED, true, false)).toEqual({ ok: true, change: false })
  })

  it("adopts with the first sector only when on and the gate open; an adopted event keeps full use", () => {
    expect(firstSectorDecision(ON, true)).toEqual({ ok: true, adopt: true })
    expect(firstSectorDecision(ON, false)).toEqual({ ok: false, status: 403, error: SECTORS_CLOSED_ERROR })
    expect(firstSectorDecision(OFF, true)).toEqual({ ok: false, status: 409, error: SECTORS_NOT_ENABLED_ERROR })
    expect(firstSectorDecision(ADOPTED, false)).toEqual({ ok: true, adopt: false })
  })
})

describe("names and order", () => {
  it("trims and collapses spaces, refuses empty or too long names", () => {
    expect(sectorName("  Parking   Nord ")).toBe("Parking Nord")
    expect(sectorName("   ")).toBeNull()
    expect(sectorName("x".repeat(61))).toBeNull()
    expect(sectorName(42)).toBeNull()
  })

  it("compares names case-insensitively among active sectors only", () => {
    const sectors = [{ id: "a", name: "Parking", displayOrder: 0 }, { id: "b", name: "Bar", displayOrder: 1, archivedAt: "2026-10-01T00:00:00Z" }]
    expect(sectorNameTaken(sectors, "parking")).toBe(true)
    expect(sectorNameTaken(sectors, "parking", "a")).toBe(false)
    expect(sectorNameTaken(sectors, "BAR")).toBe(false)
  })

  it("lists active sectors in order and archived ones apart", () => {
    const sectors = [
      { id: "c", name: "Scène", displayOrder: 2 },
      { id: "a", name: "Parking", displayOrder: 0 },
      { id: "x", name: "Ancien", displayOrder: 1, archivedAt: "2026-10-01T00:00:00Z" },
      { id: "y", name: "Vieux", displayOrder: 3, archivedAt: "2026-10-02T00:00:00Z" },
    ]
    expect(activeSectors(sectors).map((s) => s.id)).toEqual(["a", "c"])
    expect(archivedSectors(sectors).map((s) => s.id)).toEqual(["y", "x"])
  })

  it("moves a sector one step, null at an end", () => {
    expect(moveSector(["a", "b", "c"], "b", "up")).toEqual(["b", "a", "c"])
    expect(moveSector(["a", "b", "c"], "b", "down")).toEqual(["a", "c", "b"])
    expect(moveSector(["a", "b"], "a", "up")).toBeNull()
    expect(moveSector(["a", "b"], "b", "down")).toBeNull()
  })

  it("accepts a reorder only as a permutation of the active sectors", () => {
    expect(isSectorPermutation(["b", "a"], ["a", "b"])).toBe(true)
    expect(isSectorPermutation(["a"], ["a", "b"])).toBe(false)
    expect(isSectorPermutation(["a", "a"], ["a", "b"])).toBe(false)
    expect(isSectorPermutation(["a", "z"], ["a", "b"])).toBe(false)
  })
})

describe("groupRolesBySector", () => {
  const sectors = [
    { id: "s-parking", name: "Parking", displayOrder: 1 },
    { id: "s-scene", name: "Scène", displayOrder: 0 },
    { id: "s-old", name: "Ancien", displayOrder: 2, archivedAt: "2026-10-01T00:00:00Z" },
  ]
  const of: Record<string, string | null> = { "Parking Nord": "s-parking", "Bar": null, "Régie": "s-scene", "Parking Mairie": "s-parking", "Vestiaire": "s-old", "Accueil": "s-gone" }

  it("groups by sector in the sectors' order, postes in the event's order, « Autres postes » last", () => {
    const groups = groupRolesBySector(["Parking Nord", "Bar", "Régie", "Parking Mairie", "Vestiaire", "Accueil"], (r) => of[r], sectors)
    expect(groups).toEqual([
      { id: "s-scene", name: "Scène", roles: ["Régie"] },
      { id: "s-parking", name: "Parking", roles: ["Parking Nord", "Parking Mairie"] },
      // An archived or unknown sector shows as « Autres postes ».
      { id: null, name: NO_SECTOR_LABEL, roles: ["Bar", "Vestiaire", "Accueil"] },
    ])
    expect(groupedRoleOrder(groups)).toEqual(["Régie", "Parking Nord", "Parking Mairie", "Bar", "Vestiaire", "Accueil"])
  })

  it("leaves empty groups out, « Autres postes » included (A07: a moved poste lands in its new group)", () => {
    expect(groupRolesBySector(["Bar"], () => "s-scene", sectors)).toEqual([{ id: "s-scene", name: "Scène", roles: ["Bar"] }])
    expect(groupRolesBySector([], () => null, sectors)).toEqual([])
  })

  it("keeps every active sector, empty ones included, with keepEmptySectors (« Gérer les postes »); never an archived one or an empty « Autres postes »", () => {
    expect(groupRolesBySector(["Bar"], () => "s-scene", sectors, { keepEmptySectors: true })).toEqual([
      { id: "s-scene", name: "Scène", roles: ["Bar"] },
      { id: "s-parking", name: "Parking", roles: [] },
    ])
    expect(groupRolesBySector([], () => null, sectors, { keepEmptySectors: true }).map((g) => g.id)).toEqual(["s-scene", "s-parking"])
  })

  it("keys the groups and words the archive confirmation", () => {
    expect(sectorGroupKey({ id: "s" })).toBe("s")
    expect(sectorGroupKey({ id: null })).toBe("none")
    expect(archiveSectorSentence("Parking", 0)).toBe("Le secteur « Parking » sera archivé. Vous pourrez le rétablir.")
    expect(archiveSectorSentence("Parking", 3)).toContain("ses 3 postes passeront dans « Autres postes »")
  })
})
