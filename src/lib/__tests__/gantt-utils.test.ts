import { describe, it, expect } from "vitest"
import { resolveNewShiftDisplayOrder } from "../gantt-utils"

describe("resolveNewShiftDisplayOrder", () => {
  it("inherits the existing role's displayOrder instead of a hardcoded 0 (#215 regression)", () => {
    const existing = [
      { roleName: "Sécurité", displayOrder: 0 },
      { roleName: "Bar", displayOrder: 200 },
    ]
    // Adding a new "Bar" shift must not drag the whole role back to position 0 — it should join
    // Bar's own displayOrder (200), even though the naive default is 0.
    expect(resolveNewShiftDisplayOrder(existing, "Bar", 0)).toBe(200)
  })

  it("falls back to the given default for a genuinely new role", () => {
    const existing = [{ roleName: "Bar", displayOrder: 200 }]
    expect(resolveNewShiftDisplayOrder(existing, "Accueil", 0)).toBe(0)
  })

  it("falls back when there are no existing shifts at all", () => {
    expect(resolveNewShiftDisplayOrder([], "Bar", 0)).toBe(0)
  })
})
