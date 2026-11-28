import { describe, it, expect } from "vitest"
import { sortTags } from "../sort-tags"

describe("sortTags", () => {
  it("orders accented and capitalised tags like a French reader expects", () => {
    expect(sortTags(["zone", "Électricien", "Sécurité", "buvette", "accueil"])).toEqual(["accueil", "buvette", "Électricien", "Sécurité", "zone"])
  })

  it("keeps each tag once", () => {
    expect(sortTags(["bar", "accueil", "bar"])).toEqual(["accueil", "bar"])
  })

  it("accepts any iterable and returns an empty list for none", () => {
    expect(sortTags(new Set(["b", "a"]))).toEqual(["a", "b"])
    expect(sortTags([])).toEqual([])
  })
})
