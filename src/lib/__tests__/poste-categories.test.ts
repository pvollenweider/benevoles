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
    expect(family("Barbe à papa")).toBe("restauration") // its own keyword, not « bar »
    expect(family("Barnum relais")).toBe("installation") // its own keyword, not « bar »
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

describe("posteCategory weak keywords", () => {
  it.each([
    // A strong keyword anywhere in the name wins over the action word before it.
    ["Préparation des crêpes", "restauration"],
    ["Préparation de la soupe", "restauration"],
    ["Préparation sandwichs et paninis", "restauration"],
    ["PRÉPARATION REPAS", "restauration"],
    ["Préparation pâte à Churros", "restauration"],
    ["Preparation buvette", "boissons"],
    ["Préparation Vin chaud", "boissons"],
    ["Stand Boissons", "boissons"],
    ["Stand Vin Chaud", "boissons"],
    ["Stand Maquillage", "animation"],
    ["Stand Chateau Gonflable", "animation"],
    ["Stand de vente", "vente"],
    ["Réception des livraisons", "logistique"],
    ["Entrée et dessert", "restauration"],
    ["Entrée + tickets", "accueil"],
    ["Service buvette", "boissons"],
    ["Service au bar", "boissons"],
    ["Service Crêpes", "restauration"],
    ["Distribution repas", "restauration"],
    ["Distribution de tartiflettes", "restauration"],
  ])("lets the strong keyword win in %s", (name, key) => {
    expect(family(name)).toBe(key)
  })

  it.each([
    // With no strong keyword, the weak action word decides.
    ["Préparation", "installation"],
    ["Préparation Salle des fêtes", "installation"],
    ["Stand", "vente"],
    ["Tenue du stand", "vente"],
    ["Réception", "accueil"],
    ["Entrée", "accueil"],
    ["Service", "restauration"],
    ["Service Midi", "restauration"],
    ["Distribution", "logistique"],
  ])("falls back to the weak keyword in %s", (name, key) => {
    expect(family(name)).toBe(key)
  })
})

describe("posteCategory whole keywords and removed false positives", () => {
  it("matches loge as a whole word only", () => {
    expect(family("Loge")).toBe("animation")
    expect(family("Loges")).toBe("animation")
    expect(family("Logement")).toBeNull()
    expect(family("Permanence consommation logement")).not.toBe("animation")
  })

  it("does not read depart or tri as a family on their own", () => {
    expect(family("Départ des exposants")).toBeNull()
    expect(family("Tri des denrées")).toBeNull()
    expect(family("Tri des déchets")).toBe("demontage")
  })

  it("does not treat aide or tenue as keywords", () => {
    expect(family("Aide")).toBeNull()
    expect(family("Tenue")).toBeNull()
  })
})

describe("posteCategory added keywords", () => {
  it.each([
    ["Acueil", "accueil"],
    ["Permanence", "accueil"],
    ["Pointage", "accueil"],
    ["Friterie", "restauration"],
    ["Cuisson", "restauration"],
    ["Précuisson", "restauration"],
    ["Grilleur", "restauration"],
    ["Grillades", "restauration"],
    ["Hamburger", "restauration"],
    ["Gaufre", "restauration"],
    ["Cookie", "restauration"],
    ["Pop corn", "restauration"],
    ["Popcorn", "restauration"],
    ["Collation", "restauration"],
    ["Goûter", "restauration"],
    ["Tartiflette", "restauration"],
    ["Hot dog", "restauration"],
    ["Pâtes", "restauration"],
    ["Churros", "restauration"],
    ["Barbe à papa", "restauration"],
    ["Sucré salé", "restauration"],
    ["Gourmandise", "restauration"],
    ["Friandise", "restauration"],
    ["Bonbon", "restauration"],
    ["Ravaitaillement", "course"],
    ["Greffier", "course"],
    ["Échauffement", "course"],
    ["Podium", "course"],
    ["Récompense", "course"],
    ["Chapiteau", "installation"],
    ["Barnum", "installation"],
    ["Marquage", "installation"],
    ["Signalétique", "installation"],
    ["Mise en rayon", "logistique"],
    ["Étiquetage", "logistique"],
    ["Packaging", "logistique"],
    ["Intendance", "logistique"],
    ["Initiation", "animation"],
    ["Loisirs créatifs", "animation"],
    ["Mascotte", "animation"],
    ["Père Noël", "animation"],
    ["Mère Noël", "animation"],
    ["Lutin", "animation"],
    ["Parade", "animation"],
  ])("classifies %s as %s", (name, key) => {
    expect(family(name)).toBe(key)
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
