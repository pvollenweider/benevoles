import { describe, expect, it } from "vitest"
import {
  newShiftSectorDecision, posteSectorConflictError, posteSectorMessage, posteSectorMismatch, posteSectorOf,
  posteSuggestionsInSector, switchSectorLabel,
  effectiveSector, newPosteSectorHint, posteFollowHint, typedPosteSector,
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

describe("the « Secteur » select following the poste typed (#1147 follow-up)", () => {
  const live = new Set(["sec-entrees", "sec-bar"])
  const shifts = [
    { roleName: "Accueil", sectorId: "sec-entrees" },
    { roleName: "Montage", sectorId: null },
  ]

  it("typedPosteSector: the existing poste's sector (any spelling), null for « Autres postes », undefined for a new or empty name", () => {
    expect(typedPosteSector(shifts, "  ACCUEIL ", live)).toBe("sec-entrees")
    expect(typedPosteSector(shifts, "Montage", live)).toBeNull()
    expect(typedPosteSector(shifts, "Vestiaire", live)).toBeUndefined()
    expect(typedPosteSector(shifts, "  ", live)).toBeUndefined()
    // An archived sector is « Autres postes », as the grouped views draw it.
    expect(typedPosteSector(shifts, "Accueil", new Set(["sec-bar"]))).toBeNull()
  })

  it("effectiveSector: an unchosen select follows an existing poste, to a sector or to « Autres postes »", () => {
    expect(effectiveSector(false, "sec-entrees", null)).toBe("sec-entrees")
    expect(effectiveSector(false, null, "sec-bar")).toBeNull()
  })

  it("effectiveSector: a new name goes back to « Autres postes » unless a sector was chosen", () => {
    // « Bar » followed the Buvette sector; « Barrière » is new: back to « Autres postes ».
    expect(effectiveSector(false, undefined, "sec-bar")).toBeNull()
    expect(effectiveSector(false, undefined, null)).toBeNull()
    expect(effectiveSector(true, undefined, "sec-bar")).toBe("sec-bar")
  })

  it("effectiveSector: a chosen select never follows (the mismatch rule applies instead)", () => {
    expect(effectiveSector(true, "sec-entrees", "sec-bar")).toBe("sec-bar")
    expect(effectiveSector(true, null, "sec-bar")).toBe("sec-bar")
  })

  it("posteFollowHint names the sector, then the poste's settings", () => {
    expect(posteFollowHint("Accueil", "Entrées")).toBe("Secteur du poste : « Entrées ». Les paramètres du poste « Accueil » s'appliquent (couleur, limite, accès, chevauchement).")
    expect(posteFollowHint("Montage", null)).toMatch(/^Secteur du poste : « Autres postes »\./)
  })

  it("newPosteSectorHint: one shift or several", () => {
    expect(newPosteSectorHint("Bar")).toBe("Le poste sera créé dans « Bar » avec son premier créneau.")
    expect(newPosteSectorHint(null, true)).toBe("Le poste sera créé dans « Autres postes » avec ses créneaux.")
  })
})
