import { describe, it, expect } from "vitest"
import {
  addConflictMessage,
  cancelAnnouncement,
  filterRegistrations,
  fmtHour,
  leaderAnnouncement,
  leaderRoleOptions,
  overlappingShiftIds,
  resendAnnouncement,
  shiftsOfEmail,
  type ShiftRef,
} from "../registrations-list"

const shift = (id: string, over: Partial<ShiftRef> = {}): ShiftRef => ({
  id, roleName: "Bar", label: "Bar", date: "2030-06-01", startTime: "10:00", endTime: "12:00", capacity: 5, registrationCount: 0, ...over,
})
const reg = (id: string, s: ShiftRef, v: { id: string; first: string; last: string; email: string | null }) => ({
  id, shift: s, volunteer: { id: v.id, firstName: v.first, lastName: v.last, email: v.email },
})

const bar = shift("s-bar")
const accueil = shift("s-acc", { roleName: "Accueil", label: "Accueil", startTime: "11:00", endTime: "13:00" })
const late = shift("s-late", { startTime: "14:00", endTime: "16:00" })
const alice = { id: "v1", first: "Alice", last: "Martin", email: "alice@x.ch" }
const bob = { id: "v2", first: "Bob", last: "Durand", email: null }
const regs = [reg("r1", bar, alice), reg("r2", accueil, alice), reg("r3", late, bob)]

describe("filterRegistrations", () => {
  it("by name or email, case-insensitive", () => {
    expect(filterRegistrations(regs, { search: "MARTIN", role: "", shiftId: "" }).map((r) => r.id)).toEqual(["r1", "r2"])
    expect(filterRegistrations(regs, { search: "alice@", role: "", shiftId: "" })).toHaveLength(2)
  })

  it("by role and by shift, combined with search", () => {
    expect(filterRegistrations(regs, { search: "", role: "Accueil", shiftId: "" }).map((r) => r.id)).toEqual(["r2"])
    expect(filterRegistrations(regs, { search: "bob", role: "Bar", shiftId: "s-late" }).map((r) => r.id)).toEqual(["r3"])
    expect(filterRegistrations(regs, { search: "", role: "", shiftId: "" })).toHaveLength(3)
  })
})

describe("adding someone by hand", () => {
  it("finds the shifts of an email, normalized", () => {
    expect(shiftsOfEmail(regs, " ALICE@x.ch ")?.map((s) => s.id)).toEqual(["s-bar", "s-acc"])
    expect(shiftsOfEmail(regs, "nobody@x.ch")).toBeUndefined()
    expect(shiftsOfEmail(regs, "")).toBeUndefined()
  })

  it("explains a duplicate or an overlap", () => {
    const held = [bar]
    expect(addConflictMessage(bar, held)).toContain("déjà inscrit à ce créneau")
    expect(addConflictMessage(accueil, held)).toContain("plage horaire")
    expect(addConflictMessage(late, held)).toBeNull()
    expect(addConflictMessage(null, held)).toBeNull()
  })

  it("marks overlapping shifts, not the ones already held", () => {
    expect(overlappingShiftIds([bar, accueil, late], [bar])).toEqual(new Set(["s-acc"]))
    expect(overlappingShiftIds([bar, accueil], undefined)).toEqual(new Set())
  })
})

describe("leaders and announcements", () => {
  it("roles a volunteer can lead", () => {
    expect(leaderRoleOptions(regs, "v1")).toEqual(["Bar", "Accueil"])
  })

  it("formats hours", () => {
    expect(fmtHour("10:00")).toBe("10h")
    expect(fmtHour("09:30")).toBe("9h30")
  })

  it("bulk messages, singular and plural", () => {
    expect(cancelAnnouncement(1, 0)).toBe("1 bénévole retiré.")
    expect(cancelAnnouncement(2, 1)).toBe("2 bénévoles retirés, 1 échec.")
    expect(leaderAnnouncement(2, 0, 1)).toBe("2 responsables ajoutés. 1 ignoré (pas d'email).")
    expect(leaderAnnouncement(0, 3, 0)).toBe("3 échecs.")
    expect(resendAnnouncement(1, 0)).toBe("Lien renvoyé à 1 bénévole.")
    expect(resendAnnouncement(3, 2)).toBe("Lien renvoyé à 3 bénévoles, 2 échecs.")
  })
})
