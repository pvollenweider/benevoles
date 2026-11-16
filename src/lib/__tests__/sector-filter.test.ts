import { describe, it, expect } from "vitest"
import {
  ALL_SECTORS,
  CURRENT_SHIFT_WORDS,
  REGISTRATION_WORDS,
  SHIFT_WORDS,
  documentsScopeAnnouncement,
  parseSectorFilter,
  postesInSectorFilter,
  registrationSectorWhere,
  roleInSectorFilter,
  sectorFileSuffix,
  sectorFilterAnnouncement,
  sectorFilterCaption,
  sectorFilterOptions,
  sectorFilterSearch,
  sectorFilterValue,
  shiftSectorWhere,
  withSectorFilter,
} from "../sector-filter"

const adopted = { sectorsEnabled: true, sectorsAdoptedAt: new Date("2026-10-01") }
const notAdopted = { sectorsEnabled: true, sectorsAdoptedAt: null }
const sectors = [
  { id: "sec-park", name: "Parking", displayOrder: 1, archivedAt: null },
  { id: "sec-bar", name: "Bar", displayOrder: 0, archivedAt: null },
  { id: "sec-old", name: "Ancien", displayOrder: 2, archivedAt: new Date("2026-10-10") },
]

describe("parseSectorFilter (#1170)", () => {
  it("is always « all » for an event without sectors, whatever the URL says", () => {
    expect(parseSectorFilter("sec-park", notAdopted, sectors)).toEqual(ALL_SECTORS)
    expect(parseSectorFilter("autres", notAdopted, sectors)).toEqual(ALL_SECTORS)
    expect(parseSectorFilter("sec-park", null, sectors)).toEqual(ALL_SECTORS)
  })

  it("reads an active sector of the event, and « autres »", () => {
    expect(parseSectorFilter("sec-park", adopted, sectors)).toEqual({ kind: "sector", id: "sec-park", name: "Parking" })
    expect(parseSectorFilter("autres", adopted, sectors)).toEqual({ kind: "others" })
    expect(parseSectorFilter(["sec-bar", "sec-park"], adopted, sectors)).toEqual({ kind: "sector", id: "sec-bar", name: "Bar" })
  })

  it("treats an unknown, foreign, archived or empty value as « all », never an error", () => {
    expect(parseSectorFilter("sec-of-another-org", adopted, sectors)).toEqual(ALL_SECTORS)
    expect(parseSectorFilter("sec-old", adopted, sectors)).toEqual(ALL_SECTORS)
    expect(parseSectorFilter("", adopted, sectors)).toEqual(ALL_SECTORS)
    expect(parseSectorFilter(undefined, adopted, sectors)).toEqual(ALL_SECTORS)
    expect(parseSectorFilter("Autres", adopted, sectors)).toEqual(ALL_SECTORS)
  })
})

describe("sectorFilterOptions", () => {
  it("offers all sectors, the active sectors in their order, then « Autres postes »; no archived sector", () => {
    expect(sectorFilterOptions(sectors)).toEqual([
      { value: "", label: "Tous les secteurs" },
      { value: "sec-bar", label: "Bar" },
      { value: "sec-park", label: "Parking" },
      { value: "autres", label: "Autres postes" },
    ])
  })

  it("round-trips through the URL value", () => {
    for (const o of sectorFilterOptions(sectors)) expect(sectorFilterValue(parseSectorFilter(o.value, adopted, sectors))).toBe(o.value)
  })
})

describe("postesInSectorFilter", () => {
  const sectorOf = new Map<string, string | null>([
    ["Parking Nord", "sec-park"],
    ["Parking Mairie", "sec-park"],
    ["Bar", "sec-bar"],
    ["Accueil", null],
    // Only a race could leave a poste in an archived sector: it counts in « Autres postes ».
    ["Vestiaire", "sec-old"],
  ])
  const active = new Set(["sec-park", "sec-bar"])

  it("keeps the postes of the sector, sorted", () => {
    expect(postesInSectorFilter({ kind: "sector", id: "sec-park", name: "Parking" }, sectorOf, active)).toEqual(["Parking Mairie", "Parking Nord"])
  })

  it("puts the postes without an active sector in « Autres postes »", () => {
    expect(postesInSectorFilter({ kind: "others" }, sectorOf, active)).toEqual(["Accueil", "Vestiaire"])
  })

  it("gives null for all sectors, and every poste lands in exactly one choice", () => {
    expect(postesInSectorFilter(ALL_SECTORS, sectorOf, active)).toBeNull()
    const choices = [
      { kind: "sector" as const, id: "sec-park", name: "Parking" },
      { kind: "sector" as const, id: "sec-bar", name: "Bar" },
      { kind: "others" as const },
    ].flatMap((f) => postesInSectorFilter(f, sectorOf, active)!)
    expect(choices.sort()).toEqual([...sectorOf.keys()].sort())
  })

  it("keeps an empty sector empty: the query then matches nothing, not everything", () => {
    const postes = postesInSectorFilter({ kind: "sector", id: "sec-empty", name: "Vide" }, sectorOf, new Set(["sec-empty"]))
    expect(postes).toEqual([])
    expect(shiftSectorWhere(postes)).toEqual({ roleName: { in: [] } })
    expect(registrationSectorWhere(postes)).toEqual({ shift: { roleName: { in: [] } } })
  })

  it("adds no condition when not filtered", () => {
    expect(shiftSectorWhere(null)).toEqual({})
    expect(registrationSectorWhere(null)).toEqual({})
    expect(roleInSectorFilter(null, "Bar")).toBe(true)
    expect(roleInSectorFilter(["Bar"], "Accueil")).toBe(false)
  })
})

