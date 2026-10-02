import { describe, it, expect } from "vitest"
import { moveRole, roleMoveBoundaryMessage, roleMoveMessage } from "../role-order"

describe("moveRole", () => {
  const roles = ["Bar", "Accueil", "Cuisine"]

  it("moves a middle role up and down by one", () => {
    expect(moveRole(roles, "Accueil", "up")).toEqual({ roles: ["Accueil", "Bar", "Cuisine"], index: 0 })
    expect(moveRole(roles, "Accueil", "down")).toEqual({ roles: ["Bar", "Cuisine", "Accueil"], index: 2 })
  })

  it("returns null at the ends", () => {
    expect(moveRole(roles, "Bar", "up")).toBeNull()
    expect(moveRole(roles, "Cuisine", "down")).toBeNull()
  })

  it("returns null for an absent role", () => {
    expect(moveRole(roles, "Parking", "up")).toBeNull()
  })

  it("does not mutate its input", () => {
    const input = ["Bar", "Accueil"]
    moveRole(input, "Accueil", "up")
    expect(input).toEqual(["Bar", "Accueil"])
  })
})

describe("roleMoveMessage", () => {
  it("says the position in the middle", () => {
    expect(roleMoveMessage("Bar", 1, 5)).toBe("Bar déplacé en position 2 sur 5.")
  })

  it("says first and last instead of a number", () => {
    expect(roleMoveMessage("Bar", 0, 5)).toBe("Bar déplacé en première position.")
    expect(roleMoveMessage("Bar", 4, 5)).toBe("Bar déplacé en dernière position.")
  })
})

describe("roleMoveBoundaryMessage", () => {
  it("says the role is already at that end", () => {
    expect(roleMoveBoundaryMessage("Bar", "up")).toBe("Bar est déjà en première position.")
    expect(roleMoveBoundaryMessage("Bar", "down")).toBe("Bar est déjà en dernière position.")
  })
})
