import { describe, it, expect } from "vitest"
import { categoryRank, filterTemplates, groupTemplatesByCategory, OTHER_CATEGORY, TEMPLATE_CATEGORIES } from "../message-template-category"

// Category grouping and search of the template picker (#1414).
const templates = [
  { id: "pluie", name: "Alerte météo : pluie", subject: "Pluie annoncée", category: "Météo et imprévus" },
  { id: "parking", name: "Parking et accès", subject: "Où se garer", category: "Infos pratiques" },
  { id: "merci", name: "Merci !", subject: "Merci pour {événement}", category: OTHER_CATEGORY },
  { id: "chaleur", name: "Alerte météo : chaleur", subject: "Forte chaleur", category: "Météo et imprévus" },
  { id: "accueil", name: "Bienvenue dans l'équipe", subject: "Bienvenue", category: "Accueil" },
  { id: "inconnue", name: "Ancien modèle", subject: "Divers", category: "Ancienne catégorie" },
]

describe("template categories", () => {
  it("puts the library categories first, then « Autres », then unknown ones", () => {
    expect(categoryRank("Météo et imprévus")).toBeLessThan(categoryRank(OTHER_CATEGORY))
    expect(categoryRank(OTHER_CATEGORY)).toBeLessThan(categoryRank("Ancienne catégorie"))
    expect(TEMPLATE_CATEGORIES.at(-1)).toBe(OTHER_CATEGORY)
  })

  it("groups in the library's order and leaves empty categories out", () => {
    const groups = groupTemplatesByCategory(templates)
    expect(groups.map((g) => g.category)).toEqual(["Accueil", "Infos pratiques", "Météo et imprévus", OTHER_CATEGORY, "Ancienne catégorie"])
    expect(groups.find((g) => g.category === "Météo et imprévus")?.items.map((t) => t.id)).toEqual(["pluie", "chaleur"])
  })

  it("treats a missing category as « Autres »", () => {
    expect(groupTemplatesByCategory([{ category: "" }])[0].category).toBe(OTHER_CATEGORY)
  })

  it("filters on name, subject or category, ignoring accents and case", () => {
    expect(filterTemplates(templates, "meteo").map((t) => t.id)).toEqual(["pluie", "chaleur"])
    expect(filterTemplates(templates, "PLUIE").map((t) => t.id)).toEqual(["pluie"])
    expect(filterTemplates(templates, "garer").map((t) => t.id)).toEqual(["parking"])
    expect(filterTemplates(templates, "merci événement").map((t) => t.id)).toEqual(["merci"])
    expect(filterTemplates(templates, "  ")).toHaveLength(templates.length)
    expect(filterTemplates(templates, "introuvable")).toEqual([])
  })
})
