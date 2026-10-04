// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { describe, it, expect } from "vitest"
import { confirmationVariables, fillVariables } from "../message-variables"

const vars = confirmationVariables("Lucas", { label: "Chauffeur navette", day: "samedi 10 octobre", startTime: "08:00" })

describe("fillVariables", () => {
  it("fills the single-brace spelling of the message templates, with or without the accent (regression: {prenom} was shown raw)", () => {
    expect(fillVariables("Merci {prenom} !", vars)).toBe("Merci Lucas !")
    expect(fillVariables("Merci {prénom} !", vars)).toBe("Merci Lucas !")
  })

  it("still fills the double-brace spelling already saved in events", () => {
    expect(fillVariables("Merci {{prenom}} pour {{créneau}}", vars)).toBe("Merci Lucas pour Chauffeur navette")
    expect(fillVariables("{{creneau}}", vars)).toBe("Chauffeur navette")
  })

  it("ignores case and spaces inside the braces", () => {
    expect(fillVariables("{ Prénom } {{ PRENOM }}", vars)).toBe("Lucas Lucas")
  })

  it("fills date and time from the first shift", () => {
    expect(fillVariables("Le {date} à {heure}", vars)).toBe("Le samedi 10 octobre à 08:00")
  })

  it("leaves unknown names and stray braces as written", () => {
    expect(fillVariables("{nom} {{inconnu}} { } {", vars)).toBe("{nom} {{inconnu}} { } {")
  })

  it("does not cross lines or swallow long text between braces", () => {
    const text = "{début\nprenom}"
    expect(fillVariables(text, vars)).toBe(text)
  })
})

describe("confirmationVariables", () => {
  it("leaves the shift variables empty when there is no shift", () => {
    expect(confirmationVariables("Lucas")).toEqual({ prénom: "Lucas", créneau: "", date: "", heure: "" })
  })

  it("writes a legacy time past midnight as a clock time", () => {
    expect(confirmationVariables("A", { label: "Bar", startTime: "25:30" }).heure).toBe("01:30")
  })
})
