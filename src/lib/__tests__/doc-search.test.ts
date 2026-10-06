import { describe, it, expect } from "vitest"
import { docFilterStatus, docUnitQuestions, matchesDocQuery, normalizeForSearch, searchTerms } from "../doc-search"
import { readDocUnits } from "../doc-units"

// The filter over the documentation's index (/doc, /doc/admin, /doc/benevole).

const entry = {
  title: "Ma page personnelle",
  summary: "Ta page personnelle : ton prochain créneau, changer de créneau ou annuler.",
  questions: ["Je veux changer de créneau", "Je n’ai plus le lien"],
}

describe("normalizeForSearch", () => {
  it("drops case, accents and repeated spaces, and straightens apostrophes", () => {
    expect(normalizeForSearch("  Créneau   ÉTÉ  ")).toBe("creneau ete")
    expect(normalizeForSearch("l’événement")).toBe("l'evenement")
  })
})

describe("searchTerms", () => {
  it("splits a query into normalised words, none for a blank query", () => {
    expect(searchTerms("  Changer   Créneau ")).toEqual(["changer", "creneau"])
    expect(searchTerms("   ")).toEqual([])
  })
})

describe("matchesDocQuery", () => {
  it("matches everything on an empty or blank query", () => {
    expect(matchesDocQuery(entry, "")).toBe(true)
    expect(matchesDocQuery(entry, "   ")).toBe(true)
  })

  it("ignores accents and case, both ways", () => {
    expect(matchesDocQuery(entry, "CRENEAU")).toBe(true)
    expect(matchesDocQuery({ ...entry, summary: "creneau" }, "créneau")).toBe(true)
  })

  it("needs every word, anywhere in the title, the summary or a question", () => {
    expect(matchesDocQuery(entry, "page annuler")).toBe(true)
    expect(matchesDocQuery(entry, "page rembourser")).toBe(false)
    expect(matchesDocQuery(entry, "lien")).toBe(true)
    expect(matchesDocQuery(entry, "n'ai plus")).toBe(true)
  })

  it("matches the start of a word as the reader types it", () => {
    expect(matchesDocQuery(entry, "chang cren")).toBe(true)
  })
})

describe("docUnitQuestions", () => {
  it("returns the « ### » headings as plain text, outside fenced code", () => {
    const md = [
      "## Questions fréquentes",
      "",
      "### Je veux **changer** de [créneau](choisir.md#x)",
      "Texte.",
      "```",
      "### pas un titre",
      "```",
      "#### Trop profond",
      "### Où sont mes `données` ? ###",
    ].join("\n")
    expect(docUnitQuestions(md)).toEqual(["Je veux changer de créneau", "Où sont mes données ?"])
  })

  it("finds the volunteers' questions in the real units", () => {
    const unit = readDocUnits().find((u) => u.slug === "ma-page-personnelle")!
    expect(docUnitQuestions(unit.body)).toContain("Je veux changer de créneau")
  })
})

describe("docFilterStatus", () => {
  it("says the result in a full sentence, with the query", () => {
    expect(docFilterStatus("lien", 7, 50)).toBe("7 fiches sur 50 correspondent à « lien ».")
    expect(docFilterStatus("lien", 1, 50)).toBe("1 fiche sur 50 correspond à « lien ».")
    expect(docFilterStatus(" xyz ", 0, 50)).toBe("Aucune fiche pour « xyz ».")
  })

  it("gives the total once the filter is cleared", () => {
    expect(docFilterStatus("", 50, 50)).toBe("Les 50 fiches sont affichées.")
    expect(docFilterStatus("", 1, 1)).toBe("La fiche est affichée.")
  })
})
