import { describe, it, expect } from "vitest"
import { fold, foldedIncludes } from "../text-fold"

// Accent-insensitive filters (#390).
describe("fold", () => {
  it("drops diacritics and case, keeps everything else", () => {
    expect(fold("Zoé")).toBe("zoe")
    expect(fold("François Müller-Élève")).toBe("francois muller-eleve")
    expect(fold("a+b@x.ch")).toBe("a+b@x.ch")
    expect(fold(null)).toBe("")
  })

  it("matches in both directions of accents", () => {
    expect(foldedIncludes("Zoé Roy", "zoe")).toBe(true)
    expect(foldedIncludes("Zoe Roy", "Zoé")).toBe(true)
    expect(foldedIncludes("Zoé Roy", "zoi")).toBe(false)
    expect(foldedIncludes(null, "")).toBe(true)
  })
})
