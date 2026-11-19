import { describe, it, expect } from "vitest"
import { hasUnfilledPlaceholder, placeholderProblems, renderVariables, sendProblems, TEMPLATE_LIMIT, templateProblems, templateSchema, variablesIn } from "../message-template"
import { OTHER_CATEGORY } from "../message-template-category"

// Message templates (#482), library placeholders (#1414).
const ctx = { prénom: "Léa", événement: "Fête", poste: "Bar", créneau: "Bar · sam. 18h–20h" }

describe("renderVariables", () => {
  it("replaces the documented variables, whatever the case and spaces", () => {
    expect(renderVariables("Merci {prénom} pour {Événement} !", ctx)).toBe("Merci Léa pour Fête !")
    expect(renderVariables("Au { poste }, {créneau}.", ctx)).toBe("Au Bar, Bar · sam. 18h–20h.")
  })

  it("keeps literal braces written {{ and }}", () => {
    expect(renderVariables("Code {{A}} pour {prénom}", ctx)).toBe("Code {A} pour Léa")
  })

  it("leaves a variable without value as written (checked before sending)", () => {
    expect(renderVariables("{poste}", { prénom: "Léa", événement: "Fête" })).toBe("{poste}")
  })
})

describe("templateProblems", () => {
  it("refuses unknown variables and misplaced ones", () => {
    expect(templateProblems("Hello {nom}", "event")[0]).toMatch(/Variable inconnue : \{nom\}/)
    expect(templateProblems("{poste}", "event")[0]).toMatch(/\{poste\} ne s'utilise/)
    expect(templateProblems("{créneau}", "role")[0]).toMatch(/\{créneau\} ne s'utilise/)
    expect(templateProblems("{poste} {créneau} {prénom}", "shift")).toEqual([])
    expect(templateProblems("Pas de variable, {{ accolade }}", "event")).toEqual([])
  })

  it("lists the variables used", () => {
    expect(variablesIn("{prénom} et {{x}} et { poste }")).toEqual(["prénom", "poste"])
  })
})

describe("[à compléter] (#1414)", () => {
  it("keeps the library validation free of placeholder errors", () => {
    // The library itself contains placeholders; templateProblems() validates only the variables.
    expect(templateProblems("On se retrouve à [à compléter : lieu].", "event")).toEqual([])
  })

  it("detects a placeholder in a subject or a body, and blocks the send", () => {
    expect(hasUnfilledPlaceholder("Rendez-vous à [à compléter : entrée]")).toBe(true)
    expect(hasUnfilledPlaceholder("Rendez-vous à l'entrée")).toBe(false)
    expect(placeholderProblems("Rendez-vous à [à compléter : entrée]")).toEqual([expect.stringContaining("à compléter")])
    expect(sendProblems("Rendez-vous à [à compléter : entrée]", "event")).toEqual([expect.stringContaining("à compléter")])
    // A variable problem and a placeholder are both reported.
    expect(sendProblems("{nom} à [à compléter]", "event")).toHaveLength(2)
    expect(sendProblems("Tout est prêt.", "event")).toEqual([])
  })

  it("has a limit of 100 templates per organisation", () => {
    expect(TEMPLATE_LIMIT).toBe(100)
  })
})

describe("templateSchema category (#1414)", () => {
  const base = { name: "A", subject: "x", body: "y" }

  it("defaults to « Autres » and refuses an unknown category with a French message", () => {
    expect(templateSchema.parse(base).category).toBe(OTHER_CATEGORY)
    const refused = templateSchema.safeParse({ ...base, category: "Ancienne catégorie" })
    expect(refused.success).toBe(false)
    if (!refused.success) expect(refused.error.issues[0].message).toBe("Choisissez une catégorie dans la liste.")
  })
})