describe("URLs", () => {
  const park = { kind: "sector" as const, id: "sec-park", name: "Parking" }

  it("sets the param on a link, keeping its other params and hash", () => {
    expect(withSectorFilter("/api/admin/events/e1/export/pdf", park)).toBe("/api/admin/events/e1/export/pdf?secteur=sec-park")
    expect(withSectorFilter("/admin/events/e1/registrations?demandes=1#x", { kind: "others" })).toBe("/admin/events/e1/registrations?demandes=1&secteur=autres#x")
  })

  it("leaves a link untouched for all sectors, and drops a stale param", () => {
    expect(withSectorFilter("/admin/events/e1/staffing", ALL_SECTORS)).toBe("/admin/events/e1/staffing")
    expect(withSectorFilter("/admin/events/e1/staffing?secteur=old&q=a", ALL_SECTORS)).toBe("/admin/events/e1/staffing?q=a")
  })

  it("builds the next search string from the select, the page's params kept", () => {
    expect(sectorFilterSearch("?q=marie&lien=none", "sec-park")).toBe("?q=marie&lien=none&secteur=sec-park")
    expect(sectorFilterSearch("?secteur=sec-park&q=marie", "")).toBe("?q=marie")
    expect(sectorFilterSearch("", "")).toBe("")
    expect(sectorFilterSearch("secteur=a", "autres")).toBe("?secteur=autres")
    expect(sectorFilterSearch("?shift=s1&q=marie", "sec-park", ["shift"])).toBe("?q=marie&secteur=sec-park")
  })

  it("names a filtered export file after the sector", () => {
    expect(sectorFileSuffix(park)).toBe("-secteur-parking")
    expect(sectorFileSuffix({ kind: "sector", id: "x", name: "Équipe Été" })).toBe("-secteur-equipe-ete")
    expect(sectorFileSuffix({ kind: "others" })).toBe("-autres-postes")
    expect(sectorFileSuffix(ALL_SECTORS)).toBe("")
  })
})

describe("texts", () => {
  const park = { kind: "sector" as const, id: "sec-park", name: "Parking" }

  it("announces none, one and many, for a sector, the others and all", () => {
    expect(sectorFilterAnnouncement(park, 0, REGISTRATION_WORDS)).toBe("Aucune inscription dans le secteur « Parking ».")
    expect(sectorFilterAnnouncement(park, 1, REGISTRATION_WORDS)).toBe("1 inscription dans le secteur « Parking ».")
    expect(sectorFilterAnnouncement(park, 12, REGISTRATION_WORDS)).toBe("12 inscriptions dans le secteur « Parking ».")
    expect(sectorFilterAnnouncement({ kind: "others" }, 3, SHIFT_WORDS)).toBe("3 créneaux dans « Autres postes ».")
    expect(sectorFilterAnnouncement(ALL_SECTORS, 40, REGISTRATION_WORDS)).toBe("40 inscriptions, tous secteurs.")
    expect(sectorFilterAnnouncement(ALL_SECTORS, 0, SHIFT_WORDS)).toBe("Aucun créneau, tous secteurs.")
    expect(sectorFilterAnnouncement(park, 2, CURRENT_SHIFT_WORDS)).toBe("2 créneaux en cours ou à venir dans le secteur « Parking ».")
  })

  it("says what the documents cover", () => {
    expect(documentsScopeAnnouncement(park)).toBe("Documents limités au secteur « Parking ».")
    expect(documentsScopeAnnouncement({ kind: "others" })).toBe("Documents limités à « Autres postes ».")
    expect(documentsScopeAnnouncement(ALL_SECTORS)).toBe("Documents pour tous les secteurs.")
  })

  it("captions a filtered document, nothing otherwise", () => {
    expect(sectorFilterCaption(park)).toBe("Secteur : Parking")
    expect(sectorFilterCaption({ kind: "others" })).toBe("Secteur : Autres postes")
    expect(sectorFilterCaption(ALL_SECTORS)).toBeNull()
  })
})
