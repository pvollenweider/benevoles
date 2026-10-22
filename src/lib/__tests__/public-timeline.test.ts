import { describe, it, expect } from "vitest"
import { roleLimitReachedText } from "../role-limit"
import { barText, heldKinds, type BarTextInput, type HeldKind, type TimelineShift } from "../public-timeline"

const shift = (over: Partial<TimelineShift> = {}): TimelineShift => ({
  id: "a", roleName: "Bar", label: "Bar", startTime: "10:00", endTime: "12:00", status: "open", capacity: 5, registered: 2, spotsLeft: 3, ...over,
})
const text = (over: Partial<BarTextInput> = {}) => barText({ shift: shift(), selected: false, reserved: false, locked: false, ...over })

// A shift the visitor already holds is named and tagged as theirs (#534), never offered.
describe("barText for a held shift", () => {
  const cases: [HeldKind, string, string][] = [
    ["active", "10h–12h, Bar : inscription confirmée", "Ton créneau"],
    ["requested", "10h–12h, Bar : demande envoyée, en attente de validation", "Demande envoyée"],
    ["waiting", "10h–12h, Bar : en liste d'attente", "En liste d'attente"],
    ["offered", "10h–12h, Bar : place proposée, à accepter sur ta page personnelle", "Place proposée"],
  ]
  for (const [held, name, tag] of cases) {
    it(`names and tags a ${held} shift`, () => {
      const t = text({ held })
      expect(t.ariaLabel).toBe(name)
      expect(t.tag).toBe(tag)
    })
  }

  it("wins over selected, reserved and locked", () => {
    expect(text({ held: "active", selected: true }).ariaLabel).toBe("10h–12h, Bar : inscription confirmée")
    expect(text({ held: "active", reserved: true }).ariaLabel).toBe("10h–12h, Bar : inscription confirmée")
    expect(text({ held: "active", locked: true }).ariaLabel).toBe("10h–12h, Bar : inscription confirmée")
    expect(text({ held: "active", limitReached: 2 }).ariaLabel).toBe("10h–12h, Bar : inscription confirmée")
  })

  it("says « inscription confirmée » on a full shift, not « Complet » or the waitlist", () => {
    const full = text({ held: "active", shift: shift({ status: "full", spotsLeft: 0, registered: 5 }) })
    expect(full.ariaLabel).toBe("10h–12h, Bar : inscription confirmée")
    expect(`${full.tag} ${full.subLabel ?? ""}`).not.toMatch(/Complet/)
    const waitlist = text({ held: "waiting", shift: shift({ status: "full", waitlistEnabled: true, spotsLeft: 0 }) })
    expect(waitlist.ariaLabel).toBe("10h–12h, Bar : en liste d'attente")
    expect(waitlist.subLabel).toBeNull()
  })

  it("never offers to select, deselect or queue", () => {
    for (const held of ["active", "requested", "waiting", "offered"] as HeldKind[]) {
      for (const selected of [true, false]) {
        expect(text({ held, selected }).ariaLabel).not.toMatch(/(dé)?sélectionner|file d'attente/i)
      }
    }
  })

  it("keeps the shift's own label and spells out an overnight shift", () => {
    const t = text({ held: "active", shift: shift({ roleName: "Accueil", label: "Entrée nord", startTime: "22:00", endTime: "02:00" }) })
    expect(t.ariaLabel).toBe("22h–02h +1 (jusqu'au lendemain), Accueil (Entrée nord) : inscription confirmée")
    expect(t.subLabel).toBe("Entrée nord")
  })

  it("uses no inclusive middle dot in names or tags", () => {
    for (const held of ["active", "requested", "waiting", "offered"] as HeldKind[]) {
      const t = text({ held, shift: shift({ requiresApproval: true, minAge: 18 }) })
      expect(t.ariaLabel).not.toMatch(/\p{L}·\p{L}/u)
      expect(t.tag).not.toMatch(/·/)
    }
  })
})

// Unchanged wording for everything else, moved out of DayTimeline.
describe("barText for a shift not held", () => {
  it("offers an open shift with its free places", () => {
    const t = text()
    expect(t.ariaLabel).toBe("10h–12h 2/5, Bar : sélectionner (3 places libres sur 5)")
    expect(t.tag).toBeNull()
    expect(t.subLabel).toBeNull()
  })

  it("offers to deselect a selected shift", () => {
    expect(text({ selected: true }).ariaLabel).toBe("10h–12h 2/5, Bar : désélectionner (3 places libres sur 5)")
  })

  it("offers the waitlist of a full shift and says so under the bar", () => {
    const t = text({ shift: shift({ status: "full", waitlistEnabled: true, spotsLeft: 0 }) })
    expect(t.ariaLabel).toBe("10h–12h 2/5, Bar : rejoindre la file d'attente")
    expect(t.subLabel).toBe("Complet · file d'attente")
    expect(text({ selected: true, shift: shift({ status: "full", waitlistEnabled: true }) }).ariaLabel).toBe("En attente 2/5, Bar 10h–12h : retirer de la file d'attente")
  })

  it("says a reserved shift is reserved, with no action verb", () => {
    expect(text({ reserved: true }).ariaLabel).toBe("Réservé, Bar 10h–12h : réservé à certains membres")
  })

  it("drops the action verb when locked, and the limit only on bars not selected", () => {
    expect(text({ locked: true, shift: shift({ minAge: 16 }) }).ariaLabel).toBe("10h–12h 2/5, Bar (16 ans minimum) (3 places libres sur 5) : inscriptions fermées")
    expect(text({ limitReached: 2 }).ariaLabel).toMatch(/\(limite de 2 créneaux par personne atteinte\)$/)
    expect(text({ limitReached: 2, selected: true }).ariaLabel).not.toMatch(/limite/)
  })

  it("lists label, age and approval under the bar", () => {
    const t = text({ shift: shift({ label: "Caisse", minAge: 18, requiresApproval: true }) })
    expect(t.subLabel).toBe("Caisse · 18+ · Sur validation")
    expect(t.ariaLabel).toBe("10h–12h 2/5, Bar (Caisse) (18 ans minimum) (sur validation) : sélectionner (3 places libres sur 5)")
  })
})

describe("heldKinds", () => {
  it("maps each live registration to its shift, and ignores other statuses", () => {
    const held = heldKinds([
      { shiftId: "a", status: "active" },
      { shiftId: "b", status: "requested" },
      { shiftId: "c", status: "waiting" },
      { shiftId: "d", status: "offered" },
      { shiftId: "e", status: "cancelled" },
    ])
    expect([...held]).toEqual([["a", "active"], ["b", "requested"], ["c", "waiting"], ["d", "offered"]])
  })
})

// #808 review: a bar overlapping a chosen shift is disabled, its name must not offer to select it.
describe("barText for a conflicting shift", () => {
  it("says why it can't be chosen, and keeps « Complet » when full", () => {
    const shift = { id: "s", roleName: "Bar", label: "Bar", startTime: "10:00", endTime: "12:00", status: "open", capacity: 3, registered: 1, spotsLeft: 2 }
    expect(barText({ shift, selected: false, reserved: false, locked: false, conflict: true }).ariaLabel).toBe("10h–12h 1/3, Bar : chevauche un créneau déjà choisi")
    expect(barText({ shift: { ...shift, status: "full", registered: 3, spotsLeft: 0 }, selected: false, reserved: false, locked: false, conflict: true }).ariaLabel).toBe("Complet, Bar 10h–12h")
  })
})

// The role's limit per person reached (#466): said under the bar too, not only in its name (#1023).
describe("barText when the role's limit per person is reached", () => {
  it("words the limit, singular and plural", () => {
    expect(roleLimitReachedText(1)).toBe("Limite de 1 créneau par personne atteinte")
    expect(roleLimitReachedText(2)).toBe("Limite de 2 créneaux par personne atteinte")
  })

  it("shows the limit first under the bar, with the same words as the name", () => {
    const t = text({ limitReached: 2 })
    expect(t.tag).toBe("Limite de 2 créneaux par personne atteinte")
    expect(t.tagShort).toBe("Limite atteinte")
    expect(t.subLabel).toBeNull()
    expect(t.ariaLabel).toBe("10h–12h 2/5, Bar : sélectionner (3 places libres sur 5) (limite de 2 créneaux par personne atteinte)")
  })

  it("says nothing when the limit is not reached", () => {
    const t = text()
    expect(t.tag).toBeNull()
    expect(t.tagShort).toBeNull()
    expect(t.ariaLabel).not.toMatch(/limite/i)
  })

  it("keeps the bar's own details after the limit", () => {
    const t = text({ limitReached: 2, shift: shift({ minAge: 18 }) })
    expect(t.tag).toBe("Limite de 2 créneaux par personne atteinte")
    expect(t.subLabel).toBe("18+")
    const waitlist = text({ limitReached: 2, shift: shift({ status: "full", waitlistEnabled: true, spotsLeft: 0 }) })
    expect(waitlist.tag).toBe("Limite de 2 créneaux par personne atteinte")
    expect(waitlist.subLabel).toBe("Complet · file d'attente")
    expect(waitlist.ariaLabel).toBe("10h–12h 2/5, Bar : rejoindre la file d'attente (limite de 2 créneaux par personne atteinte)")
  })

  it("gives way to a reason the bar already shows: selected, held, full, closed, reserved, conflict, locked", () => {
    const others: Partial<BarTextInput>[] = [
      { selected: true },
      { held: "active" },
      { shift: shift({ status: "full", spotsLeft: 0 }) },
      { shift: shift({ status: "closed" }) },
      { reserved: true },
      { conflict: true },
      { locked: true },
    ]
    for (const over of others) {
      const t = text({ limitReached: 2, ...over })
      expect(t.tag ?? "", JSON.stringify(over)).not.toMatch(/Limite/)
      expect(t.tagShort, JSON.stringify(over)).toBeNull()
      expect(t.ariaLabel, JSON.stringify(over)).not.toMatch(/limite/i)
    }
  })

  it("shows the tag exactly when the name says the limit", () => {
    const states: Partial<BarTextInput>[] = [{}, { selected: true }, { held: "waiting" }, { reserved: true }, { conflict: true }, { locked: true },
      { shift: shift({ status: "full", waitlistEnabled: true, spotsLeft: 0 }) }, { shift: shift({ status: "closed" }) }]
    for (const over of states) {
      const t = text({ limitReached: 3, ...over })
      expect(t.tag === roleLimitReachedText(3), JSON.stringify(over)).toBe(t.ariaLabel.endsWith("(limite de 3 créneaux par personne atteinte)"))
    }
  })
})
