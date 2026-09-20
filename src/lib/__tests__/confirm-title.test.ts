import { describe, it, expect } from "vitest"
import { normalizeTitle, titlesMatch } from "../confirm-title"

describe("normalizeTitle", () => {
  it("ignores case, accents and repeated spaces", () => {
    expect(normalizeTitle("  Fête  de l'Été ")).toBe("fete de l'ete")
  })
})

describe("titlesMatch", () => {
  it("matches the exact title", () => {
    expect(titlesMatch("Spectacle de Cirque 2026", "Spectacle de Cirque 2026")).toBe(true)
  })

  it("matches without accents and with different case", () => {
    expect(titlesMatch("FETE DE L'ETE", "Fête de l'Été")).toBe(true)
  })

  it("ignores extra spaces", () => {
    expect(titlesMatch("  Fete   de l'ete ", "Fête de l'Été")).toBe(true)
  })

  it("rejects a different title", () => {
    expect(titlesMatch("Fête de l'hiver", "Fête de l'Été")).toBe(false)
  })

  it("rejects an empty input and an empty title", () => {
    expect(titlesMatch("", "Fête")).toBe(false)
    expect(titlesMatch("   ", "   ")).toBe(false)
  })
})
