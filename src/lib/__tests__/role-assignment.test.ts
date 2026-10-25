import { describe, it, expect } from "vitest"
import { assignedOnlyRoles, asksAssignedOnly, publicShifts, roleAssignedOnly, rosterShifts } from "../role-assignment"
import { findOverlap, overlapWithExisting } from "../signup-eligibility"

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

describe("rosterShifts (#1068 roster)", () => {
  it("shows public shifts, and a hidden role's shifts only to a volunteer on them", () => {
    const shifts = [s("1", "Bar"), s("2", "Caisse", true), s("3", "Caisse")]
    expect(rosterShifts(shifts, new Set()).map((x) => x.id)).toEqual(["1"])
    expect(rosterShifts(shifts, new Set(["2"])).map((x) => x.id)).toEqual(["1", "2"])
  })
})

describe("overlap with a hidden assignment", () => {
  const at = (startTime: string, endTime: string) => ({ date: "2030-06-01", startTime, endTime })
  it("is found, but not named", () => {
    const existing = [{ shift: { ...at("10:00", "12:00"), label: "Caisse", assignedOnly: true } }]
    const clash = findOverlap(existing, [at("11:00", "13:00")])
    expect(clash).toEqual({ label: null })
    expect(overlapWithExisting(clash!.label).body.error).toBe("Ce créneau chevauche une inscription existante.")
    expect(findOverlap([{ shift: { ...at("10:00", "12:00"), label: "Bar" } }], [at("11:00", "13:00")])).toEqual({ label: "Bar" })
  })
})
