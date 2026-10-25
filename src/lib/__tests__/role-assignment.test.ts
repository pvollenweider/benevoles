import { describe, it, expect } from "vitest"
import { assignedOnlyRoles, asksAssignedOnly, publicShifts, roleAssignedOnly } from "../role-assignment"

// Roles assigned by the organisation only (#1145): never offered publicly.
const s = (id: string, roleName: string, assignedOnly?: boolean | null) => ({ id, roleName, assignedOnly })

describe("assignedOnlyRoles / roleAssignedOnly", () => {
  it("is empty by default: public behaviour unchanged", () => {
    const shifts = [s("1", "Bar"), s("2", "Accueil", false), s("3", "Caisse", null)]
    expect(assignedOnlyRoles(shifts).size).toBe(0)
    expect(roleAssignedOnly(shifts, "Bar")).toBe(false)
  })

  it("a role is assigned-only as soon as one of its shifts is, so a shift left without it opens nothing", () => {
    const shifts = [s("1", "Caisse"), s("2", "Caisse", true), s("3", "Bar")]
    expect([...assignedOnlyRoles(shifts)]).toEqual(["Caisse"])
    expect(roleAssignedOnly(shifts, "Caisse")).toBe(true)
    expect(roleAssignedOnly(shifts, "Bar")).toBe(false)
  })
})

describe("publicShifts", () => {
  it("returns every shift when no role is assigned-only", () => {
    const shifts = [s("1", "Bar"), s("2", "Accueil")]
    expect(publicShifts(shifts)).toBe(shifts)
  })

  it("drops every shift of an assigned-only role, the unflagged ones too, and keeps the others", () => {
    const shifts = [s("1", "Bar"), s("2", "Caisse", true), s("3", "Caisse"), s("4", "Accueil")]
    expect(publicShifts(shifts).map((x) => x.id)).toEqual(["1", "4"])
  })

  it("leaves nothing to count when every role is assigned-only: no total reveals them", () => {
    const shifts = [{ ...s("1", "Caisse", true), capacity: 4 }, { ...s("2", "Régie", true), capacity: 2 }]
    expect(publicShifts(shifts).reduce((n, x) => n + x.capacity, 0)).toBe(0)
  })
})

describe("asksAssignedOnly", () => {
  it("is true when one asked shift belongs to a hidden role", () => {
    const hidden = new Set(["Caisse"])
    expect(asksAssignedOnly([{ roleName: "Bar" }, { roleName: "Caisse" }], hidden)).toBe(true)
    expect(asksAssignedOnly([{ roleName: "Bar" }], hidden)).toBe(false)
    expect(asksAssignedOnly([{ roleName: "Bar" }], new Set())).toBe(false)
  })
})
