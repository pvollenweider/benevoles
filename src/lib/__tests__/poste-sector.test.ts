import { describe, expect, it } from "vitest"
import {
  newShiftSectorDecision, posteSectorConflictError, posteSectorMessage, posteSectorMismatch, posteSectorOf,
  posteSuggestionsInSector, switchSectorLabel,
} from "../poste-sector"

// Sector first, then poste (#1147): suggestions per sector, the « est dans le secteur » check of
// the shift form and the create route's decision.

const active = new Set(["sec-entrees", "sec-bar"])
const shifts = [
  { roleName: "Accueil", sectorId: "sec-entrees", displayOrder: 0 },
  { roleName: "Accueil", sectorId: "sec-entrees", displayOrder: 0 },
  { roleName: "Billetterie", sectorId: "sec-entrees", displayOrder: 100 },
  { roleName: "Buvette", sectorId: "sec-bar", displayOrder: 200 },
  { roleName: "Montage", sectorId: null, displayOrder: 300 },
  { roleName: "Vestiaire", sectorId: "sec-archive", displayOrder: 400 },
  { roleName: "Annulé", sectorId: "sec-bar", displayOrder: 500, status: "cancelled" },
]

describe("posteSectorOf", () => {
  it("reads the sector most live shifts of the poste carry, any spelling", () => {
    expect(posteSectorOf(shifts, "Accueil", active)).toBe("sec-entrees")
    expect(posteSectorOf(shifts, "  accueil ", active)).toBe("sec-entrees")
    expect(posteSectorOf(shifts, "Montage", active)).toBeNull()
  })

  it("counts an archived or unknown sector as « Autres postes »", () => {
    expect(posteSectorOf(shifts, "Vestiaire", active)).toBeNull()
    expect(posteSectorOf(shifts, "Vestiaire")).toBe("sec-archive")
  })

  it("ignores cancelled shifts", () => {
    expect(posteSectorOf(shifts, "Annulé", active)).toBeNull()
  })
})

describe("posteSuggestionsInSector", () => {
  const examples = ["Accueil", "Bar", "Sécurité"]

  it("offers the sector's postes in the event's order, then the examples the event does not use", () => {
    expect(posteSuggestionsInSector(shifts, "sec-entrees", active, examples)).toEqual(["Accueil", "Billetterie", "Bar", "Sécurité"])
    expect(posteSuggestionsInSector(shifts, "sec-bar", active, examples)).toEqual(["Buvette", "Bar", "Sécurité"])
  })

  it("puts the postes without an active sector under « Autres postes » (null)", () => {
    expect(posteSuggestionsInSector(shifts, null, active, examples)).toEqual(["Montage", "Vestiaire", "Bar", "Sécurité"])
  })

  it("never offers an example the event already uses in another sector", () => {
    expect(posteSuggestionsInSector(shifts, "sec-bar", active, examples)).not.toContain("Accueil")
  })
})

describe("posteSectorMismatch", () => {
  it("is null for a new poste, an empty field or the poste's own sector", () => {
    expect(posteSectorMismatch(shifts, "Nouveau", "sec-bar", active)).toBeNull()
    expect(posteSectorMismatch(shifts, "   ", "sec-bar", active)).toBeNull()
    expect(posteSectorMismatch(shifts, "Accueil", "sec-entrees", active)).toBeNull()
    expect(posteSectorMismatch(shifts, "Montage", null, active)).toBeNull()
  })

  it("gives the stored spelling and the poste's sector when it is in another one, case and spaces aside", () => {
    expect(posteSectorMismatch(shifts, " accueil  ", "sec-bar", active)).toEqual({ poste: "Accueil", sectorId: "sec-entrees" })
    expect(posteSectorMismatch(shifts, "Accueil", null, active)).toEqual({ poste: "Accueil", sectorId: "sec-entrees" })
    expect(posteSectorMismatch(shifts, "Montage", "sec-bar", active)).toEqual({ poste: "Montage", sectorId: null })
  })

  it("does not count a poste whose shifts are all cancelled: it is a new poste again", () => {
    expect(posteSectorMismatch(shifts, "Annulé", "sec-entrees", active)).toBeNull()
  })
})

describe("texts", () => {
  it("names the sector, or « Autres postes »", () => {
    expect(posteSectorMessage("Accueil", "Entrées")).toBe("Le poste « Accueil » est dans le secteur « Entrées ».")
    expect(posteSectorMessage("Montage", null)).toBe("Le poste « Montage » est dans « Autres postes ».")
    expect(switchSectorLabel("Entrées")).toBe("Utiliser ce poste dans « Entrées »")
    expect(switchSectorLabel(null)).toBe("Utiliser ce poste dans « Autres postes »")
    expect(posteSectorConflictError("Accueil", "Entrées")).toBe("Le poste « Accueil » est dans le secteur « Entrées » : choisissez ce secteur, ou un autre nom pour créer un nouveau poste.")
  })
})

describe("newShiftSectorDecision", () => {
  it("puts a new poste in the requested sector, or « Autres postes »", () => {
    expect(newShiftSectorDecision(undefined, "sec-bar")).toEqual({ ok: true, sectorId: "sec-bar" })
    expect(newShiftSectorDecision(undefined, null)).toEqual({ ok: true, sectorId: null })
  })

  it("keeps an existing poste's sector when the request agrees", () => {
    expect(newShiftSectorDecision("sec-bar", "sec-bar")).toEqual({ ok: true, sectorId: "sec-bar" })
    expect(newShiftSectorDecision(null, null)).toEqual({ ok: true, sectorId: null })
  })

  it("refuses (409) a request that disagrees with the existing poste, never moving it", () => {
    expect(newShiftSectorDecision("sec-entrees", "sec-bar")).toEqual({ ok: false, status: 409, posteSectorId: "sec-entrees" })
    expect(newShiftSectorDecision(null, "sec-bar")).toEqual({ ok: false, status: 409, posteSectorId: null })
    expect(newShiftSectorDecision("sec-bar", null)).toEqual({ ok: false, status: 409, posteSectorId: "sec-bar" })
  })
})
