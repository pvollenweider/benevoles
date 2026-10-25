import { describe, it, expect } from "vitest"
import { liveRoleShifts, roleColorOf, roleSettingsOf, type RoleSettingsShift } from "../role-settings"

// The settings of a poste (#1002), read from its live shifts for a shift created in it or moved to it.
const shift = (patch: Partial<RoleSettingsShift> = {}): RoleSettingsShift => ({
  roleName: "Bar", colorKey: null, maxPerVolunteer: null, reservedTags: [], overlapAllowed: false, assignedOnly: false, displayOrder: 0, updatedAt: "2026-07-01T10:00:00Z", ...patch,
})

describe("roleSettingsOf", () => {
  it("returns null for a poste without live shift: a new poste keeps the defaults", () => {
    expect(roleSettingsOf([], "Bar")).toBeNull()
    expect(roleSettingsOf([shift({ roleName: "Accueil", colorKey: "amber" })], "Bar")).toBeNull()
  })

  it("returns the poste's values when its shifts agree, ignoring other postes", () => {
    const set = { colorKey: "teal", maxPerVolunteer: 2, reservedTags: ["sécurité"], overlapAllowed: true, assignedOnly: true, displayOrder: 300 }
    expect(roleSettingsOf([shift(set), shift(set), shift({ roleName: "Accueil", colorKey: "rose", displayOrder: 0 })], "Bar")).toEqual(set)
  })

  it("returns the defaults for a poste whose shifts have none set", () => {
    expect(roleSettingsOf([shift()], "Bar")).toEqual({ colorKey: null, maxPerVolunteer: null, reservedTags: [], overlapAllowed: false, assignedOnly: false, displayOrder: 0 })
  })

  describe("mixed values (shifts added before #1002)", () => {
    it("limit per volunteer: the smallest one set, as sign-up enforces it", () => {
      expect(roleSettingsOf([shift({ maxPerVolunteer: 3 }), shift(), shift({ maxPerVolunteer: 2 })], "Bar")?.maxPerVolunteer).toBe(2)
    })

    it("reserved access: every tag set on any shift, as sign-up enforces it", () => {
      expect(roleSettingsOf([shift({ reservedTags: ["sécurité"] }), shift(), shift({ reservedTags: ["Sécurité", "secours"] })], "Bar")?.reservedTags)
        .toEqual(["sécurité", "secours"])
    })

    it("cumulable: only when every shift is", () => {
      expect(roleSettingsOf([shift({ overlapAllowed: true }), shift()], "Bar")?.overlapAllowed).toBe(false)
      expect(roleSettingsOf([shift({ overlapAllowed: true }), shift({ overlapAllowed: true })], "Bar")?.overlapAllowed).toBe(true)
    })

    it("assigned by the organisation only (#1145): as soon as one shift is, as sign-up enforces it", () => {
      expect(roleSettingsOf([shift(), shift({ assignedOnly: true })], "Bar")?.assignedOnly).toBe(true)
      expect(roleSettingsOf([shift(), shift({ assignedOnly: null })], "Bar")?.assignedOnly).toBe(false)
      expect(roleSettingsOf([shift(), shift({ roleName: "Accueil", assignedOnly: true })], "Bar")?.assignedOnly).toBe(false)
    })

    it("order: the smallest displayOrder, as the timelines order postes", () => {
      expect(roleSettingsOf([shift({ displayOrder: 300 }), shift({ displayOrder: 200 })], "Bar")?.displayOrder).toBe(200)
    })

    it("colour: the colour set on most shifts, shifts without colour ignored", () => {
      expect(roleSettingsOf([shift(), shift(), shift(), shift({ colorKey: "teal" })], "Bar")?.colorKey).toBe("teal")
      expect(roleSettingsOf([shift({ colorKey: "rose" }), shift({ colorKey: "teal" }), shift({ colorKey: "teal" })], "Bar")?.colorKey).toBe("teal")
    })
  })
})

describe("roleColorOf: deterministic on a tie", () => {
  it("takes the most recently updated of the tied colours", () => {
    expect(roleColorOf([
      shift({ colorKey: "rose", updatedAt: "2026-07-02T10:00:00Z" }),
      shift({ colorKey: "teal", updatedAt: "2026-07-03T10:00:00Z" }),
    ])).toBe("teal")
    expect(roleColorOf([
      shift({ colorKey: "rose", updatedAt: new Date("2026-07-04T10:00:00Z") }),
      shift({ colorKey: "teal", updatedAt: new Date("2026-07-03T10:00:00Z") }),
    ])).toBe("rose")
  })

  it("a more recent colour does not beat a more common one", () => {
    expect(roleColorOf([
      shift({ colorKey: "rose" }), shift({ colorKey: "rose" }),
      shift({ colorKey: "teal", updatedAt: "2026-08-01T10:00:00Z" }),
    ])).toBe("rose")
  })

  it("then the first key in alphabetical order, whatever the order of the shifts", () => {
    const a = shift({ colorKey: "teal" })
    const b = shift({ colorKey: "amber" })
    expect(roleColorOf([a, b])).toBe("amber")
    expect(roleColorOf([b, a])).toBe("amber")
  })

  it("is null when no shift has a colour", () => {
    expect(roleColorOf([shift(), shift({ colorKey: "" })])).toBeNull()
  })
})

describe("liveRoleShifts", () => {
  it("reads the poste's shifts on the event, cancelled ones left out", () => {
    expect(liveRoleShifts("evt-a", "Bar")).toEqual({ eventId: "evt-a", roleName: "Bar", status: { not: "cancelled" } })
  })
})
