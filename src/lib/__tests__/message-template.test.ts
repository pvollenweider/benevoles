import { describe, it, expect } from "vitest"
import { renderVariables, templateProblems, variablesIn } from "../message-template"

// Message templates (#482).
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
