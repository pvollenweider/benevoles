import { describe, it, expect } from "vitest"
import { continueLabel } from "../continue-label"

describe("continueLabel", () => {
  it("says one new shift in the singular", () => {
    expect(continueLabel(1)).toBe("Continuer (1 nouveau créneau)")
  })

  it("says several new shifts in the plural", () => {
    expect(continueLabel(2)).toBe("Continuer (2 nouveaux créneaux)")
    expect(continueLabel(12)).toBe("Continuer (12 nouveaux créneaux)")
  })
})
