import { describe, expect, it } from "vitest"
import { POSTE_CATEGORIES, normalizePosteName, posteCategory } from "../poste-categories"
import { KNOWN_ROLES } from "../roles"

// The family gives a poste its default colour, always the same from one organisation to the next.
// A match is at the start of a word, never inside one; the first keyword met in the name wins.

const family = (name: string) => posteCategory(name)?.key ?? null

describe("posteCategory families", () => {
  it.each([
    ["accueil", "Accueil & info"],
    ["boissons", "Vin chaud"],
    ["restauration", "Crêpes"],
    ["installation", "Montage"],
    ["demontage", "Démontage et rangement"],
    ["securite", "Sécurité"],
    ["secours", "Premiers soins"],
    ["course", "Signaleurs de parcours"],
    ["animation", "Structure gonflable"],
    ["vente", "Paquet cadeau"],
    ["logistique", "Transport"],
    ["image", "Sonorisation"],
  ])("maps %s to a real poste name (%s)", (key, name) => {
    expect(family(name)).toBe(key)
  })

  it("has at least one keyword and the expected colour per family", () => {
    expect(Object.fromEntries(POSTE_CATEGORIES.map((category) => [category.key, category.colorKey]))).toEqual({
      accueil: "blue",
      boissons: "amber",
      restauration: "orange",
      installation: "teal",
      demontage: "stone",
      securite: "yellow",
      secours: "red",
      course: "emerald",
      animation: "pink",
      vente: "rose",
      logistique: "cyan",
      image: "violet",
    })
    for (const category of POSTE_CATEGORIES) expect(category.keywords.length).toBeGreaterThan(0)
  })

  it("gives every example poste a family, and covers every family", () => {
    const keys = new Set(KNOWN_ROLES.map((role) => posteCategory(role)?.key))
    expect(keys.size).toBe(POSTE_CATEGORIES.length)
    for (const role of KNOWN_ROLES) expect(posteCategory(role)).not.toBeNull()
  })
})

describe("posteCategory normalisation", () => {
  it("ignores case, accents and extra spaces", () => {
    expect(normalizePosteName("  DÉMONTAGE   ET RANGEMENT ")).toBe("demontage et rangement")
    expect(family("  DÉMONTAGE   ET RANGEMENT ")).toBe("demontage")
    expect(family("VIN CHAUD")).toBe("boissons")
    expect(family("acceuil")).toBe("accueil")
  })

  it("recognises multi-word keywords", () => {
    expect(family("Mise en place")).toBe("installation")
    expect(family("Premiers soins")).toBe("secours")
    expect(family("Vin chaud")).toBe("boissons")
    expect(family("Paquet cadeau")).toBe("vente")
    expect(family("Structure gonflable")).toBe("animation")
    expect(family("Château gonflable")).toBe("animation")
  })

  it("matches a keyword at the start of a word, not inside another one", () => {
    expect(family("Barbecue")).toBe("restauration")
    expect(family("Barbe à papa")).toBeNull()
    expect(family("Barnum relais")).toBeNull()
    expect(family("Barrières")).toBeNull()
    expect(family("Parcours")).toBe("course")
    expect(family("Pas de tir")).toBeNull()
  })

  it("does not read Démontage as Montage", () => {
    expect(family("Démontage")).toBe("demontage")
    expect(family("Montage")).toBe("installation")
  })

  it("accepts common variants and plurals", () => {
    expect(family("Barman")).toBe("boissons")
    expect(family("Crêpes")).toBe("restauration")
    expect(family("Signaleurs")).toBe("course")
    expect(family("Photos")).toBe("image")
    expect(family("Plonge")).toBe("demontage")
  })
})

describe("posteCategory first match", () => {
  it("keeps the family of the first keyword met in the name", () => {
    expect(family("Accueil / buvette")).toBe("accueil")
    expect(family("Caisse jetons ateliers enfants")).toBe("accueil")
    expect(family("Installation buvette")).toBe("installation")
    expect(family("Buvette / accueil")).toBe("boissons")
    expect(family("Buvette et sécurité")).toBe("boissons")
  })

  it("keeps the longest keyword when several start at the same place", () => {
    // « contrôle » (Accueil) and « contrôle des accès » (Sécurité) both start at 0.
    expect(family("Contrôle des accès")).toBe("securite")
    // « course » (Course et sport) and « courses » (Logistique) both start at 0.
    expect(family("Courses")).toBe("logistique")
    expect(family("Course")).toBe("course")
    // « service » (Restauration) is shorter than these two phrases starting at 0.
    expect(family("Service de sécurité")).toBe("securite")
    expect(family("Service de secours")).toBe("secours")
    expect(family("Service")).toBe("restauration")
  })
})

describe("posteCategory unknown names", () => {
  it("returns null for a poste outside every family", () => {
    expect(posteCategory("Pas de tir")).toBeNull()
    expect(posteCategory("Jardinage")).toBeNull()
    expect(posteCategory("")).toBeNull()
    expect(posteCategory("   ")).toBeNull()
  })
})
