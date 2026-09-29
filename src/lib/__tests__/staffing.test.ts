import { describe, it, expect } from "vitest"
import { staffingHeadline, staffingSummary, type StaffingShift } from "../staffing"

const shift = (over: Partial<StaffingShift> & { id: string }): StaffingShift => ({
  roleName: "Bar", label: "Bar", date: "2026-07-04", startTime: "10:00", endTime: "12:00",
  capacity: 3, active: 0, waiting: 0, closed: false, ...over,
})

const shifts = [
  shift({ id: "bar1", active: 3 }),                                        // full
  shift({ id: "bar2", startTime: "12:00", endTime: "14:00", active: 1 }), // 2 missing
  shift({ id: "bar3", startTime: "14:00", endTime: "16:00", active: 3, waiting: 2 }), // full, waitlist
  shift({ id: "acc1", roleName: "Accueil", capacity: 2, active: 0 }),     // empty role, 2 missing
  shift({ id: "acc2", roleName: "Accueil", date: "2026-07-05", capacity: 4, active: 0 }), // 4 missing
  shift({ id: "cai1", roleName: "Caisse", capacity: 2, active: 0, closed: true }), // closed: not counted
]

describe("staffingSummary", () => {
  const s = staffingSummary(shifts, ["Bar"])

  it("lists roles with nobody, with their shift count and capacity", () => {
    expect(s.emptyRoles).toEqual([
      { roleName: "Accueil", shiftCount: 2, capacity: 6 },
      { roleName: "Caisse", shiftCount: 1, capacity: 2 },
    ])
  })

  it("orders under-filled shifts by people missing, then date; closed shifts left out", () => {
    expect(s.underfilled.map((x) => [x.id, x.missing])).toEqual([["acc2", 4], ["acc1", 2], ["bar2", 2]])
  })

  it("groups full and waitlisted shifts, a shift in one group only", () => {
    expect(s.full.map((x) => x.id)).toEqual(["bar1"])
    expect(s.waitlisted.map((x) => [x.id, x.waiting])).toEqual([["bar3", 2]])
  })

  it("names roles without a sector leader", () => {
    expect(s.rolesWithoutLeader).toEqual(["Accueil", "Caisse"])
    expect(s.usesLeaders).toBe(true)
    expect(staffingSummary(shifts, []).usesLeaders).toBe(false)
  })

  it("totals people and spots, closed shifts not counted as missing", () => {
    expect(s.totals).toEqual({ shifts: 6, capacity: 17, active: 7, missing: 8, waiting: 2 })
  })

  it("handles an event without shifts", () => {
    const e = staffingSummary([], [])
    expect(e.emptyRoles).toEqual([])
    expect(e.totals.missing).toBe(0)
  })
})

describe("staffingHeadline", () => {
  it("says what's missing, or that everything is full", () => {
    expect(staffingHeadline({ shifts: 0, capacity: 0, active: 0, missing: 0, waiting: 0 })).toBe("Aucun créneau pour l'instant.")
    expect(staffingHeadline({ shifts: 2, capacity: 4, active: 4, missing: 0, waiting: 0 })).toBe("Tous les créneaux sont complets.")
    expect(staffingHeadline({ shifts: 7, capacity: 20, active: 8, missing: 12, waiting: 0 })).toBe("Il manque encore 12 personnes sur 20 places (7 créneaux).")
    expect(staffingHeadline({ shifts: 1, capacity: 1, active: 0, missing: 1, waiting: 0 })).toBe("Il manque encore 1 personne sur 1 place (1 créneau).")
  })
})
