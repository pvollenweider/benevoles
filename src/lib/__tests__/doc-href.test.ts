import { describe, expect, it } from "vitest"
import { docUnitHref } from "@/lib/doc-href"
import { loadDocUnits } from "@/lib/doc-units"

describe("docUnitHref", () => {
  it("builds the /doc path of a unit", () => {
    expect(docUnitHref("rappels")).toBe("/doc/rappels")
    expect(docUnitHref("liste-d-attente")).toBe("/doc/liste-d-attente")
  })

  it("refuses anything that is not a plain slug", () => {
    for (const bad of ["", "javascript:alert(1)", "../admin", "a/b", "A", "a--b", "-a", "a b", "a?x=1", "a#b"]) {
      expect(() => docUnitHref(bad), bad).toThrow(/Invalid documentation slug/)
    }
  })

  it("accepts every unit of guide/", () => {
    for (const unit of loadDocUnits()) expect(docUnitHref(unit.slug)).toBe(`/doc/${unit.slug}`)
  })
})
